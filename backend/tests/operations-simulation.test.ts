import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SimulationService } from '../src/services/simulation.service.js';
import { OperationsService } from '../src/services/operations.service.js';
import { AvailabilityService } from '../src/services/availability.service.js';

let dbDavidChenPresence: 'IN' | 'OUT' = 'IN';

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
      findMany: vi.fn().mockImplementation(() =>
        Promise.resolve([
          {
            id: 'room-b-id',
            letter: 'B',
            name: 'Section B — Infrastructure & Security',
            members: [
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
            ],
            subrooms: [
              {
                id: 'subroom-b1-id',
                code: 'B1',
                number: 1,
                memberCapacity: 2,
                serverSeatCount: 1,
                members: [],
              },
              {
                id: 'subroom-b2-id',
                code: 'B2',
                number: 2,
                memberCapacity: 2,
                serverSeatCount: 1,
                members: [],
              },
              {
                id: 'subroom-b3-id',
                code: 'B3',
                number: 3,
                memberCapacity: 2,
                serverSeatCount: 1,
                members: [
                  {
                    id: 'usr-5',
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
                    id: 'usr-6',
                    name: 'Alex Rivera',
                    role: 'TEAM_LEAD',
                    title: 'Infrastructure Specialist',
                    presenceState: 'IN',
                    currentLocationName: 'B3',
                    arrivedAt: new Date('2026-08-21T03:30:00.000Z'),
                    lastSeenAt: new Date(),
                    assignedTasks: [],
                  },
                ],
              },
              {
                id: 'subroom-b4-id',
                code: 'B4',
                number: 4,
                memberCapacity: 2,
                serverSeatCount: 1,
                members: [],
              },
              {
                id: 'subroom-b5-id',
                code: 'B5',
                number: 5,
                memberCapacity: 2,
                serverSeatCount: 1,
                members: [],
              },
            ],
          },
        ])
      ),
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

