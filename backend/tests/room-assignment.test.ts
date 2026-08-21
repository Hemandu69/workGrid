import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import supertest from 'supertest';
import { buildApp } from '../src/app.js';
import { UserRole, AccountStatus } from '@prisma/client';
import { SimulationService } from '../src/services/simulation.service.js';
import { OperationsService } from '../src/services/operations.service.js';

// ---------------------------------------------------------------------------
// Mock topology: Sections B and C, subrooms B1-B8 / C1-C8 (capacity 2 each)
// ---------------------------------------------------------------------------
const ORG = 'org-1';

const mockRoomsMeta = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((letter) => ({
  id: `room-${letter.toLowerCase()}-id`,
  letter,
}));

const mockSubroomsMeta: Array<{ id: string; code: string; roomId: string; number: number }> = [];
for (const room of mockRoomsMeta) {
  for (let n = 1; n <= 8; n++) {
    mockSubroomsMeta.push({ id: `subroom-${room.letter.toLowerCase()}${n}-id`, code: `${room.letter}${n}`, roomId: room.id, number: n });
  }
}

let mockUsers: any[] = [];

function resetMockUsers() {
  mockUsers = [
    { id: 'super-admin-1', email: 'elena@org.corp', name: 'Elena Vance', role: UserRole.SUPER_ADMIN, accountStatus: AccountStatus.ACTIVE, organizationId: ORG, roomId: null, subroomId: null, presenceState: 'IN' },
    { id: 'admin-1', email: 'marcus@org.corp', name: 'Marcus Sterling', role: UserRole.ADMIN, accountStatus: AccountStatus.ACTIVE, organizationId: ORG, roomId: null, subroomId: null, presenceState: 'IN' },
    { id: 'hr-1', email: 'sarah.j@org.corp', name: 'Sarah Jenkins', role: UserRole.HR, accountStatus: AccountStatus.ACTIVE, organizationId: ORG, roomId: null, subroomId: null, presenceState: 'IN' },
    { id: 'server-1', email: 'david@org.corp', name: 'David Chen', role: UserRole.SERVER, accountStatus: AccountStatus.ACTIVE, organizationId: ORG, roomId: 'room-b-id', subroomId: null, presenceState: 'IN', currentLocationRoomId: 'room-b-id' },
    // Sarah (member-1) starts in B2, alongside member-2 — makes B2 full at 2/2. She is
    // currently checked IN and physically standing at her B2 desk.
    { id: 'member-1', email: 'sarah.connor@org.corp', name: 'Sarah Connor', role: UserRole.MEMBER, accountStatus: AccountStatus.ACTIVE, organizationId: ORG, roomId: 'room-b-id', subroomId: 'subroom-b2-id', presenceState: 'IN', currentLocationRoomId: 'room-b-id', currentLocationSubroomId: 'subroom-b2-id', currentLocationName: 'B2' },
    { id: 'member-2', email: 'james@org.corp', name: 'James Wilson', role: UserRole.MEMBER, accountStatus: AccountStatus.ACTIVE, organizationId: ORG, roomId: 'room-b-id', subroomId: 'subroom-b2-id', presenceState: 'IN' },
    { id: 'member-3', email: 'komal@org.corp', name: 'Komal Mehta', role: UserRole.MEMBER, accountStatus: AccountStatus.ACTIVE, organizationId: ORG, roomId: null, subroomId: null, presenceState: 'OUT' },
    { id: 'teamlead-1', email: 'amit@org.corp', name: 'Amit Shah', role: UserRole.TEAM_LEAD, accountStatus: AccountStatus.ACTIVE, organizationId: ORG, roomId: null, subroomId: null, presenceState: 'IN' },
  ];
}

