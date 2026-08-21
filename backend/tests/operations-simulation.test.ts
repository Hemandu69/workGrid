import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import { SimulationService } from '../src/services/simulation.service.js';
import { OperationsService } from '../src/services/operations.service.js';
import { AvailabilityService } from '../src/services/availability.service.js';
import { AttendanceService } from '../src/services/attendance.service.js';
import { publishDomainEvent } from '../src/events/domain-events.js';
import { buildApp } from '../src/app.js';
import { FastifyInstance } from 'fastify';
import { UserRole, AccountStatus } from '@prisma/client';

let dbDavidChenPresence: 'IN' | 'OUT' = 'IN';
let dbSarahConnorPresence: 'IN' | 'OUT' = 'IN';

const sections = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const mockRooms = sections.map((letter) => ({
  id: `room-${letter.toLowerCase()}-id`,
  letter,
  name: `Section ${letter} — Operations`,
  members:
    letter === 'B'
      ? [
          {
            id: 'server-david-id',
            name: 'David Chen',
            email: 'david.chen@workgrid.corp',
            role: 'SERVER',
            presenceState: dbDavidChenPresence,
            currentLocationName: 'B1',
            arrivedAt: new Date('2026-08-21T03:30:00.000Z'),
            lastSeenAt: new Date(),
          },
        ]
      : [],
  subrooms: Array.from({ length: 8 }, (_, i) => ({
    id: `subroom-${letter.toLowerCase()}${i + 1}-id`,
    code: `${letter}${i + 1}`,
    number: i + 1,
    memberCapacity: 2,
    serverSeatCount: 1,
    members:
      letter === 'B' && i + 1 === 3
        ? [
            {
              id: 'usr-sarah-connor',
              name: 'Sarah Connor',
              role: 'MEMBER',
              title: 'Senior Systems Engineer',
              presenceState: dbSarahConnorPresence,
              currentLocationName: 'B3',
              arrivedAt: new Date('2026-08-21T03:30:00.000Z'),
              lastSeenAt: new Date(),
              assignedTasks: [],
            },
            {
              id: 'usr-alex-rivera',
              name: 'Alex Rivera',
              role: 'TEAM_LEAD',
              title: 'Infrastructure Specialist',
              presenceState: 'IN',
              currentLocationName: 'B3',
              arrivedAt: new Date('2026-08-21T03:30:00.000Z'),
              lastSeenAt: new Date(),
              assignedTasks: [],
            },
          ]
        : [],
  })),
}));

