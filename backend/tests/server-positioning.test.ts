import { describe, it, expect } from 'vitest';
import { calculateServerPositions, SupervisoryPosition } from '../src/utils/server-positioning.js';

interface TestServer {
  id: string;
  name: string;
  presenceState: 'IN' | 'OUT' | 'UNKNOWN';
  preferredSlot: SupervisoryPosition;
}

describe('Dynamic Server Supervisory Positioning & Compaction Algorithm', () => {
  const serverA: TestServer = { id: 'srv-1', name: 'David Chen', presenceState: 'IN', preferredSlot: 1 };
  const serverB: TestServer = { id: 'srv-2', name: 'Maya Lin', presenceState: 'IN', preferredSlot: 3 };
  const serverC: TestServer = { id: 'srv-3', name: 'Alex Mercer', presenceState: 'IN', preferredSlot: 5 };

  it('Scenario 1: All 3 servers are present -> assigned to positions 1, 3, 5', () => {
    const servers: TestServer[] = [
      { ...serverA, presenceState: 'IN' },
      { ...serverB, presenceState: 'IN' },
      { ...serverC, presenceState: 'IN' },
    ];

    const result = calculateServerPositions(servers);
    expect(result).toHaveLength(3);
    expect(result.map((r) => ({ id: r.server.id, pos: r.position }))).toEqual([
      { id: 'srv-1', pos: 1 },
      { id: 'srv-2', pos: 3 },
      { id: 'srv-3', pos: 5 },
    ]);
  });

  it('Scenario 2: First + Second servers present (third absent) -> positions 1, 3', () => {
    const servers: TestServer[] = [
      { ...serverA, presenceState: 'IN' },
      { ...serverB, presenceState: 'IN' },
      { ...serverC, presenceState: 'OUT' },
    ];

    const result = calculateServerPositions(servers);
    expect(result).toHaveLength(2);
    expect(result.map((r) => ({ id: r.server.id, pos: r.position }))).toEqual([
      { id: 'srv-1', pos: 1 },
      { id: 'srv-2', pos: 3 },
    ]);
  });

  it('Scenario 3: First + Third servers present (middle absent) -> positions 1, 5 (third server does NOT shift to 3)', () => {
    const servers: TestServer[] = [
      { ...serverA, presenceState: 'IN' },
      { ...serverB, presenceState: 'OUT' },
      { ...serverC, presenceState: 'IN' },
    ];

    const result = calculateServerPositions(servers);
    expect(result).toHaveLength(2);
    expect(result.map((r) => ({ id: r.server.id, pos: r.position }))).toEqual([
      { id: 'srv-1', pos: 1 },
      { id: 'srv-3', pos: 5 },
    ]);
  });

  it('Scenario 4: Second + Third servers present (first absent) -> positions 1, 3 (compacted sequentially)', () => {
    const servers: TestServer[] = [
      { ...serverA, presenceState: 'OUT' },
      { ...serverB, presenceState: 'IN' },
      { ...serverC, presenceState: 'IN' },
    ];

    const result = calculateServerPositions(servers);
    expect(result).toHaveLength(2);
    expect(result.map((r) => ({ id: r.server.id, pos: r.position }))).toEqual([
      { id: 'srv-2', pos: 1 },
      { id: 'srv-3', pos: 3 },
    ]);
  });

  it('Scenario 5: Only first server present -> position 1', () => {
    const servers: TestServer[] = [
      { ...serverA, presenceState: 'IN' },
      { ...serverB, presenceState: 'OUT' },
      { ...serverC, presenceState: 'OUT' },
    ];

    const result = calculateServerPositions(servers);
    expect(result).toHaveLength(1);
    expect(result[0].server.id).toBe('srv-1');
    expect(result[0].position).toBe(1);
  });

  it('Scenario 6: Only second server present -> position 1 (compacted)', () => {
    const servers: TestServer[] = [
      { ...serverA, presenceState: 'OUT' },
      { ...serverB, presenceState: 'IN' },
      { ...serverC, presenceState: 'OUT' },
    ];

    const result = calculateServerPositions(servers);
    expect(result).toHaveLength(1);
    expect(result[0].server.id).toBe('srv-2');
    expect(result[0].position).toBe(1);
  });

  it('Scenario 7: Only third server present -> position 1 (compacted)', () => {
    const servers: TestServer[] = [
      { ...serverA, presenceState: 'OUT' },
      { ...serverB, presenceState: 'OUT' },
      { ...serverC, presenceState: 'IN' },
    ];

    const result = calculateServerPositions(servers);
    expect(result).toHaveLength(1);
    expect(result[0].server.id).toBe('srv-3');
    expect(result[0].position).toBe(1);
  });

  it('Scenario 8: No servers present -> empty array []', () => {
    const servers: TestServer[] = [
      { ...serverA, presenceState: 'OUT' },
      { ...serverB, presenceState: 'OUT' },
      { ...serverC, presenceState: 'UNKNOWN' },
    ];

    const result = calculateServerPositions(servers);
    expect(result).toEqual([]);
  });

  it('Scenario 9: Server returns / checks in -> dynamic recalculation from 1 to [1, 3, 5]', () => {
    // Initial: Only server C present -> [Pos 1]
    const step1 = calculateServerPositions([
      { ...serverA, presenceState: 'OUT' },
      { ...serverB, presenceState: 'OUT' },
      { ...serverC, presenceState: 'IN' },
    ]);
    expect(step1).toEqual([{ server: expect.objectContaining({ id: 'srv-3' }), position: 1 }]);

    // Server A checks in -> [Server A: Pos 1, Server C: Pos 5]
    const step2 = calculateServerPositions([
      { ...serverA, presenceState: 'IN' },
      { ...serverB, presenceState: 'OUT' },
      { ...serverC, presenceState: 'IN' },
    ]);
    expect(step2).toEqual([
      { server: expect.objectContaining({ id: 'srv-1' }), position: 1 },
      { server: expect.objectContaining({ id: 'srv-3' }), position: 5 },
    ]);

    // Server B checks in -> [Server A: Pos 1, Server B: Pos 3, Server C: Pos 5]
    const step3 = calculateServerPositions([
      { ...serverA, presenceState: 'IN' },
      { ...serverB, presenceState: 'IN' },
      { ...serverC, presenceState: 'IN' },
    ]);
    expect(step3.map((r) => r.position)).toEqual([1, 3, 5]);
  });

  it('Scenario 10: Server checks out -> dynamic recalculation', () => {
    // Initial: All 3 present
    const step1 = calculateServerPositions([
      { ...serverA, presenceState: 'IN' },
      { ...serverB, presenceState: 'IN' },
      { ...serverC, presenceState: 'IN' },
    ]);
    expect(step1.map((r) => r.position)).toEqual([1, 3, 5]);

    // Server A checks out -> B and C compact to [1, 3]
    const step2 = calculateServerPositions([
      { ...serverA, presenceState: 'OUT' },
      { ...serverB, presenceState: 'IN' },
      { ...serverC, presenceState: 'IN' },
    ]);
    expect(step2).toEqual([
      { server: expect.objectContaining({ id: 'srv-2' }), position: 1 },
      { server: expect.objectContaining({ id: 'srv-3' }), position: 3 },
    ]);
  });

  it('Scenario 11: Regression matrix for all presence combinations', () => {
    const trio = (a: 'IN' | 'OUT', b: 'IN' | 'OUT', c: 'IN' | 'OUT') =>
      calculateServerPositions([
        { ...serverA, presenceState: a },
        { ...serverB, presenceState: b },
        { ...serverC, presenceState: c },
      ]).map((r) => ({ id: r.server.id, pos: r.position }));

    expect(trio('IN', 'IN', 'IN')).toEqual([
      { id: 'srv-1', pos: 1 },
      { id: 'srv-2', pos: 3 },
      { id: 'srv-3', pos: 5 },
    ]);
    expect(trio('OUT', 'IN', 'IN')).toEqual([
      { id: 'srv-2', pos: 1 },
      { id: 'srv-3', pos: 3 },
    ]);
    expect(trio('IN', 'OUT', 'IN')).toEqual([
      { id: 'srv-1', pos: 1 },
      { id: 'srv-3', pos: 5 },
    ]);
    expect(trio('IN', 'IN', 'OUT')).toEqual([
      { id: 'srv-1', pos: 1 },
      { id: 'srv-2', pos: 3 },
    ]);
    expect(trio('OUT', 'OUT', 'IN')).toEqual([{ id: 'srv-3', pos: 1 }]);
    expect(trio('OUT', 'IN', 'OUT')).toEqual([{ id: 'srv-2', pos: 1 }]);
    expect(trio('IN', 'OUT', 'OUT')).toEqual([{ id: 'srv-1', pos: 1 }]);
    expect(trio('OUT', 'OUT', 'OUT')).toEqual([]);
  });
});
