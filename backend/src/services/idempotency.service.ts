import { getRedisClient } from '../redis/client.js';

const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60; // 24h — covers a realistic "closed the tab, retried later" window without unbounded Redis growth.

export interface IdempotencyClaim {
  /** true when this call should execute the handler (either it holds the lock, or Redis was unreachable and we fail open). */
  acquired: boolean;
  /** present when acquired=false and a prior attempt already finished — replay this instead of re-running. */
  replay?: { statusCode: number; body: unknown };
}

function buildKey(organizationId: string, userId: string, routeKey: string, clientKey: string): string {
  return `idem:${organizationId}:${userId}:${routeKey}:${clientKey}`;
}

/**
 * Request-deduplication for mutation endpoints, keyed by a client-generated
 * `Idempotency-Key` header. A Bloom-filter-style safety trade-off is
 * deliberately NOT used here — this must never produce a false "not seen
 * before" for a genuine duplicate, so Redis is the single source of truth
 * for whether a key has been claimed.
 *
 * Design:
 *  - claim(): atomic SET NX EX. If we win the race, the caller runs its
 *    mutation. If we lose it, we look at what's stored: a completed entry is
 *    replayed verbatim (no re-execution); a still-pending entry means a
 *    genuine concurrent duplicate in flight, so the caller gets a 409.
 *  - complete(): overwrite with the final response so a later retry (after
 *    the client never received the first response, e.g. a timeout) replays
 *    it instead of creating a second row.
 *  - release(): delete the key on an unexpected error so a genuine retry
 *    isn't poisoned for the full TTL.
 *
 * If Redis is unreachable, claim() fails open (acquired: true) — the
 * dedupe safety net degrading never blocks the underlying mutation from
 * working, since the mutation's own correctness doesn't depend on Redis.
 */
export class IdempotencyService {
  static async claim(
    organizationId: string,
    userId: string,
    routeKey: string,
    clientKey: string
  ): Promise<IdempotencyClaim> {
    const key = buildKey(organizationId, userId, routeKey, clientKey);
    try {
      const redis = getRedisClient();
      if (redis.status === 'wait') await redis.connect().catch(() => null);

      const claimed = await redis.set(key, JSON.stringify({ status: 'pending' }), 'EX', IDEMPOTENCY_TTL_SECONDS, 'NX');
      if (claimed === 'OK') return { acquired: true };

      const existingRaw = await redis.get(key);
      if (!existingRaw) return { acquired: true }; // lost the race to a TTL expiry between SET and GET — safe to proceed

      const existing = JSON.parse(existingRaw);
      if (existing.status === 'completed') {
        return { acquired: false, replay: { statusCode: existing.statusCode, body: existing.body } };
      }
      return { acquired: false };
    } catch {
      return { acquired: true };
    }
  }

  static async complete(
    organizationId: string,
    userId: string,
    routeKey: string,
    clientKey: string,
    statusCode: number,
    body: unknown
  ): Promise<void> {
    const key = buildKey(organizationId, userId, routeKey, clientKey);
    try {
      const redis = getRedisClient();
      await redis.set(key, JSON.stringify({ status: 'completed', statusCode, body }), 'EX', IDEMPOTENCY_TTL_SECONDS, 'XX');
    } catch {
      // Best-effort — if Redis is unreachable here, claim() already failed
      // open for this attempt, so a lost completion has no correctness impact.
    }
  }

  static async release(organizationId: string, userId: string, routeKey: string, clientKey: string): Promise<void> {
    const key = buildKey(organizationId, userId, routeKey, clientKey);
    try {
      await getRedisClient().del(key);
    } catch {
      // Best-effort; a leaked pending key just means a retry within the TTL sees a 409 instead of re-executing.
    }
  }
}