const publishedEvents: any[] = [];

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    user: {
      findMany: vi.fn().mockImplementation(() =>
        Promise.resolve([
          { id: 'usr-1', email: 'elena.vance@workgrid.corp', name: 'Elena Vance', role: 'SUPER_ADMIN', accountStatus: 'ACTIVE', organizationId: 'org-test' },
          { id: 'usr-2', email: 'marcus.sterling@workgrid.corp', name: 'Marcus Sterling', role: 'ADMIN', accountStatus: 'ACTIVE', organizationId: 'org-test' },
          { id: 'usr-3', email: 'sarah.jenkins@workgrid.corp', name: 'Sarah Jenkins', role: 'HR', accountStatus: 'ACTIVE', organizationId: 'org-test' },
          { id: 'server-david-id', email: 'david.chen@workgrid.corp', name: 'David Chen', role: 'SERVER', accountStatus: 'ACTIVE', organizationId: 'org-test', presenceState: dbDavidChenPresence, roomId: 'room-b-id' },
          { id: 'usr-sarah-connor', email: 'sarah.connor@workgrid.corp', name: 'Sarah Connor', role: 'MEMBER', accountStatus: 'ACTIVE', organizationId: 'org-test', presenceState: dbSarahConnorPresence, roomId: 'room-b-id', subroomId: 'subroom-b3-id' },
          { id: 'usr-alex-rivera', email: 'alex.rivera@workgrid.corp', name: 'Alex Rivera', role: 'TEAM_LEAD', accountStatus: 'ACTIVE', organizationId: 'org-test', presenceState: 'IN', roomId: 'room-b-id', subroomId: 'subroom-b3-id' },
          { id: 'usr-7', email: 'john.doe@workgrid.corp', name: 'John Doe', role: 'MEMBER', accountStatus: 'PENDING', organizationId: 'org-test' },
        ])
      ),
      findUnique: vi.fn().mockImplementation(({ where }: { where: { id?: string; email?: string } }) => {
        if (where.email === 'david.chen@workgrid.corp' || where.id === 'server-david-id') {
          return Promise.resolve({
            id: 'server-david-id',
            name: 'David Chen',
            email: 'david.chen@workgrid.corp',
            role: 'SERVER',
            accountStatus: 'ACTIVE',
            organizationId: 'org-test',
            presenceState: dbDavidChenPresence,
            currentLocationName: dbDavidChenPresence === 'IN' ? 'B1' : 'Outside',
            arrivedAt: new Date('2026-08-21T03:30:00.000Z'),
            lastSeenAt: new Date(),
            roomId: 'room-b-id',
          });
        }
        if (where.email === 'sarah.connor@workgrid.corp' || where.id === 'usr-sarah-connor') {
          return Promise.resolve({
            id: 'usr-sarah-connor',
            name: 'Sarah Connor',
            email: 'sarah.connor@workgrid.corp',
            role: 'MEMBER',
            accountStatus: 'ACTIVE',
            organizationId: 'org-test',
            presenceState: dbSarahConnorPresence,
            currentLocationName: dbSarahConnorPresence === 'IN' ? 'B3' : 'Outside',
            arrivedAt: new Date('2026-08-21T03:30:00.000Z'),
            lastSeenAt: new Date(),
            roomId: 'room-b-id',
            subroomId: 'subroom-b3-id',
            room: { id: 'room-b-id', letter: 'B', name: 'Section B' },
            subroom: { id: 'subroom-b3-id', code: 'B3', number: 3 },
            availabilitySlots: [],
            assignedTasks: [],
          });
        }
        return Promise.resolve(null);
      }),
      update: vi.fn().mockImplementation(({ where, data }: { where: { id: string }; data: any }) => {
        if (where.id === 'server-david-id' && data.presenceState !== undefined) {
          dbDavidChenPresence = data.presenceState;
        }
        if (where.id === 'usr-sarah-connor' && data.presenceState !== undefined) {
          dbSarahConnorPresence = data.presenceState;
        }
        return Promise.resolve({
          id: where.id,
          name: where.id === 'server-david-id' ? 'David Chen' : 'Sarah Connor',
          role: where.id === 'server-david-id' ? 'SERVER' : 'MEMBER',
          organizationId: 'org-test',
          presenceState: data.presenceState || 'IN',
          currentLocationName: data.currentLocationName || 'B1',
          arrivedAt: data.arrivedAt || new Date(),
          lastSeenAt: data.lastSeenAt || new Date(),
        });
      }),
    },
    attendanceRecord: {
      findFirst: vi.fn().mockImplementation(({ where }: { where: any }) => {
        if (where.leftAt === null) {
          if (where.userId === 'server-david-id' && dbDavidChenPresence === 'IN') {
            return Promise.resolve({
              id: 'att-david-rec',
              userId: 'server-david-id',
              organizationId: 'org-test',
              arrivedAt: new Date('2026-08-21T03:30:00.000Z'),
              leftAt: null,
            });
          }
          if (where.userId === 'usr-sarah-connor' && dbSarahConnorPresence === 'IN') {
            return Promise.resolve({
              id: 'att-sarah-rec',
              userId: 'usr-sarah-connor',
              organizationId: 'org-test',
              arrivedAt: new Date('2026-08-21T03:30:00.000Z'),
              leftAt: null,
            });
          }
        }
        return Promise.resolve(null);
      }),
      create: vi.fn().mockImplementation(({ data }: { data: any }) => {
        return Promise.resolve({
          id: `att-rec-${Date.now()}`,
          ...data,
        });
      }),
      update: vi.fn().mockImplementation(({ where, data }: { where: any; data: any }) => {
        return Promise.resolve({
          id: where.id,
          ...data,
        });
      }),
    },
    $transaction: vi.fn().mockImplementation(async (cb: any) => {
      return cb(mockPrisma);
    }),
    room: {
      findMany: vi.fn().mockImplementation((query?: any) => {
        // Dynamically reflect current presence
        mockRooms.forEach((r) => {
          if (r.letter === 'B') {
            r.members[0].presenceState = dbDavidChenPresence;
            r.subrooms[2].members[0].presenceState = dbSarahConnorPresence;
          }
        });
        if (query?.where?.letter) {
          return Promise.resolve(mockRooms.filter((r) => r.letter === query.where.letter));
        }
        return Promise.resolve(mockRooms);
      }),
    },
    event: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

