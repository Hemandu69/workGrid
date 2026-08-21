export type SupervisoryPosition = 1 | 3 | 5;
export const AVAILABLE_SUPERVISORY_SLOTS: readonly SupervisoryPosition[] = [1, 3, 5] as const;

export interface SupervisoryServerInput {
  id: string;
  name: string;
  presenceState: 'IN' | 'OUT' | 'UNKNOWN';
  /**
   * Stable supervisory identity / preferred home slot.
   * S1 → 1, S2 → 3, S3 → 5. This is NOT the current assigned operational position.
   */
  preferredSlot?: SupervisoryPosition;
}

export interface CalculatedServerPosition<T extends SupervisoryServerInput> {
  server: T;
  position: SupervisoryPosition;
}

/**
 * Calculates dynamic server supervisory positions [1, 3, 5] based on present servers
 * and compaction / replacement rules.
 *
 * preferredSlot = server identity (S1/S2/S3)
 * returned position = current operational assignedPosition
 *
 * Rules (by which preferred identities are currently IN):
 * 1. All three (S1,S2,S3) → P1, P3, P5
 * 2. S1 OUT, S2+S3 IN → S2=P1, S3=P3   (compact / replace missing first)
 * 3. S2 OUT, S1+S3 IN → S1=P1, S3=P5   (preserve P5 when middle absent)
 * 4. S3 OUT, S1+S2 IN → S1=P1, S2=P3
 * 5. Only one IN → that server = P1
 * 6. None IN → []
 */
export function calculateServerPositions<T extends SupervisoryServerInput>(
  configuredServers: T[]
): CalculatedServerPosition<T>[] {
  if (!configuredServers || configuredServers.length === 0) {
    return [];
  }

  // Resolve each server's stable identity (preferred slot). A server with no
  // preferredSlot (or whose slot is already claimed by another server) has no
  // primary identity — it is only ever seated via the extras pool below, never
  // guessed from array position (that would risk colliding with — and silently
  // stealing — another server's real preferred identity).
  const withIdentity = configuredServers.map((server) => ({
    server,
    preferredSlot: server.preferredSlot,
    isPresent: server.presenceState === 'IN',
  }));

  // One primary server per preferred identity (first wins if duplicates exist)
  const byPreferred = new Map<SupervisoryPosition, (typeof withIdentity)[number]>();
  for (const item of withIdentity) {
    if (item.preferredSlot !== undefined && !byPreferred.has(item.preferredSlot)) {
      byPreferred.set(item.preferredSlot, item);
    }
  }

  const presentS1 = byPreferred.get(1)?.isPresent ? byPreferred.get(1) : undefined;
  const presentS2 = byPreferred.get(3)?.isPresent ? byPreferred.get(3) : undefined;
  const presentS3 = byPreferred.get(5)?.isPresent ? byPreferred.get(5) : undefined;

  // Extra present servers beyond the primary S1/S2/S3 identities (e.g. 4th server)
  const primaryIds = new Set(
    [presentS1, presentS2, presentS3].filter(Boolean).map((p) => p!.server.id)
  );
  const extrasPresent = withIdentity.filter(
    (item) => item.isPresent && !primaryIds.has(item.server.id)
  );

  // --- Identity-based assignment ---
  let assigned: CalculatedServerPosition<T>[] = [];

  if (presentS1 && presentS2 && presentS3) {
    // CASE 1: three present
    assigned = [
      { server: presentS1.server, position: 1 },
      { server: presentS2.server, position: 3 },
      { server: presentS3.server, position: 5 },
    ];
  } else if (presentS1 && presentS2 && !presentS3) {
    // CASE 4 / 10: S3 out → P1, P3
    assigned = [
      { server: presentS1.server, position: 1 },
      { server: presentS2.server, position: 3 },
    ];
  } else if (presentS1 && !presentS2 && presentS3) {
    // CASE 3 / 5 / 9: middle absent — keep S3 at P5 (do NOT compact to P3)
    assigned = [
      { server: presentS1.server, position: 1 },
      { server: presentS3.server, position: 5 },
    ];
  } else if (!presentS1 && presentS2 && presentS3) {
    // CASE 2 / 6 / 8: first absent — compact S2→P1, S3→P3
    assigned = [
      { server: presentS2.server, position: 1 },
      { server: presentS3.server, position: 3 },
    ];
  } else if (presentS1 && !presentS2 && !presentS3) {
    assigned = [{ server: presentS1.server, position: 1 }];
  } else if (!presentS1 && presentS2 && !presentS3) {
    assigned = [{ server: presentS2.server, position: 1 }];
  } else if (!presentS1 && !presentS2 && presentS3) {
    assigned = [{ server: presentS3.server, position: 1 }];
  } else if (extrasPresent.length > 0) {
    // No primary identities present — compact extras into 1, 3, 5
    assigned = extrasPresent.slice(0, 3).map((item, idx) => ({
      server: item.server,
      position: AVAILABLE_SUPERVISORY_SLOTS[idx]!,
    }));
  }

  // Seat remaining extras into unused slots (section with >3 servers)
  if (extrasPresent.length > 0 && assigned.length > 0 && assigned.length < 3) {
    const usedIds = new Set(assigned.map((a) => a.server.id));
    const usedSeats = new Set(assigned.map((a) => a.position));
    const freeSeats = AVAILABLE_SUPERVISORY_SLOTS.filter((s) => !usedSeats.has(s));
    for (const extra of extrasPresent) {
      if (freeSeats.length === 0) break;
      if (usedIds.has(extra.server.id)) continue;
      assigned.push({ server: extra.server, position: freeSeats.shift()! });
    }
  }

  return assigned;
}