function findUser(id: string) {
  return mockUsers.find((u) => u.id === id) || null;
}
function findRoomById(id?: string | null) {
  return mockRoomsMeta.find((r) => r.id === id) || null;
}
function findSubroomById(id?: string | null) {
  return mockSubroomsMeta.find((s) => s.id === id) || null;
}
function attachRoomSubroom(user: any) {
  const room = findRoomById(user.roomId);
  const subroom = findSubroomById(user.subroomId);
  return {
    ...user,
    room: room ? { id: room.id, letter: room.letter } : null,
    subroom: subroom ? { id: subroom.id, code: subroom.code } : null,
  };
}

const { mockPrisma, publishedEvents } = vi.hoisted(() => ({
  mockPrisma: {} as any,
  publishedEvents: [] as any[],
}));

Object.assign(mockPrisma, {
  user: {
    findUnique: vi.fn().mockImplementation(async ({ where }: any) => {
      const user = where?.id ? findUser(where.id) : where?.email ? mockUsers.find((u) => u.email === where.email) : null;
      return user ? attachRoomSubroom(user) : null;
    }),
    findMany: vi.fn().mockImplementation(async () => mockUsers.map(attachRoomSubroom)),
    count: vi.fn().mockImplementation(async ({ where }: any) => {
      let list = [...mockUsers];
      if (where?.roomId) list = list.filter((u) => u.roomId === where.roomId);
      if (where?.subroom?.code) {
        const sub = mockSubroomsMeta.find((s) => s.code === where.subroom.code);
        list = list.filter((u) => sub && u.subroomId === sub.id);
      }
      if (where?.role) {
        if (where.role.in) list = list.filter((u) => where.role.in.includes(u.role));
        else list = list.filter((u) => u.role === where.role);
      }
      if (where?.id?.not) list = list.filter((u) => u.id !== where.id.not);
      return list.length;
    }),
    update: vi.fn().mockImplementation(async ({ where, data }: any) => {
      const idx = mockUsers.findIndex((u) => u.id === where.id);
      if (idx === -1) throw new Error('User not found');
      mockUsers[idx] = { ...mockUsers[idx], ...data };
      return attachRoomSubroom(mockUsers[idx]);
    }),
  },
  room: {
    findFirst: vi.fn().mockImplementation(async ({ where }: any) => {
      const room = mockRoomsMeta.find((r) => r.letter === where.letter);
      return room ? { ...room, organizationId: ORG } : null;
    }),
    findMany: vi.fn().mockImplementation(async ({ where }: any) => {
      let rooms = mockRoomsMeta;
      if (where?.letter) rooms = rooms.filter((r) => r.letter === where.letter);
      return rooms.map((room) => ({
        id: room.id,
        organizationId: ORG,
        letter: room.letter,
        name: `Section ${room.letter}`,
        subrooms: mockSubroomsMeta
          .filter((s) => s.roomId === room.id)
          .map((s) => ({
            id: s.id,
            code: s.code,
            number: s.number,
            memberCapacity: 2,
            serverSeatCount: 1,
            members: mockUsers
              .filter((u) => u.subroomId === s.id && (u.role === 'MEMBER' || u.role === 'TEAM_LEAD'))
              .map((u) => ({ ...u, presenceState: 'IN', arrivedAt: null, lastSeenAt: new Date(), assignedTasks: [] })),
          })),
        members: mockUsers
          .filter((u) => u.roomId === room.id && u.role === 'SERVER')
          .map((u) => ({ ...u, presenceState: 'IN', currentLocationName: null, arrivedAt: null, lastSeenAt: new Date() })),
      }));
    }),
  },
  subroom: {
    findFirst: vi.fn().mockImplementation(async ({ where }: any) => {
      const sub = mockSubroomsMeta.find((s) => s.code === where.code && s.roomId === where.roomId);
      return sub ? { ...sub, organizationId: ORG, memberCapacity: 2 } : null;
    }),
  },
  event: {
    findFirst: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
  },
});

vi.mock('../src/db/client.js', () => ({
  prisma: mockPrisma,
  checkDatabaseHealth: vi.fn().mockResolvedValue({ status: 'healthy', latencyMs: 1 }),
}));

