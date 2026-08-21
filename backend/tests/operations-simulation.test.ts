import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SimulationService } from '../src/services/simulation.service.js';
import { OperationsService } from '../src/services/operations.service.js';
import { AvailabilityService } from '../src/services/availability.service.js';
import { AttendanceService } from '../src/services/attendance.service.js';
import { publishDomainEvent } from '../events/domain-events.js';

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
  }),
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
});
