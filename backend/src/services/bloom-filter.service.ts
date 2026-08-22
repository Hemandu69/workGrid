import crypto from 'crypto';
import { getRedisClient } from '../redis/client.js';
import { prisma } from '../db/client.js';

const BLOOM_KEY = 'bloom:emails';

// Sized for n=100,000 emails at a 1% target false-positive rate:
//   m = -(n * ln(p)) / (ln(2))^2 ≈ 958,506 bits, rounded up to a byte-aligned
//   960,000 bits (120,000 bytes) — a trivial amount of Redis memory even at
//   this generous headroom.
//   k = (m/n) * ln(2) ≈ 6.64, rounded to 7 hash indices via double hashing.
const M_BITS = 960_000;
const K_HASHES = 7;

/** Derives K_HASHES bit indices from one sha256 digest via double hashing (Kirsch-Mitzenmacher) — avoids needing K separate hash functions. */
function bitIndices(normalizedEmail: string): number[] {
  const digest = crypto.createHash('sha256').update(normalizedEmail).digest();
  const h1 = digest.readUInt32BE(0);
  const h2 = digest.readUInt32BE(4);
  const indices: number[] = [];
  for (let i = 0; i < K_HASHES; i++) {
    indices.push(((h1 + i * h2) >>> 0) % M_BITS);
  }
  return indices;
}

/**
 * A Bloom filter is an optimization, never the source of truth — PostgreSQL's
 * `email @unique` constraint remains authoritative for uniqueness. This
 * filter only lets an availability check skip a Postgres round trip when it
 * can PROVE an email was never registered.
 *
 * The zero-false-negative guarantee comes from the algorithm itself (every
 * bit for a real email is always set before that email could be "found"
 * absent), not from any library — a false positive (bits set for an email
 * that was never added) is acceptable and expected at the target rate, a
 * false negative is not and cannot happen by construction.
 */
export class BloomFilterService {
  /** true = definitely never registered (safe to skip Postgres). false = maybe registered, or Redis is unreachable (must check Postgres). */
  static async definitelyAbsent(normalizedEmail: string): Promise<boolean> {
    try {
      const redis = getRedisClient();
      if (redis.status === 'wait') await redis.connect().catch(() => null);

      const pipeline = redis.pipeline();
      for (const bit of bitIndices(normalizedEmail)) pipeline.getbit(BLOOM_KEY, bit);
      const results = await pipeline.exec();
      if (!results) return false; // Redis unreachable — never trust an unreadable filter, always fall through to Postgres

      // A connection failure surfaces as a per-command error in the pipeline
      // results rather than exec() rejecting — that must NEVER be read as a
      // 0 bit (definitely absent), or a real connection outage would report
      // an existing email as available. Any error anywhere in the batch
      // means the filter result as a whole cannot be trusted this round.
      if (results.some(([err]) => err)) return false;

      return results.some(([, val]) => val === 0); // no errors, and any 0 bit => definitely absent
    } catch {
      return false;
    }
  }

  /** Best-effort — a missed add only costs one unnecessary future Postgres lookup for that email, never a false negative. */
  static async add(normalizedEmail: string): Promise<void> {
    try {
      const redis = getRedisClient();
      if (redis.status === 'wait') await redis.connect().catch(() => null);

      const pipeline = redis.pipeline();
      for (const bit of bitIndices(normalizedEmail)) pipeline.setbit(BLOOM_KEY, bit, 1);
      await pipeline.exec();
    } catch {
      // Best-effort.
    }
  }

  /**
   * One-time, paginated sync from existing User.email rows — fired once at
   * startup without blocking server listen. Idempotent (safe to re-run):
   * setting an already-set bit is a no-op.
   */
  static async backfill(): Promise<void> {
    try {
      const redis = getRedisClient();
      if (redis.status === 'wait') await redis.connect().catch(() => null);

      const BATCH_SIZE = 1000;
      let cursor: string | undefined;
      for (;;) {
        const batch = await prisma.user.findMany({
          select: { id: true, email: true },
          take: BATCH_SIZE,
          orderBy: { id: 'asc' },
          ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        });
        if (batch.length === 0) break;

        const pipeline = redis.pipeline();
        for (const u of batch) {
          for (const bit of bitIndices(u.email)) pipeline.setbit(BLOOM_KEY, bit, 1);
        }
        await pipeline.exec();

        cursor = batch[batch.length - 1].id;
        if (batch.length < BATCH_SIZE) break;
      }
    } catch {
      // Non-fatal — email availability just always falls through to Postgres until this succeeds.
    }
  }
}