vi.mock('../src/events/domain-events.js', () => ({
  publishDomainEvent: vi.fn().mockImplementation((event: any) => {
    const full = { id: `evt_${publishedEvents.length}`, timestamp: new Date().toISOString(), ...event };
    publishedEvents.push(full);
    return full;
  }),
  domainEventBus: {
    publishDomainEvent: vi.fn(),
    subscribeOrganization: vi.fn(() => () => undefined),
    subscribeAll: vi.fn(() => () => undefined),
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    setMaxListeners: vi.fn(),
  },
}));

describe('Dynamic Room/Subroom Assignment — real users, simulated personnel & realtime', () => {
  let app: FastifyInstance;
  const tokens: Record<string, string> = {};

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    resetMockUsers();
    for (const u of mockUsers) {
      tokens[u.id] = app.jwt.sign({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        accountStatus: u.accountStatus,
        organizationId: u.organizationId,
      });
    }
  });

  afterAll(async () => {
    await app.close();
  });

  /**
   * The default simulation fixture pre-populates EVERY subroom (A1-H8) with 2
   * simulated members — there is no "naturally empty" subroom. Tests that need
   * a genuinely free destination first evacuate that subroom's default
   * simulated occupants, exactly as an operator clearing desks would.
   */
  function evacuateSimulatedSubroom(sectionLetter: string, subroomCode: string) {
    for (const p of SimulationService.getSimulatedPersons()) {
      if (p.role !== 'SERVER' && p.sectionLetter === sectionLetter && p.subroomCode === subroomCode) {
        SimulationService.reassignSimulatedPerson(p.id, '', '');
      }
    }
  }

  beforeEach(() => {
    resetMockUsers();
    publishedEvents.length = 0;
    SimulationService.resetSimulation(new Date('2026-08-21T08:00:00.000Z'));
    for (const [section, subroom] of [['C', 'C4'], ['C', 'C1'], ['C', 'C6'], ['D', 'D8'], ['B', 'B5']]) {
      evacuateSimulatedSubroom(section, subroom);
    }
  });

  // ---------------------------------------------------------------------------
  // REAL USER
  // ---------------------------------------------------------------------------
  describe('Real user assignment', () => {
    it('assigns an unassigned member to a subroom', async () => {
      const res = await supertest(app.server)
        .patch('/api/v1/rooms/assignment/member-3')
        .set('Authorization', `Bearer ${tokens['admin-1']}`)
        .send({ sectionLetter: 'C', subroomCode: 'C4' });

      if (res.status !== 200) console.log('DEBUG BODY', JSON.stringify(res.body));
      expect(res.status).toBe(200);
      expect(res.body.current.section).toBe('C');
      expect(res.body.current.subroom).toBe('C4');
      expect(res.body.previousSection).toBeNull();

      const persisted = findUser('member-3');
      expect(persisted.roomId).toBe('room-c-id');
      expect(persisted.subroomId).toBe('subroom-c4-id');
    });

    it('reassigns Sarah from B2 to C4: B2 occupancy decreases, C4 occupancy increases', async () => {
      const before = await supertest(app.server).get('/api/v1/rooms').set('Authorization', `Bearer ${tokens['admin-1']}`);
      const b2Before = before.body.find((r: any) => r.letter === 'B').subrooms.find((s: any) => s.id === 'B2');
      expect(b2Before.membersCount).toBe(2);

      const res = await supertest(app.server)
        .patch('/api/v1/rooms/assignment/member-1')
        .set('Authorization', `Bearer ${tokens['admin-1']}`)
        .send({ sectionLetter: 'C', subroomCode: 'C4' });

      expect(res.status).toBe(200);
      expect(res.body.previousSection).toBe('B');
      expect(res.body.previousSubroom).toBe('B2');
      expect(res.body.current.section).toBe('C');
      expect(res.body.current.subroom).toBe('C4');

      const after = await supertest(app.server).get('/api/v1/rooms').set('Authorization', `Bearer ${tokens['admin-1']}`);
      const b2After = after.body.find((r: any) => r.letter === 'B').subrooms.find((s: any) => s.id === 'B2');
      const c4After = after.body.find((r: any) => r.letter === 'C').subrooms.find((s: any) => s.id === 'C4');
      expect(b2After.membersCount).toBe(1);
      expect(c4After.membersCount).toBe(1);
    });

    it('a present member\'s displayed current location follows the reassignment (no stale old subroom)', async () => {
      const res = await supertest(app.server)
        .patch('/api/v1/rooms/assignment/member-1')
        .set('Authorization', `Bearer ${tokens['admin-1']}`)
        .send({ sectionLetter: 'C', subroomCode: 'C4' });

      expect(res.status).toBe(200);
      const persisted = findUser('member-1');
      expect(persisted.currentLocationRoomId).toBe('room-c-id');
      expect(persisted.currentLocationSubroomId).toBe('subroom-c4-id');
      expect(persisted.currentLocationName).toBe('C4');
    });

    it('clearing a present member\'s assignment also clears their stale current location', async () => {
      const res = await supertest(app.server)
        .delete('/api/v1/rooms/assignment/member-1')
        .set('Authorization', `Bearer ${tokens['admin-1']}`);

      expect(res.status).toBe(200);
      const persisted = findUser('member-1');
      expect(persisted.currentLocationRoomId).toBeNull();
      expect(persisted.currentLocationSubroomId).toBeNull();
      expect(persisted.currentLocationName).toBeNull();
    });

    it('an absent (OUT) member\'s current location is left untouched on assignment', async () => {
      const res = await supertest(app.server)
        .patch('/api/v1/rooms/assignment/member-3')
        .set('Authorization', `Bearer ${tokens['admin-1']}`)
        .send({ sectionLetter: 'C', subroomCode: 'C4' });

      expect(res.status).toBe(200);
      const persisted = findUser('member-3');
      // member-3 is OUT — no currentLocation fields were touched by the assignment
      expect(persisted.currentLocationRoomId).toBeUndefined();
    });

    it('clears a member assignment', async () => {
      const res = await supertest(app.server)
        .delete('/api/v1/rooms/assignment/member-1')
        .set('Authorization', `Bearer ${tokens['admin-1']}`);

      expect(res.status).toBe(200);
      expect(res.body.current.section).toBeNull();
      expect(res.body.current.subroom).toBeNull();

      const persisted = findUser('member-1');
      expect(persisted.roomId).toBeNull();
      expect(persisted.subroomId).toBeNull();
    });

    it('persists the new assignment — GET reflects the PATCH', async () => {
      await supertest(app.server)
        .patch('/api/v1/rooms/assignment/member-3')
        .set('Authorization', `Bearer ${tokens['admin-1']}`)
        .send({ sectionLetter: 'C', subroomCode: 'C1' });

      const res = await supertest(app.server)
        .get('/api/v1/rooms/assignment/member-3')
        .set('Authorization', `Bearer ${tokens['admin-1']}`);

      expect(res.status).toBe(200);
      expect(res.body.section).toBe('C');
      expect(res.body.subroom).toBe('C1');
    });

    it('rejects assignment into a full subroom (2/2) and leaves the original assignment unchanged', async () => {
      const res = await supertest(app.server)
        .patch('/api/v1/rooms/assignment/member-3')
        .set('Authorization', `Bearer ${tokens['admin-1']}`)
        .send({ sectionLetter: 'B', subroomCode: 'B2' }); // already member-1 + member-2

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/capacity/i);

      // member-3 stays unassigned; B2 still holds exactly member-1 + member-2
      const persisted = findUser('member-3');
      expect(persisted.roomId).toBeNull();
      const b2Occupants = mockUsers.filter((u) => u.subroomId === 'subroom-b2-id');
      expect(b2Occupants.map((u) => u.id).sort()).toEqual(['member-1', 'member-2']);

      // No realtime event should have been emitted for a rejected assignment
      expect(publishedEvents.some((e) => e.type === 'ROOM_ASSIGNMENT_CHANGED')).toBe(false);
    });

    it('a no-op reassignment to the same subroom does not trip the capacity check', async () => {
      // First move member-3 into the now-empty C4...
      const first = await supertest(app.server)
        .patch('/api/v1/rooms/assignment/member-3')
        .set('Authorization', `Bearer ${tokens['admin-1']}`)
        .send({ sectionLetter: 'C', subroomCode: 'C4' });
      expect(first.status).toBe(200);

      // ...then "reassign" them to the exact same subroom — must not double-count themselves.
      const second = await supertest(app.server)
        .patch('/api/v1/rooms/assignment/member-3')
        .set('Authorization', `Bearer ${tokens['admin-1']}`)
        .send({ sectionLetter: 'C', subroomCode: 'C4' });
      expect(second.status).toBe(200);
    });

    describe('authorization', () => {
      const forbidden: Array<[string, string]> = [
        ['MEMBER', 'member-3'],
        ['HR', 'hr-1'],
        ['SERVER', 'server-1'],
        ['TEAM_LEAD', 'teamlead-1'],
      ];

      it.each(forbidden)('%s cannot assign a room (403)', async (_label, actorId) => {
        const res = await supertest(app.server)
          .patch('/api/v1/rooms/assignment/member-3')
          .set('Authorization', `Bearer ${tokens[actorId]}`)
          .send({ sectionLetter: 'C', subroomCode: 'C1' });
        expect(res.status).toBe(403);
      });

      it('ADMIN can assign a room (200)', async () => {
        const res = await supertest(app.server)
          .patch('/api/v1/rooms/assignment/member-3')
          .set('Authorization', `Bearer ${tokens['admin-1']}`)
          .send({ sectionLetter: 'C', subroomCode: 'C1' });
        expect(res.status).toBe(200);
      });

      it('SUPER_ADMIN can assign a room (200)', async () => {
        const res = await supertest(app.server)
          .patch('/api/v1/rooms/assignment/member-3')
          .set('Authorization', `Bearer ${tokens['super-admin-1']}`)
          .send({ sectionLetter: 'C', subroomCode: 'C1' });
        expect(res.status).toBe(200);
      });
    });
  });

  // ---------------------------------------------------------------------------
  // SIMULATED USER
  // ---------------------------------------------------------------------------
  describe('Simulated personnel assignment', () => {
    const simMemberId = 'sim-member-b2-01'; // fixture: Section B, Subroom B2

    it('assigns/reassigns a simulated member — no PostgreSQL User row is created', async () => {
      const res = await supertest(app.server)
        .patch(`/api/v1/rooms/assignment/${simMemberId}`)
        .set('Authorization', `Bearer ${tokens['admin-1']}`)
        .send({ sectionLetter: 'C', subroomCode: 'C6' });

      expect(res.status).toBe(200);
      expect(res.body.current.isSimulated).toBe(true);
      expect(res.body.current.section).toBe('C');
      expect(res.body.current.subroom).toBe('C6');

      const sim = SimulationService.getSimulatedPerson(simMemberId)!;
      expect(sim.sectionLetter).toBe('C');
      expect(sim.subroomCode).toBe('C6');

      // Never leaks into the real Prisma User table
      expect(findUser(simMemberId)).toBeNull();
    });

    it('clears a simulated member — disappears from every room/subroom projection', async () => {
      const res = await supertest(app.server)
        .delete(`/api/v1/rooms/assignment/${simMemberId}`)
        .set('Authorization', `Bearer ${tokens['admin-1']}`);

      expect(res.status).toBe(200);
      expect(res.body.current.section).toBeNull();

      const grid = await OperationsService.getOperationalGrid({});
      const stillPresent = grid.rooms.some((r) => r.subrooms.some((s) => s.members.some((m) => m.id === simMemberId)));
      expect(stillPresent).toBe(false);
    });

    it('rejects assigning a simulated member into a full real subroom (B2 is 2/2)', async () => {
      const res = await supertest(app.server)
        .patch(`/api/v1/rooms/assignment/${simMemberId}`)
        .set('Authorization', `Bearer ${tokens['admin-1']}`)
        .send({ sectionLetter: 'B', subroomCode: 'B2' });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/capacity/i);
    });

    it('combined real + simulated occupancy is enforced together', async () => {
      // Put one real member into an otherwise-empty subroom B5, then fill it with one sim member —
      // a second sim member assignment into B5 must now be rejected (1 real + 1 sim = 2/2).
      await supertest(app.server)
        .patch('/api/v1/rooms/assignment/member-3')
        .set('Authorization', `Bearer ${tokens['admin-1']}`)
        .send({ sectionLetter: 'B', subroomCode: 'B5' });

      await supertest(app.server)
        .patch(`/api/v1/rooms/assignment/${simMemberId}`)
        .set('Authorization', `Bearer ${tokens['admin-1']}`)
        .send({ sectionLetter: 'B', subroomCode: 'B5' });

      const res = await supertest(app.server)
        .patch('/api/v1/rooms/assignment/sim-member-b2-02')
        .set('Authorization', `Bearer ${tokens['admin-1']}`)
        .send({ sectionLetter: 'B', subroomCode: 'B5' });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/capacity/i);
    });
  });

  // ---------------------------------------------------------------------------
  // REALTIME
  // ---------------------------------------------------------------------------
  describe('ROOM_ASSIGNMENT_CHANGED realtime event', () => {
    it('emits with a real userId and full old/new location for a real user move', async () => {
      await supertest(app.server)
        .patch('/api/v1/rooms/assignment/member-1')
        .set('Authorization', `Bearer ${tokens['admin-1']}`)
        .send({ sectionLetter: 'C', subroomCode: 'C4' });

      const evt = publishedEvents.find((e) => e.type === 'ROOM_ASSIGNMENT_CHANGED');
      expect(evt).toBeDefined();
      expect(evt.organizationId).toBe(ORG);
      expect(evt.payload).toMatchObject({
        userId: 'member-1',
        simulatedPersonId: null,
        isSimulated: false,
        previousSection: 'B',
        previousSubroom: 'B2',
        newSection: 'C',
        newSubroom: 'C4',
        role: 'MEMBER',
      });
      expect(evt.payload.timestamp).toBeDefined();
    });

    it('emits with a simulatedPersonId (userId null) for a simulated person move', async () => {
      await supertest(app.server)
        .patch('/api/v1/rooms/assignment/sim-member-b2-01')
        .set('Authorization', `Bearer ${tokens['admin-1']}`)
        .send({ sectionLetter: 'D', subroomCode: 'D8' });

      const evt = publishedEvents.find((e) => e.type === 'ROOM_ASSIGNMENT_CHANGED');
      expect(evt).toBeDefined();
      expect(evt.payload).toMatchObject({
        userId: null,
        simulatedPersonId: 'sim-member-b2-01',
        isSimulated: true,
        previousSection: 'B',
        previousSubroom: 'B2',
        newSection: 'D',
        newSubroom: 'D8',
      });
    });
  });

  // ---------------------------------------------------------------------------
  // SERVER — room assignment must not break supervisory positioning
  // ---------------------------------------------------------------------------
  describe('Server room reassignment is independent of supervisory positioning', () => {
    it('moving a real server to another section keeps 1/3/5 compaction intact in both sections', async () => {
      // David (real) starts in Room B alongside 3 simulated servers (Karan/Maya/Alex).
      let grid = await OperationsService.getOperationalGrid({ room: 'B' });
      let secB = grid.rooms.find((r) => r.letter === 'B')!;
      expect(secB.assignedServers.some((s) => s.id === 'server-1')).toBe(true);

      const res = await supertest(app.server)
        .patch('/api/v1/rooms/assignment/server-1')
        .set('Authorization', `Bearer ${tokens['admin-1']}`)
        .send({ sectionLetter: 'C' });

      expect(res.status).toBe(200);
      expect(res.body.current.section).toBe('C');
      expect(res.body.current.subroom).toBeNull(); // servers are never subroom-pinned

      // David now appears in Section C's server roster...
      grid = await OperationsService.getOperationalGrid({ room: 'C' });
      const secC = grid.rooms.find((r) => r.letter === 'C')!;
      expect(secC.assignedServers.some((s) => s.id === 'server-1')).toBe(true);
      const david = secC.assignedServers.find((s) => s.id === 'server-1')!;
      expect(david.presenceState).toBe('IN');
      expect([1, 3, 5]).toContain(david.assignedPosition);

      // ...and Section B's remaining 3 simulated servers still compact correctly (no gaps).
      grid = await OperationsService.getOperationalGrid({ room: 'B' });
      secB = grid.rooms.find((r) => r.letter === 'B')!;
      expect(secB.assignedServers.some((s) => s.id === 'server-1')).toBe(false);
      const activeInB = secB.assignedServers.filter((s) => s.presenceState === 'IN');
      expect(activeInB.map((s) => s.assignedPosition).sort()).toEqual([1, 3, 5]);
    });

    it('IN/OUT toggling still recalculates positions correctly after a server moves sections', async () => {
      await supertest(app.server)
        .patch('/api/v1/rooms/assignment/server-1')
        .set('Authorization', `Bearer ${tokens['admin-1']}`)
        .send({ sectionLetter: 'C' });

      // Section C now has David (real, IN) + 3 simulated servers (Section C fixture servers).
      let grid = await OperationsService.getOperationalGrid({ room: 'C' });
      let secC = grid.rooms.find((r) => r.letter === 'C')!;
      let activeIn = secC.assignedServers.filter((s) => s.presenceState === 'IN');
      expect(activeIn).toHaveLength(4); // 1 real + 3 sim (extras pool seats 3, David keeps a primary/extra seat)
      expect(activeIn.filter((s) => [1, 3, 5].includes(s.assignedPosition!)).map((s) => s.assignedPosition).sort()).toEqual([1, 3, 5]);

      // Take one Section C simulated server OUT — remaining set must still compact to fill 1/3/5.
      const secCSimServer = secC.assignedServers.find((s) => s.isSimulated)!;
      SimulationService.updateSimulatedPersonState(secCSimServer.id, 'OUT');

      grid = await OperationsService.getOperationalGrid({ room: 'C' });
      secC = grid.rooms.find((r) => r.letter === 'C')!;
      activeIn = secC.assignedServers.filter((s) => s.presenceState === 'IN');
      const positions = activeIn.map((s) => s.assignedPosition).filter((p): p is 1 | 3 | 5 => Boolean(p));
      expect(new Set(positions)).toEqual(new Set([1, 3, 5].slice(0, Math.min(3, positions.length))));
      expect(positions.length).toBeGreaterThan(0);
    });

    it('moving a simulated server to another section updates its section without manual position hardcoding', async () => {
      const simServerId = 'sim-server-d-01';
      const res = await supertest(app.server)
        .patch(`/api/v1/rooms/assignment/${simServerId}`)
        .set('Authorization', `Bearer ${tokens['admin-1']}`)
        .send({ sectionLetter: 'E' });

      expect(res.status).toBe(200);
      expect(res.body.current.section).toBe('E');
      expect(res.body.current.subroom).toBeNull();

      const sim = SimulationService.getSimulatedPerson(simServerId)!;
      expect(sim.sectionLetter).toBe('E');
      // preferredServerPosition identity is untouched by a section move
      expect(sim.preferredServerPosition).toBe(1);

      const grid = await OperationsService.getOperationalGrid({ room: 'E' });
      const secE = grid.rooms.find((r) => r.letter === 'E')!;
      expect(secE.assignedServers.some((s) => s.id === simServerId)).toBe(true);
    });
  });
});
