export type SupervisoryPosition = 1 | 3 | 5;
export const AVAILABLE_SUPERVISORY_SLOTS: readonly SupervisoryPosition[] = [1, 3, 5] as const;

export interface SupervisoryServerInput {
  id: string;
  name: string;
  presenceState: 'IN' | 'OUT' | 'UNKNOWN';
  preferredSlot?: SupervisoryPosition;
}

export interface CalculatedServerPosition<T extends SupervisoryServerInput> {
  server: T;
  position: SupervisoryPosition;
}

/**
 * Calculates dynamic server supervisory positions [1, 3, 5] based on present servers and compaction rules.
 *
 * Rules:
 * 1. Each configured supervisory server has a stable preferred slot (Server 0 -> 1, Server 1 -> 3, Server 2 -> 5).
 * 2. Filter to servers currently PRESENT on duty (presenceState === 'IN').
 * 3. All 3 present: [1, 3, 5].
 * 4. 2 servers present:
 *    - If first server (preferred 1) is present:
 *      - Server at index 0 gets 1.
 *      - Server at index 1 gets 3 (if present), or Server at index 2 gets 5 (if present).
 *      (e.g., A + B -> 1, 3; A + C -> 1, 5).
 *    - If first server (preferred 1) is absent (e.g. B + C present):
 *      - Compact remaining servers toward the beginning slots [1, 3]:
 *        Server at index 1 -> 1, Server at index 2 -> 3.
 * 5. 1 server present:
 *    - The single present server compacts to position 1.
 * 6. 0 servers present:
 *    - Returns empty array [].
 */
export function calculateServerPositions<T extends SupervisoryServerInput>(
  configuredServers: T[]
): CalculatedServerPosition<T>[] {
  if (!configuredServers || configuredServers.length === 0) {
    return [];
  }

  // Filter present servers while preserving configured ordering
  const presentWithIndices = configuredServers
    .map((server, index) => ({
      server,
      originalIndex: index,
      preferredSlot: server.preferredSlot ?? AVAILABLE_SUPERVISORY_SLOTS[index] ?? 1,
      isPresent: server.presenceState === 'IN',
    }))
    .filter((item) => item.isPresent);

  if (presentWithIndices.length === 0) {
    return [];
  }

  // Case: Only 1 server present -> compacts to position 1
  if (presentWithIndices.length === 1) {
    return [
      {
        server: presentWithIndices[0].server,
        position: 1,
      },
    ];
  }

  // Case: 2 servers present
  if (presentWithIndices.length === 2) {
    const firstPresent = presentWithIndices[0];
    const secondPresent = presentWithIndices[1];

    // If the first configured server (index 0 / preferred 1) is present
    if (firstPresent.originalIndex === 0 || firstPresent.preferredSlot === 1) {
      return [
        {
          server: firstPresent.server,
          position: 1,
        },
        {
          server: secondPresent.server,
          position: secondPresent.preferredSlot === 5 || secondPresent.originalIndex === 2 ? 5 : 3,
        },
      ];
    }

    // If the first configured server is ABSENT (e.g. index 1 and index 2 are present)
    // Compact remaining servers toward the beginning slots 1 and 3
    return [
      {
        server: firstPresent.server,
        position: 1,
      },
      {
        server: secondPresent.server,
        position: 3,
      },
    ];
  }

  // Case: 3 or more servers present -> sequential assignment to 1, 3, 5
  return [
    { server: presentWithIndices[0].server, position: 1 },
    { server: presentWithIndices[1].server, position: 3 },
    { server: presentWithIndices[2].server, position: 5 },
  ];
}
