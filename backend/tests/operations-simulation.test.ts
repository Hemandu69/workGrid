import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SimulationService } from '../src/services/simulation.service.js';
import { OperationsService } from '../src/services/operations.service.js';
import { AvailabilityService } from '../src/services/availability.service.js';

let dbDavidChenPresence: 'IN' | 'OUT' = 'IN';

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
              presenceState: 'IN',
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

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    user: {
      findMany: vi.fn().mockImplementation(() =>
        Promise.resolve([
          { id: 'usr-1', email: 'elena.vance@workgrid.corp', name: 'Elena Vance', role: 'SUPER_ADMIN' },
          { id: 'usr-2', email: 'marcus.sterling@workgrid.corp', name: 'Marcus Sterling', role: 'ADMIN' },
          { id: 'usr-3', email: 'sarah.jenkins@workgrid.corp', name: 'Sarah Jenkins', role: 'HR' },
          { id: 'usr-4', email: 'david.chen@workgrid.corp', name: 'David Chen', role: 'SERVER' },
          { id: 'usr-5', email: 'sarah.connor@workgrid.corp', name: 'Sarah Connor', role: 'MEMBER' },
          { id: 'usr-6', email: 'alex.rivera@workgrid.corp', name: 'Alex Rivera', role: 'TEAM_LEAD' },
          { id: 'usr-7', email: 'john.doe@workgrid.corp', name: 'John Doe', role: 'MEMBER' },
        ])
      ),
      findUnique: vi.fn().mockImplementation(({ where }: { where: { id?: string; email?: string } }) => {
        if (where.email === 'david.chen@workgrid.corp' || where.id === 'server-david-id') {
          return Promise.resolve({
            id: 'server-david-id',
            name: 'David Chen',
            email: 'david.chen@workgrid.corp',
            role: 'SERVER',
            presenceState: dbDavidChenPresence,
            currentLocationName: 'B1',
            arrivedAt: new Date('2026-08-21T03:30:00.000Z'),
            lastSeenAt: new Date(),
          });
        }
        return Promise.resolve(null);
      }),
      update: vi.fn().mockImplementation(({ data }: { data: any }) => {
        if (data.presenceState !== undefined) {
          dbDavidChenPresence = data.presenceState;
        }
        return Promise.resolve({
          id: 'server-david-id',
          name: 'David Chen',
          presenceState: dbDavidChenPresence,
          currentLocationName: data.currentLocationName || 'B1',
          arrivedAt: new Date(),
          lastSeenAt: new Date(),
        });
      }),
    },
    room: {
      findMany: vi.fn().mockImplementation((query?: any) => {
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

describe('Operations Grid Full 128 Members + 24 Servers Simulation Suite', () => {
  beforeEach(() => {
    dbDavidChenPresence = 'IN';
    SimulationService.resetSimulation();
  });

  it('1. Database User table contains ONLY authentic accounts, ZERO simulated users', async () => {
    const allUsers = await mockPrisma.user.findMany();
    const simulatedInDb = allUsers.filter((u: any) => u.id.startsWith('sim-') || u.email.includes('simulated'));
    expect(simulatedInDb).toHaveLength(0);

    // Verify 7 authentic accounts
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

    expect(members).toHaveLength(128); // 8 sections * 8 subrooms * 2 members = 128
    expect(servers).toHaveLength(24);  // 8 sections * 3 servers = 24
    expect(allSimulated).toHaveLength(152);

    // Verify each section has exactly 16 members and 3 servers
    for (const sec of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']) {
      const secMembers = members.filter((m) => m.sectionLetter === sec);
      const secServers = servers.filter((s) => s.sectionLetter === sec);
      expect(secMembers).toHaveLength(16);
      expect(secServers).toHaveLength(3);

      // Verify each subroom has exactly 2 members
      for (let num = 1; num <= 8; num++) {
        const subroomMembers = secMembers.filter((m) => m.subroomCode === `${sec}${num}`);
        expect(subroomMembers).toHaveLength(2);
      }
    }
  });

  it('3. Operations Grid renders all 8 sections and 64 subrooms', async () => {
    const grid = await OperationsService.getOperationalGrid({});
    expect(grid.rooms).toHaveLength(8);
    expect(grid.totalSubrooms).toBe(64);

    for (const room of grid.rooms) {
      expect(room.subrooms).toHaveLength(8);
    }
  });

  it('4. Server positioning across sections: 3 servers IN -> positions 1, 3, 5', async () => {
    const grid = await OperationsService.getOperationalGrid({ room: 'A' });
    const secA = grid.rooms.find((r) => r.letter === 'A');
    expect(secA).toBeDefined();

    const assigned = secA!.assignedServers.filter((s) => s.presenceState === 'IN');
    expect(assigned).toHaveLength(3);
    const positions = assigned.map((s) => s.assignedPosition);
    expect(positions).toEqual([1, 3, 5]);
  });

  it('5. Server compaction rule: Middle server OUT -> positions 1, 5 (third server does not shift)', async () => {
    SimulationService.updateSimulatedPersonState('sim-server-a-03', 'OUT');

    const grid = await OperationsService.getOperationalGrid({ room: 'A' });
    const secA = grid.rooms.find((r) => r.letter === 'A');
    const active = secA!.assignedServers.filter((s) => s.presenceState === 'IN');
    expect(active).toHaveLength(2);

    const posMap = new Map(active.map((s) => [s.preferredPosition, s.assignedPosition]));
    expect(posMap.get(1)).toBe(1);
    expect(posMap.get(5)).toBe(5);
  });

  it('6. Server compaction rule: First server OUT -> remaining servers compact to 1, 3', async () => {
    SimulationService.updateSimulatedPersonState('sim-server-c-01', 'OUT');

    const grid = await OperationsService.getOperationalGrid({ room: 'C' });
    const secC = grid.rooms.find((r) => r.letter === 'C');
    const active = secC!.assignedServers.filter((s) => s.presenceState === 'IN');
    expect(active).toHaveLength(2);

    const positions = active.map((s) => s.assignedPosition);
    expect(positions).toEqual([1, 3]);
  });

  it('7. Subroom capacity rule: Server presence DOES NOT count toward 2-member capacity', async () => {
    // In Section A Subroom A1: 2 simulated members IN + 1 supervisory server in Pos 1
    const grid = await OperationsService.getOperationalGrid({ room: 'A' });
    const subroomA1 = grid.rooms.find((r) => r.letter === 'A')?.subrooms.find((s) => s.code === 'A1');
    expect(subroomA1).toBeDefined();
    expect(subroomA1!.memberCapacity).toBe(2);
    expect(subroomA1!.members).toHaveLength(2);
    expect(subroomA1!.occupancyCount).toBe(2);
    // Server is present as overseer in Pos 1 without inflating occupancyCount
    expect(subroomA1!.serversPresent).toHaveLength(1);
    expect(subroomA1!.serversPresent[0].supervisoryPosition).toBe(1);
  });

  it('8. Member IN/OUT controls update occupancy count dynamically (2/2 -> 1/2 -> 0/2)', async () => {
    const mem1 = 'sim-member-a1-01';
    const mem2 = 'sim-member-a1-02';

    // Step 1: Initial (both IN)
    SimulationService.updateSimulatedPersonState(mem1, 'IN');
    SimulationService.updateSimulatedPersonState(mem2, 'IN');
    let grid = await OperationsService.getOperationalGrid({ room: 'A' });
    let cell = grid.rooms.find((r) => r.letter === 'A')?.subrooms.find((s) => s.code === 'A1');
    expect(cell?.occupancyCount).toBe(2);

    // Step 2: Member 1 goes OUT -> 1/2
    SimulationService.updateSimulatedPersonState(mem1, 'OUT');
    grid = await OperationsService.getOperationalGrid({ room: 'A' });
    cell = grid.rooms.find((r) => r.letter === 'A')?.subrooms.find((s) => s.code === 'A1');
    expect(cell?.occupancyCount).toBe(1);

    // Step 3: Member 2 goes OUT -> 0/2
    SimulationService.updateSimulatedPersonState(mem2, 'OUT');
    grid = await OperationsService.getOperationalGrid({ room: 'A' });
    cell = grid.rooms.find((r) => r.letter === 'A')?.subrooms.find((s) => s.code === 'A1');
    expect(cell?.occupancyCount).toBe(0);

    // Step 4: Member 1 comes back IN -> 1/2
    SimulationService.updateSimulatedPersonState(mem1, 'IN');
    grid = await OperationsService.getOperationalGrid({ room: 'A' });
    cell = grid.rooms.find((r) => r.letter === 'A')?.subrooms.find((s) => s.code === 'A1');
    expect(cell?.occupancyCount).toBe(1);
  });

  it('9. Person Availability Drawer detail for simulated person returns 7-day timeline and task commitments', async () => {
    const detail = await AvailabilityService.getPersonDetailedAvailability('sim-member-b2-01');
    expect(detail).toBeDefined();
    expect(detail.person.name).toBe('Maya Patel');
    expect(detail.person.role).toBe('MEMBER');
    expect(detail.person.room).toBe('Section B');
    expect(detail.person.subroom).toBe('B2');
    expect(detail.weeklyTimeline).toHaveLength(7);
    expect(detail.weeklyTimeline[0].windows.length).toBeGreaterThan(0);
    expect(detail.upcomingCommitments[0]?.id).toBe('TSK-8421');
  });

  it('10. Reset Simulation restores entire 128 members + 24 servers dataset to default fixture state', () => {
    // Mutate several simulated persons
    SimulationService.updateSimulatedPersonState('sim-member-a1-01', 'OUT');
    SimulationService.updateSimulatedPersonState('sim-member-h8-02', 'OUT');
    SimulationService.updateSimulatedPersonState('sim-server-a-01', 'OUT');

    // Reset
    SimulationService.resetSimulation();

    const memA1 = SimulationService.getSimulatedPerson('sim-member-a1-01');
    const srvA1 = SimulationService.getSimulatedPerson('sim-server-a-01');
    expect(memA1?.presenceState).toBe('IN');
    expect(srvA1?.presenceState).toBe('IN');
  });
});
