import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UserStatus } from '@prisma/client';
import { AvailabilityService } from '../src/services/availability.service.js';
import { AttendanceService } from '../src/services/attendance.service.js';

/**
 * Live state for the single real account under test, mutated by the service
 * calls themselves so each scenario models a genuine sequence of events.
 */
let live = {
  presenceState: 'IN' as 'IN' | 'OUT',
  status: UserStatus.ONLINE as UserStatus,
  arrivedAt: new Date('2026-08-21T03:30:00.000Z') as Date | null,
  leftAt: null as Date | null,
};

let activeTaskCount = 0;
let openAttendanceRecord: Record<string, unknown> | null = null;
const publishedEvents: any[] = [];

const BASE_USER = {
  id: 'usr-sarah',
  name: 'Sarah Connor',
  email: 'sarah.connor@workgrid.corp',
  role: 'MEMBER',
  organizationId: 'org-1',
  accountStatus: 'ACTIVE',
  roomId: 'room-b-id',
  subroomId: 'subroom-b3-id',
  currentLocationName: 'B3',
  capacityLimitHours: 40,
  currentAllocatedHours: 10,
  lastSeenAt: new Date('2026-08-21T03:30:00.000Z'),
  avatarUrl: undefined,
  title: 'Senior Systems Engineer',
  room: { id: 'room-b-id', letter: 'B', name: 'Sector B' },
  subroom: { id: 'subroom-b3-id', code: 'B3' },
};

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    task: { count: vi.fn() },
    attendanceRecord: {
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
    },
    auditEvent: { create: vi.fn().mockResolvedValue(null) },
    $transaction: vi.fn(),
  },
}));

vi.mock('../src/db/client.js', () => ({
  prisma: mockPrisma,
  checkDatabaseHealth: vi.fn().mockResolvedValue({ status: 'healthy', latencyMs: 1 }),
}));

vi.mock('../src/events/domain-events.js', () => ({
  publishDomainEvent: vi.fn().mockImplementation((event: any) => {
    publishedEvents.push(event);
    return { id: `evt_${publishedEvents.length}`, timestamp: new Date().toISOString(), ...event };
  }),
  domainEventBus: {
    publishDomainEvent: vi.fn(),
    subscribeOrganization: vi.fn(() => () => undefined),
    subscribeAll: vi.fn(() => () => undefined),
  },
}));

function currentUser(withRelations = true) {
  const base: Record<string, unknown> = {
    ...BASE_USER,
    ...live,
    availabilitySlots: [],
    assignedTasks:
      activeTaskCount > 0
        ? [
            {
              id: 'task-1',
              taskIdDisplay: 'TSK-8421',
              title: 'Connection Pool Audit',
              status: 'IN_PROGRESS',
              priority: 'HIGH',
              estimatedHours: 8,
              allocatedHours: 4,
              dueDate: new Date('2026-08-22T00:00:00.000Z'),
            },
          ]
        : [],
  };
  if (!withRelations) {
    delete base.room;
    delete base.subroom;
  }
  return base;
}