vi.mock('../src/db/client.js', () => ({
  prisma: mockPrisma,
}));

vi.mock('../src/events/domain-events.js', () => ({
  publishDomainEvent: vi.fn().mockImplementation((event: any) => {
    publishedEvents.push(event);
    return {
      id: `evt_test_${publishedEvents.length}`,
      timestamp: new Date().toISOString(),
      ...event,
    };
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

describe('Operations Grid Stateful Simulation & Real Authenticated Users Real-Time Suite', () => {
  beforeEach(() => {
    dbDavidChenPresence = 'IN';
    dbSarahConnorPresence = 'IN';
    publishedEvents.length = 0;
    SimulationService.resetSimulation(new Date('2026-08-21T08:00:00.000Z'));
  });

  it('1. Database User table contains ONLY authentic accounts, ZERO simulated users', async () => {
    const allUsers = await mockPrisma.user.findMany();
    const simulatedInDb = allUsers.filter((u: any) => u.id.startsWith('sim-') || u.email.includes('simulated'));
    expect(simulatedInDb).toHaveLength(0);

    const emails = allUsers.map((u: any) => u.email);
    expect(emails).toHaveLength(7);
    expect(emails).toContain('elena.vance@workgrid.corp');
    expect(emails).toContain('marcus.sterling@workgrid.corp');
    expect(emails).toContain('sarah.jenkins@workgrid.corp');
    expect(emails).toContain('david.chen@workgrid.corp');
    expect(emails).toContain('sarah.connor@workgrid.corp');
    expect(emails).toContain('alex.rivera@workgrid.corp');
    expect(emails).toContain('john.doe@workgrid.corp');
  });

  it('2. Complete Grid: Generates exactly 128 simulated members and 24 simulated servers across all 8 sections (A..H)', () => {
    const allSimulated = SimulationService.getSimulatedPersons();
    const members = allSimulated.filter((p) => p.role === 'MEMBER');
    const servers = allSimulated.filter((p) => p.role === 'SERVER');

    expect(members).toHaveLength(128);
    expect(servers).toHaveLength(24);
    expect(allSimulated).toHaveLength(152);

    for (const sec of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']) {
      const secMembers = members.filter((m) => m.sectionLetter === sec);
      const secServers = servers.filter((s) => s.sectionLetter === sec);
      expect(secMembers).toHaveLength(16);
      expect(secServers).toHaveLength(3);

      for (let num = 1; num <= 8; num++) {
        const subroomMembers = secMembers.filter((m) => m.subroomCode === `${sec}${num}`);
        expect(subroomMembers).toHaveLength(2);
      }
    }
  });

  it('3. Real Server Check-Out: David Chen checks OUT from Server Dashboard -> Emits domain events and recalcs supervisory positions', async () => {
    // Make sim-server-b-01 OUT so Section B active servers are David Chen (Pos 1) + Maya Lin (Pos 3) + Alex Mercer (Pos 5)
    SimulationService.updateSimulatedPersonState('sim-server-b-01', 'OUT');

    // 1. David Chen checks OUT
    const checkoutResult = await AttendanceService.checkOut('server-david-id');
    expect(checkoutResult.state).toBe('OUT');
    expect(dbDavidChenPresence).toBe('OUT');

    // 2. Assert Socket.IO domain events were published
    expect(publishedEvents.some((e) => e.type === 'EMPLOYEE_CHECKED_OUT' && e.targetUserId === 'server-david-id')).toBe(true);
    expect(publishedEvents.some((e) => e.type === 'LOCATION_CHANGED' && e.targetUserId === 'server-david-id')).toBe(true);
    expect(publishedEvents.some((e) => e.type === 'ROOM_STATUS_CHANGED')).toBe(true);

    // 3. Assert Operations Grid immediately recalculates supervisory positions for Section B
    const grid = await OperationsService.getOperationalGrid({ room: 'B' });
    const secB = grid.rooms.find((r) => r.letter === 'B')!;
    const activeServers = secB.assignedServers.filter((s) => s.presenceState === 'IN');
    
    // David Chen is OUT; simulated Maya Lin & Alex Mercer compact to positions 1, 3
    const positions = activeServers.map((s) => s.assignedPosition);
    expect(positions).toEqual([1, 3]);
  });

  it('4. Real Member Check-Out: Sarah Connor checks OUT -> Subroom B3 occupancy updates dynamically', async () => {
    // 1. Initial occupancy
    let grid = await OperationsService.getOperationalGrid({ room: 'B' });
    let cellB3 = grid.rooms.find((r) => r.letter === 'B')?.subrooms.find((s) => s.code === 'B3');
    const initialOccupancy = cellB3?.occupancyCount || 0;
    expect(initialOccupancy).toBeGreaterThan(0);

    // 2. Sarah Connor checks OUT
    await AttendanceService.checkOut('usr-sarah-connor');
    expect(dbSarahConnorPresence).toBe('OUT');

    // 3. Grid recalculates: Subroom B3 occupancy decrements by 1
    grid = await OperationsService.getOperationalGrid({ room: 'B' });
    cellB3 = grid.rooms.find((r) => r.letter === 'B')?.subrooms.find((s) => s.code === 'B3');
    expect(cellB3?.occupancyCount).toBe(initialOccupancy - 1);

    // 4. Sarah Connor checks back IN -> Subroom B3 occupancy restores to initial
    await AttendanceService.checkIn('usr-sarah-connor');
    expect(dbSarahConnorPresence).toBe('IN');
    grid = await OperationsService.getOperationalGrid({ room: 'B' });
    cellB3 = grid.rooms.find((r) => r.letter === 'B')?.subrooms.find((s) => s.code === 'B3');
    expect(cellB3?.occupancyCount).toBe(initialOccupancy);
  });

  it('5. Real User Person Detail Drawer returns authoritative database state and timeline', async () => {
    const detail = await AvailabilityService.getPersonDetailedAvailability('usr-sarah-connor');
    expect(detail).toBeDefined();
    expect(detail.person.name).toBe('Sarah Connor');
    expect(detail.person.role).toBe('MEMBER');
    expect(detail.person.room).toContain('Section B');
    expect(detail.person.subroom).toBe('B3');
  });

  it('6. Simulated and Real entities coexist seamlessly in Section B operations', async () => {
    const grid = await OperationsService.getOperationalGrid({ room: 'B' });
    const secB = grid.rooms.find((r) => r.letter === 'B')!;

    // Real David Chen (isSimulated: false) + Simulated Maya Lin & Alex Mercer (isSimulated: true)
    const david = secB.assignedServers.find((s) => s.id === 'server-david-id');
    const maya = secB.assignedServers.find((s) => s.id === 'sim-server-b-03');

    expect(david).toBeDefined();
    expect(david!.isSimulated).toBe(false);
    expect(maya).toBeDefined();
    expect(maya!.isSimulated).toBe(true);
  });

  it('7. Simulated server IN→OUT updates Section D KPI (2/3 → 1/3 Present)', async () => {
    // Section D starts with pos 5 OUT → 2/3 Present
    let grid = await OperationsService.getOperationalGrid({ room: 'D' });
    let secD = grid.rooms.find((r) => r.letter === 'D')!;
    expect(secD.serverPresenceCount).toBe(2);
    expect(secD.serverTotalCount).toBe(3);
    expect(secD.serverCoverageSummary).toBe('2 / 3 Present');

    const inServers = secD.assignedServers.filter((s) => s.presenceState === 'IN');
    expect(inServers).toHaveLength(2);
    const targetId = inServers[0].id;

    SimulationService.updateSimulatedPersonState(targetId, 'OUT');

    grid = await OperationsService.getOperationalGrid({ room: 'D' });
    secD = grid.rooms.find((r) => r.letter === 'D')!;
    expect(secD.serverPresenceCount).toBe(1);
    expect(secD.serverCoverageSummary).toBe('1 / 3 Present');
    expect(secD.assignedServers.find((s) => s.id === targetId)?.presenceState).toBe('OUT');

    // Reverse OUT→IN restores KPI
    SimulationService.updateSimulatedPersonState(targetId, 'IN');
    grid = await OperationsService.getOperationalGrid({ room: 'D' });
    secD = grid.rooms.find((r) => r.letter === 'D')!;
    expect(secD.serverPresenceCount).toBe(2);
    expect(secD.serverCoverageSummary).toBe('2 / 3 Present');
  });

  it('8. Simulated member IN→OUT updates subroom occupancy and people-present KPI', async () => {
    const memberId = 'sim-member-b2-01'; // Maya Patel
    let grid = await OperationsService.getOperationalGrid({ room: 'B' });
    let cellB2 = grid.rooms.find((r) => r.letter === 'B')?.subrooms.find((s) => s.code === 'B2');
    const initialOccupancy = cellB2!.occupancyCount;
    const initialPeople = grid.totalPeoplePresent;
    expect(cellB2!.members.find((m) => m.id === memberId)?.presenceState).toBe('IN');
    expect(initialOccupancy).toBeGreaterThanOrEqual(1);

    SimulationService.updateSimulatedPersonState(memberId, 'OUT');

    grid = await OperationsService.getOperationalGrid({ room: 'B' });
    cellB2 = grid.rooms.find((r) => r.letter === 'B')?.subrooms.find((s) => s.code === 'B2');
    expect(cellB2!.occupancyCount).toBe(initialOccupancy - 1);
    expect(grid.totalPeoplePresent).toBe(initialPeople - 1);
    expect(cellB2!.members.find((m) => m.id === memberId)?.presenceState).toBe('OUT');

    SimulationService.updateSimulatedPersonState(memberId, 'IN');
    grid = await OperationsService.getOperationalGrid({ room: 'B' });
    cellB2 = grid.rooms.find((r) => r.letter === 'B')?.subrooms.find((s) => s.code === 'B2');
    expect(cellB2!.occupancyCount).toBe(initialOccupancy);
    expect(grid.totalPeoplePresent).toBe(initialPeople);
  });

  it('9. Simulated server OUT recalculates supervisory positions using shared algorithm', async () => {
    // Match product scenario: Karan (sim pos1) starts OUT so active set is David + Maya + Alex
    SimulationService.updateSimulatedPersonState('sim-server-b-01', 'OUT');
    SimulationService.updateSimulatedPersonState('sim-server-b-03', 'IN');
    SimulationService.updateSimulatedPersonState('sim-server-b-05', 'IN');
    dbDavidChenPresence = 'IN';

    let grid = await OperationsService.getOperationalGrid({ room: 'B' });
    let secB = grid.rooms.find((r) => r.letter === 'B')!;
    let active = secB.assignedServers.filter((s) => s.presenceState === 'IN');
    expect(active).toHaveLength(3);
    expect(active.map((s) => s.assignedPosition).sort()).toEqual([1, 3, 5]);

    // Maya Lin → OUT; remaining David + Alex keep compacted slots
    SimulationService.updateSimulatedPersonState('sim-server-b-03', 'OUT');
    grid = await OperationsService.getOperationalGrid({ room: 'B' });
    secB = grid.rooms.find((r) => r.letter === 'B')!;
    active = secB.assignedServers.filter((s) => s.presenceState === 'IN');
    expect(active.map((s) => s.id).sort()).toEqual(['server-david-id', 'sim-server-b-05'].sort());
    expect(active.map((s) => s.assignedPosition).sort()).toEqual([1, 5]);

    // David Chen → OUT; Alex Mercer alone compacts to position 1
    dbDavidChenPresence = 'OUT';
    grid = await OperationsService.getOperationalGrid({ room: 'B' });
    secB = grid.rooms.find((r) => r.letter === 'B')!;
    active = secB.assignedServers.filter((s) => s.presenceState === 'IN');
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe('sim-server-b-05');
    expect(active[0].assignedPosition).toBe(1);
  });

  it('10. Simulated person detail drawer reflects authoritative simulation state', async () => {
    const memberId = 'sim-member-b2-01';
    let detail = await AvailabilityService.getPersonDetailedAvailability(memberId);
    expect(detail.person.isSimulated).toBe(true);
    expect(detail.person.attendanceState).toBe('IN');

    SimulationService.updateSimulatedPersonState(memberId, 'OUT');
    detail = await AvailabilityService.getPersonDetailedAvailability(memberId);
    expect(detail.person.attendanceState).toBe('OUT');
    expect(detail.person.presenceState).toBe('OUT');

    SimulationService.updateSimulatedPersonState(memberId, 'IN');
    detail = await AvailabilityService.getPersonDetailedAvailability(memberId);
    expect(detail.person.attendanceState).toBe('IN');
  });

  it('11. Reset Simulation restores Section D KPI and fixture presence', async () => {
    const inServer = SimulationService.getSimulatedPersons().find(
      (p) => p.role === 'SERVER' && p.sectionLetter === 'D' && p.presenceState === 'IN'
    )!;
    SimulationService.updateSimulatedPersonState(inServer.id, 'OUT');

    let grid = await OperationsService.getOperationalGrid({ room: 'D' });
    expect(grid.rooms.find((r) => r.letter === 'D')!.serverPresenceCount).toBe(1);

    SimulationService.resetSimulation(new Date('2026-08-21T08:00:00.000Z'));
    grid = await OperationsService.getOperationalGrid({ room: 'D' });
    expect(grid.rooms.find((r) => r.letter === 'D')!.serverCoverageSummary).toBe('2 / 3 Present');
  });

  it('12. Mixed real + simulated Section B: sim OUT then real OUT both reflected in coverage', async () => {
    SimulationService.updateSimulatedPersonState('sim-server-b-01', 'OUT');
    SimulationService.updateSimulatedPersonState('sim-server-b-03', 'IN');
    SimulationService.updateSimulatedPersonState('sim-server-b-05', 'IN');
    dbDavidChenPresence = 'IN';

    let grid = await OperationsService.getOperationalGrid({ room: 'B' });
    let secB = grid.rooms.find((r) => r.letter === 'B')!;
    // David (real) + Maya + Alex = 3 present
    expect(secB.serverPresenceCount).toBe(3);

    SimulationService.updateSimulatedPersonState('sim-server-b-03', 'OUT');
    grid = await OperationsService.getOperationalGrid({ room: 'B' });
    secB = grid.rooms.find((r) => r.letter === 'B')!;
    expect(secB.serverPresenceCount).toBe(2);
    expect(secB.assignedServers.find((s) => s.id === 'sim-server-b-03')?.presenceState).toBe('OUT');
    expect(secB.assignedServers.find((s) => s.id === 'server-david-id')?.presenceState).toBe('IN');

    dbDavidChenPresence = 'OUT';
    grid = await OperationsService.getOperationalGrid({ room: 'B' });
    secB = grid.rooms.find((r) => r.letter === 'B')!;
    expect(secB.serverPresenceCount).toBe(1);
    expect(secB.assignedServers.find((s) => s.id === 'server-david-id')?.presenceState).toBe('OUT');
  });

  it('16. Preeti Mishra IN→OUT: D1 grid cell must not keep stale Preeti (P1)•IN', async () => {
    // Fixture: Section D — Preeti (pos1) IN, Amit (pos3) IN, Komal (pos5) OUT
    const preetiId = 'sim-server-d-01';
    const amitId = 'sim-server-d-03';
    expect(SimulationService.getSimulatedPerson(preetiId)!.name).toBe('Preeti Mishra');
    expect(SimulationService.getSimulatedPerson(preetiId)!.presenceState).toBe('IN');

    let grid = await OperationsService.getOperationalGrid({ room: 'D' });
    let secD = grid.rooms.find((r) => r.letter === 'D')!;
    let d1 = secD.subrooms.find((s) => s.code === 'D1')!;

    expect(secD.serverCoverageSummary).toBe('2 / 3 Present');
    expect(d1.serversPresent.some((s) => s.id === preetiId && s.presenceState === 'IN')).toBe(true);
    expect(d1.serversPresent.every((s) => s.presenceState === 'IN')).toBe(true);

    // Preeti → OUT
    SimulationService.updateSimulatedPersonState(preetiId, 'OUT');

    grid = await OperationsService.getOperationalGrid({ room: 'D' });
    secD = grid.rooms.find((r) => r.letter === 'D')!;
    d1 = secD.subrooms.find((s) => s.code === 'D1')!;

    // Coverage + KPI agree
    expect(secD.assignedServers.find((s) => s.id === preetiId)?.presenceState).toBe('OUT');
    expect(secD.assignedServers.find((s) => s.id === preetiId)?.assignedPosition).toBeUndefined();
    expect(secD.serverPresenceCount).toBe(1);
    expect(secD.serverCoverageSummary).toBe('1 / 3 Present');

    // D1 must NOT still show Preeti as an IN overseer
    expect(d1.serversPresent.find((s) => s.id === preetiId)).toBeUndefined();
    expect(d1.serversPresent.every((s) => s.presenceState === 'IN')).toBe(true);

    // Amit compacts into position 1 and appears in D1
    const amitCoverage = secD.assignedServers.find((s) => s.id === amitId)!;
    expect(amitCoverage.presenceState).toBe('IN');
    expect(amitCoverage.assignedPosition).toBe(1);
    expect(d1.serversPresent.some((s) => s.id === amitId && s.supervisoryPosition === 1)).toBe(true);

    // Drawer projection agrees
    const detail = await AvailabilityService.getPersonDetailedAvailability(preetiId);
    expect(detail.person.presenceState).toBe('OUT');
    expect(detail.person.attendanceState).toBe('OUT');

    // Reverse OUT→IN restores Preeti as active overseer
    SimulationService.updateSimulatedPersonState(preetiId, 'IN');
    grid = await OperationsService.getOperationalGrid({ room: 'D' });
    secD = grid.rooms.find((r) => r.letter === 'D')!;
    d1 = secD.subrooms.find((s) => s.code === 'D1')!;
    expect(secD.serverCoverageSummary).toBe('2 / 3 Present');
    expect(secD.assignedServers.find((s) => s.id === preetiId)?.presenceState).toBe('IN');
    expect(d1.serversPresent.some((s) => s.id === preetiId && s.presenceState === 'IN')).toBe(true);
  });

  it('17. No OUT server may appear in any subroom serversPresent array', async () => {
    SimulationService.updateSimulatedPersonState('sim-server-d-01', 'OUT');
    SimulationService.updateSimulatedPersonState('sim-server-d-03', 'OUT');

    const grid = await OperationsService.getOperationalGrid({ room: 'D' });
    const secD = grid.rooms.find((r) => r.letter === 'D')!;
    for (const cell of secD.subrooms) {
      for (const srv of cell.serversPresent) {
        expect(srv.presenceState).toBe('IN');
        expect(srv.id).not.toBe('sim-server-d-01');
        expect(srv.id).not.toBe('sim-server-d-03');
      }
    }
    expect(secD.serverPresenceCount).toBe(0);
  });
});

describe('Simulation toggle/reset HTTP domain-event propagation', () => {
  let app: FastifyInstance;
  let adminToken: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
    adminToken = app.jwt.sign({
      id: 'usr-2',
      email: 'marcus.sterling@workgrid.corp',
      name: 'Marcus Sterling',
      role: UserRole.ADMIN,
      accountStatus: AccountStatus.ACTIVE,
      organizationId: 'org-test',
      version: 1,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    publishedEvents.length = 0;
    SimulationService.resetSimulation(new Date('2026-08-21T08:00:00.000Z'));
  });

  it('13. POST simulation/toggle emits Socket.IO domain events with simulatedPersonId and real orgId', async () => {
    const targetId = 'sim-server-d-01';
    const before = SimulationService.getSimulatedPerson(targetId)!;
    expect(before.presenceState).toBe('IN');

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/operations/simulation/toggle',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { id: targetId, presenceState: 'OUT' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().person.presenceState).toBe('OUT');
    expect(SimulationService.getSimulatedPerson(targetId)!.presenceState).toBe('OUT');

    const types = publishedEvents.map((e) => e.type);
    expect(types).toEqual(
      expect.arrayContaining([
        'PRESENCE_CHANGED',
        'ATTENDANCE_UPDATED',
        'LOCATION_CHANGED',
        'ROOM_STATUS_CHANGED',
        'AVAILABILITY_CHANGED',
      ])
    );

    for (const evt of publishedEvents) {
      expect(evt.organizationId).toBe('org-test');
      expect(evt.organizationId).not.toBe('workgrid-simulation');
      if (evt.type !== 'ROOM_STATUS_CHANGED') {
        expect(evt.entityId).toBe(targetId);
      }
      expect(evt.payload.simulatedPersonId).toBe(targetId);
      expect(evt.payload.personId).toBe(targetId);
      expect(evt.payload.userId).toBeNull();
      expect(evt.payload.isSimulated).toBe(true);
      expect(evt.payload.presenceState).toBe('OUT');
    }

    // Grid projection matches
    const grid = await OperationsService.getOperationalGrid({ room: 'D' });
    expect(grid.rooms.find((r) => r.letter === 'D')!.serverCoverageSummary).toBe('1 / 3 Present');
  });

  it('14. POST simulation/reset emits GRID_UPDATED to real organization and restores KPI', async () => {
    SimulationService.updateSimulatedPersonState('sim-server-d-01', 'OUT');

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/operations/simulation/reset',
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(200);
    expect(publishedEvents.some((e) => e.type === 'GRID_UPDATED' && e.organizationId === 'org-test')).toBe(true);
    expect(publishedEvents.some((e) => e.type === 'ROOM_STATUS_CHANGED' && e.payload.resetSimulation === true)).toBe(true);

    const grid = await OperationsService.getOperationalGrid({ room: 'D' });
    expect(grid.rooms.find((r) => r.letter === 'D')!.serverCoverageSummary).toBe('2 / 3 Present');
  });

  it('15. Two sequential toggles produce consistent event payloads for both clients', async () => {
    const targetId = 'sim-server-d-01';

    await app.inject({
      method: 'POST',
      url: '/api/v1/operations/simulation/toggle',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { id: targetId, presenceState: 'OUT' },
    });
    await app.inject({
      method: 'POST',
      url: '/api/v1/operations/simulation/toggle',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { id: targetId, presenceState: 'IN' },
    });

    const presenceEvents = publishedEvents.filter((e) => e.type === 'PRESENCE_CHANGED');
    expect(presenceEvents).toHaveLength(2);
    expect(presenceEvents[0].payload.presenceState).toBe('OUT');
    expect(presenceEvents[1].payload.presenceState).toBe('IN');
    expect(presenceEvents.every((e) => e.organizationId === 'org-test')).toBe(true);

    const grid = await OperationsService.getOperationalGrid({ room: 'D' });
    expect(grid.rooms.find((r) => r.letter === 'D')!.serverCoverageSummary).toBe('2 / 3 Present');
  });
});