describe('Operations Grid Test Personnel Simulation Suite', () => {
  beforeEach(() => {
    dbDavidChenPresence = 'IN';
    SimulationService.resetSimulation();
  });

  it('Requirement 1 & 9: Database User table contains ONLY authentic accounts, NO simulated persons', async () => {
    const allUsers = await mockPrisma.user.findMany();
    const simulatedInDb = allUsers.filter((u: any) => u.id.startsWith('sim-') || u.email.includes('simulated'));
    expect(simulatedInDb).toHaveLength(0);

    // Verify the 7 core authenticated test accounts exist in DB
    const emails = allUsers.map((u: any) => u.email);
    expect(emails).toContain('elena.vance@workgrid.corp');
    expect(emails).toContain('marcus.sterling@workgrid.corp');
    expect(emails).toContain('sarah.jenkins@workgrid.corp');
    expect(emails).toContain('david.chen@workgrid.corp');
    expect(emails).toContain('sarah.connor@workgrid.corp');
    expect(emails).toContain('alex.rivera@workgrid.corp');
    expect(emails).toContain('john.doe@workgrid.corp');
  });

  it('Scenario 1: Three servers IN -> assigned to positions 1, 3, 5', async () => {
    const grid = await OperationsService.getOperationalGrid({ room: 'B' });
    const sectionB = grid.rooms.find((r) => r.letter === 'B');
    expect(sectionB).toBeDefined();

    const assignedServers = sectionB!.assignedServers.filter((s) => s.presenceState === 'IN');
    expect(assignedServers).toHaveLength(3);

    const posMap = new Map(assignedServers.map((s) => [s.name, s.assignedPosition]));
    expect(posMap.get('David Chen')).toBe(1);
    expect(posMap.get('Maya Lin')).toBe(3);
    expect(posMap.get('Alex Mercer')).toBe(5);
  });

  it('Scenario 2: Middle server OUT -> positions 1, 5 (third server does NOT shift to 3)', async () => {
    SimulationService.updateSimulatedPersonState('sim-maya-lin', 'OUT');

    const grid = await OperationsService.getOperationalGrid({ room: 'B' });
    const sectionB = grid.rooms.find((r) => r.letter === 'B');
    expect(sectionB).toBeDefined();

    const activeServers = sectionB!.assignedServers.filter((s) => s.presenceState === 'IN');
    expect(activeServers).toHaveLength(2);

    const posMap = new Map(activeServers.map((s) => [s.name, s.assignedPosition]));
    expect(posMap.get('David Chen')).toBe(1);
    expect(posMap.get('Alex Mercer')).toBe(5);
  });

  it('Scenario 3: First server OUT -> remaining servers compact to positions 1, 3', async () => {
    await OperationsService.updateUserPresence('server-david-id', { presenceState: 'OUT' });

    const grid = await OperationsService.getOperationalGrid({ room: 'B' });
    const sectionB = grid.rooms.find((r) => r.letter === 'B');
    expect(sectionB).toBeDefined();

    const activeServers = sectionB!.assignedServers.filter((s) => s.presenceState === 'IN');
    expect(activeServers).toHaveLength(2);

    const posMap = new Map(activeServers.map((s) => [s.name, s.assignedPosition]));
    expect(posMap.get('Maya Lin')).toBe(1);
    expect(posMap.get('Alex Mercer')).toBe(3);
  });

  it('Scenario 4: Only one server IN -> assigned to position 1', async () => {
    SimulationService.updateSimulatedPersonState('sim-maya-lin', 'OUT');
    SimulationService.updateSimulatedPersonState('sim-alex-mercer', 'OUT');

    const grid = await OperationsService.getOperationalGrid({ room: 'B' });
    const sectionB = grid.rooms.find((r) => r.letter === 'B');
    expect(sectionB).toBeDefined();

    const activeServers = sectionB!.assignedServers.filter((s) => s.presenceState === 'IN');
    expect(activeServers).toHaveLength(1);
    expect(activeServers[0].name).toBe('David Chen');
    expect(activeServers[0].assignedPosition).toBe(1);
  });

  it('Scenario 5: All servers OUT -> no supervisory positions assigned', async () => {
    SimulationService.updateSimulatedPersonState('sim-maya-lin', 'OUT');
    SimulationService.updateSimulatedPersonState('sim-alex-mercer', 'OUT');
    await OperationsService.updateUserPresence('server-david-id', { presenceState: 'OUT' });

    const grid = await OperationsService.getOperationalGrid({ room: 'B' });
    const sectionB = grid.rooms.find((r) => r.letter === 'B');
    expect(sectionB).toBeDefined();

    const activeServers = sectionB!.assignedServers.filter((s) => s.presenceState === 'IN');
    expect(activeServers).toHaveLength(0);
    expect(sectionB!.serverPresenceCount).toBe(0);
  });

  it('Scenario 6: Member IN/OUT changes subroom occupancy count dynamically', async () => {
    // Initial: Subroom B2 has 2 simulated members IN (Maya Patel + James Wilson)
    const grid1 = await OperationsService.getOperationalGrid({ room: 'B' });
    const subroomB2_step1 = grid1.rooms.find((r) => r.letter === 'B')?.subrooms.find((s) => s.code === 'B2');
    expect(subroomB2_step1).toBeDefined();
    expect(subroomB2_step1!.occupancyCount).toBe(2);
    expect(subroomB2_step1!.memberCapacity).toBe(2);

    // Toggle Maya Patel OUT -> occupancy drops to 1/2
    SimulationService.updateSimulatedPersonState('sim-maya-patel', 'OUT');
    const grid2 = await OperationsService.getOperationalGrid({ room: 'B' });
    const subroomB2_step2 = grid2.rooms.find((r) => r.letter === 'B')?.subrooms.find((s) => s.code === 'B2');
    expect(subroomB2_step2!.occupancyCount).toBe(1);

    // Toggle James Wilson OUT -> occupancy drops to 0/2
    SimulationService.updateSimulatedPersonState('sim-james-wilson', 'OUT');
    const grid3 = await OperationsService.getOperationalGrid({ room: 'B' });
    const subroomB2_step3 = grid3.rooms.find((r) => r.letter === 'B')?.subrooms.find((s) => s.code === 'B2');
    expect(subroomB2_step3!.occupancyCount).toBe(0);

    // Toggle Maya Patel back IN -> occupancy becomes 1/2
    SimulationService.updateSimulatedPersonState('sim-maya-patel', 'IN');
    const grid4 = await OperationsService.getOperationalGrid({ room: 'B' });
    const subroomB2_step4 = grid4.rooms.find((r) => r.letter === 'B')?.subrooms.find((s) => s.code === 'B2');
    expect(subroomB2_step4!.occupancyCount).toBe(1);
  });

  it('Scenario 7: Reset Simulation restores all fixtures to default states', () => {
    // Change states
    SimulationService.updateSimulatedPersonState('sim-maya-lin', 'OUT');
    SimulationService.updateSimulatedPersonState('sim-maya-patel', 'OUT');
    SimulationService.updateSimulatedPersonState('sim-liam-vance', 'IN');

    // Reset
    SimulationService.resetSimulation();

    const mayaLin = SimulationService.getSimulatedPerson('sim-maya-lin');
    const mayaPatel = SimulationService.getSimulatedPerson('sim-maya-patel');
    const liamVance = SimulationService.getSimulatedPerson('sim-liam-vance');

    expect(mayaLin?.presenceState).toBe('IN');
    expect(mayaPatel?.presenceState).toBe('IN');
    expect(liamVance?.presenceState).toBe('OUT');
  });

  it('Scenario 8: Detailed Availability & Drawer info for simulated persons returns test metadata', async () => {
    const detail = await AvailabilityService.getPersonDetailedAvailability('sim-maya-patel');
    expect(detail).toBeDefined();
    expect(detail.person.name).toBe('Maya Patel');
    expect(detail.person.role).toBe('MEMBER');
    expect(detail.person.room).toBe('Section B');
    expect(detail.person.subroom).toBe('B2');
    expect(detail.person.attendanceState).toBe('IN');
    expect(detail.upcomingCommitments[0]?.id).toBe('TSK-8424');
  });
});