describe('Availability lifecycle — attendance, tasks and schedule', () => {
  beforeEach(() => {
    live = {
      presenceState: 'IN',
      status: UserStatus.ONLINE,
      arrivedAt: new Date('2026-08-21T03:30:00.000Z'),
      leftAt: null,
    };
    activeTaskCount = 0;
    openAttendanceRecord = null;
    publishedEvents.length = 0;

    mockPrisma.user.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
      where.id === 'usr-sarah' ? Promise.resolve(currentUser()) : Promise.resolve(null)
    );
    mockPrisma.user.update.mockImplementation(({ data }: { data: any }) => {
      if (data.status) live.status = data.status;
      if (data.presenceState) live.presenceState = data.presenceState;
      if (data.arrivedAt !== undefined) live.arrivedAt = data.arrivedAt;
      if (data.leftAt !== undefined) live.leftAt = data.leftAt;
      return Promise.resolve({ ...currentUser(), ...data });
    });
    mockPrisma.task.count.mockImplementation(() => Promise.resolve(activeTaskCount));
    mockPrisma.attendanceRecord.findFirst.mockImplementation(() =>
      Promise.resolve(openAttendanceRecord)
    );
    mockPrisma.attendanceRecord.create.mockImplementation(({ data }: { data: any }) => {
      openAttendanceRecord = { id: 'att-1', ...data };
      return Promise.resolve(openAttendanceRecord);
    });
    mockPrisma.attendanceRecord.update.mockImplementation(({ where, data }: any) => {
      openAttendanceRecord = null;
      return Promise.resolve({ id: where.id, ...data });
    });
    mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));
  });

  // --- Attendance drives availability -------------------------------------

  it('1. checking OUT stores OFFLINE, i.e. projects UNAVAILABLE', async () => {
    openAttendanceRecord = { id: 'att-1', arrivedAt: live.arrivedAt, leftAt: null };

    await AttendanceService.checkOut('usr-sarah');

    expect(live.presenceState).toBe('OUT');
    expect(live.status).toBe(UserStatus.OFFLINE);
  });

  it('2. the check-out event announces UNAVAILABLE and an Outside location', async () => {
    openAttendanceRecord = { id: 'att-1', arrivedAt: live.arrivedAt, leftAt: null };

    await AttendanceService.checkOut('usr-sarah');

    const availabilityEvent = publishedEvents.find(
      (e) => e.type === 'AVAILABILITY_CHANGED'
    );
    expect(availabilityEvent.payload.availabilityState).toBe('UNAVAILABLE');
    expect(availabilityEvent.payload.currentLocation).toBe('Outside');
  });

  it('3. checking IN with no assigned work restores FREE', async () => {
    live.presenceState = 'OUT';
    live.status = UserStatus.OFFLINE;
    activeTaskCount = 0;

    await AttendanceService.checkIn('usr-sarah');

    expect(live.presenceState).toBe('IN');
    expect(live.status).toBe(UserStatus.ONLINE);
  });

  it('4. checking IN with live tasks restores BUSY rather than claiming free', async () => {
    live.presenceState = 'OUT';
    live.status = UserStatus.OFFLINE;
    activeTaskCount = 2;

    await AttendanceService.checkIn('usr-sarah');

    expect(live.status).toBe(UserStatus.BUSY);
    const availabilityEvent = publishedEvents.find((e) => e.type === 'AVAILABILITY_CHANGED');
    expect(availabilityEvent.payload.availabilityState).toBe('BUSY');
  });

  it('5. reports the projected availability on the attendance summary', async () => {
    openAttendanceRecord = { id: 'att-1', arrivedAt: live.arrivedAt, leftAt: null };
    live.status = UserStatus.BUSY;

    const summary = await AttendanceService.getCurrentUserAttendance('usr-sarah');

    expect(summary.state).toBe('IN');
    expect(summary.availabilityState).toBe('BUSY');
    expect(summary.availabilityLabel).toBe('Busy');
  });

  it('6. suppresses availability on the attendance summary once checked OUT', async () => {
    openAttendanceRecord = null;
    live.status = UserStatus.ONLINE; // stale stored value

    const summary = await AttendanceService.getCurrentUserAttendance('usr-sarah');

    expect(summary.state).toBe('OUT');
    expect(summary.availabilityState).toBe('UNAVAILABLE');
  });

  it('6b. reconciles a user row that drifted OUT while an attendance session is still open', async () => {
    // An open record means the person is present; the user row disagrees.
    openAttendanceRecord = { id: 'att-1', arrivedAt: new Date('2026-08-21T02:44:00.000Z'), leftAt: null };
    live.presenceState = 'OUT';
    live.status = UserStatus.OFFLINE;

    const result = await AttendanceService.checkIn('usr-sarah');

    expect(result.isExistingSession).toBe(true);
    expect(live.presenceState).toBe('IN');
    expect(live.status).toBe(UserStatus.ONLINE);
  });

  it('6c. announces the reconciliation so open dashboards follow it', async () => {
    openAttendanceRecord = { id: 'att-1', arrivedAt: new Date('2026-08-21T02:44:00.000Z'), leftAt: null };
    live.presenceState = 'OUT';
    live.status = UserStatus.OFFLINE;

    await AttendanceService.checkIn('usr-sarah');

    const event = publishedEvents.find(
      (e) => e.type === 'AVAILABILITY_CHANGED' && e.payload.reconciled
    );
    expect(event).toBeDefined();
    expect(event.payload.availabilityState).toBe('FREE');
  });

  it('6d. leaves an already-consistent open session untouched', async () => {
    openAttendanceRecord = { id: 'att-1', arrivedAt: new Date('2026-08-21T02:44:00.000Z'), leftAt: null };
    live.presenceState = 'IN';
    live.status = UserStatus.BUSY;

    await AttendanceService.checkIn('usr-sarah');

    // No reconciliation needed, so the stored availability is preserved.
    expect(live.status).toBe(UserStatus.BUSY);
    expect(publishedEvents.some((e) => e.payload?.reconciled)).toBe(false);
  });

  // --- Tasks drive availability -------------------------------------------

  it('7. moves a FREE person to BUSY when work becomes active', async () => {
    activeTaskCount = 1;

    const result = await AvailabilityService.syncAvailabilityWithTasks('usr-sarah');

    expect(result?.availabilityState).toBe('BUSY');
    expect(live.status).toBe(UserStatus.BUSY);
  });

  it('8. restores FREE when the last active task closes', async () => {
    live.status = UserStatus.BUSY;
    activeTaskCount = 0;

    const result = await AvailabilityService.syncAvailabilityWithTasks('usr-sarah');

    expect(result?.availabilityState).toBe('FREE');
    expect(live.status).toBe(UserStatus.ONLINE);
  });

  it('9. leaves a deliberately PARTIALLY_AVAILABLE person untouched', async () => {
    live.status = UserStatus.AWAY;
    activeTaskCount = 1;

    const result = await AvailabilityService.syncAvailabilityWithTasks('usr-sarah');

    expect(result).toBeNull();
    expect(live.status).toBe(UserStatus.AWAY);
  });

  it('10. does not resurrect availability for someone who is checked OUT', async () => {
    live.presenceState = 'OUT';
    live.status = UserStatus.OFFLINE;
    activeTaskCount = 1;

    const result = await AvailabilityService.syncAvailabilityWithTasks('usr-sarah');

    expect(result).toBeNull();
    expect(live.status).toBe(UserStatus.OFFLINE);
  });

  it('11. broadcasts the task-driven change so every view can follow it', async () => {
    activeTaskCount = 1;

    await AvailabilityService.syncAvailabilityWithTasks('usr-sarah');

    const event = publishedEvents.find((e) => e.type === 'AVAILABILITY_CHANGED');
    expect(event).toBeDefined();
    expect(event.organizationId).toBe('org-1');
    expect(event.payload.availabilityState).toBe('BUSY');
  });

  // --- Person detail projection -------------------------------------------

  it('12. shows a present member as FREE, located in their subroom', async () => {
    const detail = await AvailabilityService.getPersonDetailedAvailability('usr-sarah');

    expect(detail.currentStatus.state).toBe('FREE');
    expect(detail.person.currentLocation).toBe('B3');
    expect(detail.person.status).toBe(UserStatus.ONLINE);
  });

  it('13. never shows a checked-OUT member as FREE or inside a subroom', async () => {
    live.presenceState = 'OUT';
    live.status = UserStatus.ONLINE; // stale stored value must not leak through

    const detail = await AvailabilityService.getPersonDetailedAvailability('usr-sarah');

    expect(detail.currentStatus.state).toBe('UNAVAILABLE');
    expect(detail.person.currentLocation).toBe('Outside');
    expect(detail.person.status).toBe(UserStatus.OFFLINE);
  });

  it('14. names the active task when projecting BUSY', async () => {
    live.status = UserStatus.BUSY;
    activeTaskCount = 1;

    const detail = await AvailabilityService.getPersonDetailedAvailability('usr-sarah');

    expect(detail.currentStatus.state).toBe('BUSY');
    expect(detail.currentStatus.reason).toContain('TSK-8421');
  });

  it('15. derives "until" from the person’s own schedule window, not a fixed offset', async () => {
    const detail = await AvailabilityService.getPersonDetailedAvailability('usr-sarah');
    const today = detail.weeklyTimeline.find((d) => d.isToday);

    if (detail.currentStatus.until) {
      const matchingWindow = today?.windows.find(
        (w) => w.endFormatted === detail.currentStatus.until
      );
      expect(matchingWindow).toBeDefined();
    } else {
      // Outside every scheduled window there is nothing to count down to.
      expect(detail.currentStatus.until).toBeUndefined();
    }
  });

  it('16. derives the next free window from the same weekly timeline', async () => {
    const detail = await AvailabilityService.getPersonDetailedAvailability('usr-sarah');

    expect(detail.nextFree).toBeDefined();
    if (detail.nextFree.nextFreeTime) {
      const allWindows = detail.weeklyTimeline.flatMap((d) => d.windows);
      const matches = allWindows.some(
        (w) =>
          w.startFormatted === detail.nextFree.nextFreeTime ||
          w.endFormatted === detail.nextFree.nextFreeTime
      );
      expect(matches).toBe(true);
    }
  });

});
