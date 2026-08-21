import { prisma } from '../db/client.js';
import { UpdateWeeklyScheduleInput } from '../schemas/availability.schema.js';
import { DayOfWeek, SlotState, UserRole, UserStatus, TaskStatus, PresenceState } from '@prisma/client';
import { publishDomainEvent } from '../events/domain-events.js';
import {
  APP_TIMEZONE,
  TIMEZONE_LABEL,
  formatToISTTime,
  formatToISTDate,
  formatToISTDateTime,
  formatUtcWindowToIST,
  createUtcTimestamp,
} from '../utils/time.js';

export interface TimeSlotWindow {
  date: string;
  startHour: number;
  endHour: number;
  startFormatted: string;
  endFormatted: string;
  activeWindow: string;
  dateFormatted: string;
  timezone: string;
  timezoneLabel: string;
}

export interface PersonAvailabilityItem {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatarUrl?: string;
  title?: string;
  room?: string;
  subroom?: string;
  currentLocation?: string;
  attendanceState: 'IN' | 'OUT' | 'UNKNOWN';
  presenceState: PresenceState;
  arrivedAt?: string;
  arrivedAtIST?: string;
  leftAt?: string;
  leftAtIST?: string;
  currentDurationFormatted?: string;
  lastSeenAt?: string;
  lastSeenAtIST?: string;
  status: 'FREE' | 'BUSY' | 'PARTIALLY_AVAILABLE' | 'UNAVAILABLE';
  statusLabel: string;
  reason: string;
  until?: string;
  freeWindow?: string;
  activeTask?: {
    id: string;
    title: string;
    priority: string;
    dueDate?: string;
  };
}

export interface DayTimelineWindow {
  startHour: number;
  endHour: number;
  startFormatted: string;
  endFormatted: string;
  state: 'FREE' | 'BUSY' | 'PARTIALLY_AVAILABLE' | 'UNAVAILABLE';
  label: string;
  reason?: string;
}

export interface DayAvailabilityTimeline {
  date: string;
  dayName: string;
  dayOfWeek: DayOfWeek;
  isToday: boolean;
  status: 'FREE' | 'BUSY' | 'PARTIALLY_AVAILABLE' | 'UNAVAILABLE';
  windows: DayTimelineWindow[];
}

export interface NextFreeInfo {
  isCurrentlyFree: boolean;
  statusText: string;
  nextFreeDate?: string;
  nextFreeTime?: string;
  durationFormatted?: string;
}

export class AvailabilityService {
  static async getUserAvailability(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error(`User with ID ${userId} not found`);
    }

    const slots = await prisma.availabilitySlot.findMany({
      where: { userId },
      orderBy: [{ day: 'asc' }, { hour: 'asc' }],
    });

    const dayOrder: Record<DayOfWeek, number> = {
      MONDAY: 0,
      TUESDAY: 1,
      WEDNESDAY: 2,
      THURSDAY: 3,
      FRIDAY: 4,
      SATURDAY: 5,
      SUNDAY: 6,
    };

    const daysMap: Record<DayOfWeek, any[]> = {
      MONDAY: [],
      TUESDAY: [],
      WEDNESDAY: [],
      THURSDAY: [],
      FRIDAY: [],
      SATURDAY: [],
      SUNDAY: [],
    };

    for (const slot of slots) {
      daysMap[slot.day].push({
        hour: slot.hour,
        state: slot.state,
        taskId: slot.taskId || undefined,
      });
    }

    // Ensure all 24 hours exist for each day
    const formattedDays = Object.entries(daysMap).map(([dayKey, daySlots]) => {
      const fullHours = Array.from({ length: 24 }, (_, h) => {
        const found = daySlots.find((s) => s.hour === h);
        return found || { hour: h, state: SlotState.UNAVAILABLE };
      });

      return {
        day: dayKey as DayOfWeek,
        slots: fullHours,
      };
    });

    formattedDays.sort((a, b) => dayOrder[a.day] - dayOrder[b.day]);

    const totalAvailableHours = slots.filter(
      (s) => s.state === SlotState.AVAILABLE || s.state === SlotState.PREFERRED
    ).length;

    const allocatedHours = user.currentAllocatedHours;
    const remainingAvailableHours = Math.max(0, totalAvailableHours - allocatedHours);

    return {
      userId: user.id,
      timezone: APP_TIMEZONE,
      timezoneLabel: TIMEZONE_LABEL,
      allocatedHours,
      totalCapacityHours: totalAvailableHours || user.capacityLimitHours,
      remainingAvailableHours,
      days: formattedDays,
    };
  }

  static async updateWeeklySchedule(userId: string, input: UpdateWeeklyScheduleInput) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error(`User with ID ${userId} not found`);
    }

    // Transactionally update slots
    await prisma.$transaction(async (tx) => {
      for (const slot of input.slots) {
        await tx.availabilitySlot.upsert({
          where: {
            userId_day_hour: {
              userId,
              day: slot.day,
              hour: slot.hour,
            },
          },
          update: {
            state: slot.state,
            taskId: slot.taskId,
          },
          create: {
            userId,
            day: slot.day,
            hour: slot.hour,
            state: slot.state,
            taskId: slot.taskId,
          },
        });
      }
    });

    // Publish Real-Time Domain Event (Organization Scoped)
    publishDomainEvent({
      type: 'AVAILABILITY_CHANGED',
      organizationId: user.organizationId,
      entityId: user.id,
      targetUserId: user.id,
      actorId: userId,
      payload: {
        userId: user.id,
        slotsUpdatedCount: input.slots.length,
      },
    });

    return this.getUserAvailability(userId);
  }

  /**
   * Enterprise-wide People Availability Overview with IST Time Presentation
   */
  static async getPeopleAvailability(filters: {
    date?: string;
    startHour?: number;
    endHour?: number;
    status?: string;
    role?: string;
    room?: string;
    search?: string;
    organizationId?: string;
  }) {
    const now = new Date();
    const dateStr = filters.date || now.toISOString().split('T')[0];
    const targetDate = new Date(dateStr + 'T00:00:00.000Z');

    const startHour = filters.startHour !== undefined ? Math.max(0, Math.min(23, Number(filters.startHour))) : now.getUTCHours();
    const endHour = filters.endHour !== undefined ? Math.max(startHour + 1, Math.min(24, Number(filters.endHour))) : Math.min(24, startHour + 1);

    const dayOfWeek = this.getDayOfWeek(targetDate);

    // Build database query for users
    const where: any = {};
    if (filters.organizationId) where.organizationId = filters.organizationId;
    if (filters.role && filters.role !== 'ALL') where.role = filters.role as UserRole;
    if (filters.room && filters.room !== 'ALL') {
      where.room = {
        letter: filters.room.toUpperCase().replace('ROOM', '').replace('SECTOR', '').trim(),
      };
    }
    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { email: { contains: filters.search, mode: 'insensitive' } },
        { title: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const users = await prisma.user.findMany({
      where,
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
      include: {
        room: true,
        subroom: true,
        availabilitySlots: {
          where: { day: dayOfWeek },
        },
        assignedTasks: {
          where: {
            status: { in: [TaskStatus.IN_PROGRESS, TaskStatus.ASSIGNED, TaskStatus.BLOCKED] },
          },
          orderBy: { dueDate: 'asc' },
        },
      },
    });

    const evaluatedPeople: PersonAvailabilityItem[] = users.map((user) => {
      const activeTask = user.assignedTasks[0];
      const hoursCount = endHour - startHour;

      let availableHours = 0;
      let busyHours = 0;
      let unavailableHours = 0;

      for (let h = startHour; h < endHour; h++) {
        const slot = user.availabilitySlots.find((s) => s.hour === h);
        if (slot) {
          if (slot.state === SlotState.AVAILABLE || slot.state === SlotState.PREFERRED) {
            availableHours++;
          } else if (slot.state === SlotState.BUSY) {
            busyHours++;
          } else {
            unavailableHours++;
          }
        } else {
          // If no specific slot saved, infer from presence/active task
          if (user.status === UserStatus.ONLINE && !activeTask) {
            availableHours++;
          } else if (user.status === UserStatus.BUSY || activeTask) {
            busyHours++;
          } else {
            unavailableHours++;
          }
        }
      }

      // If user has an active in-progress task, weight towards busy
      if (activeTask && activeTask.status === TaskStatus.IN_PROGRESS && busyHours === 0 && availableHours > 0) {
        busyHours = availableHours;
        availableHours = 0;
      }

      let status: 'FREE' | 'BUSY' | 'PARTIALLY_AVAILABLE' | 'UNAVAILABLE' = 'FREE';
      let statusLabel = 'Free';
      let reason = 'Available for assignment';

      if (busyHours === hoursCount) {
        status = 'BUSY';
        statusLabel = 'Busy';
        reason = activeTask ? `Active Task: ${activeTask.taskIdDisplay || activeTask.title}` : (user.subroom ? `In Subroom ${user.subroom.code}` : 'Scheduled Busy');
      } else if (availableHours === hoursCount) {
        status = 'FREE';
        statusLabel = 'Free';
        reason = user.subroom ? `Subroom ${user.subroom.code} · Available` : 'Scheduled Available';
      } else if (availableHours > 0 && (busyHours > 0 || unavailableHours > 0)) {
        status = 'PARTIALLY_AVAILABLE';
        statusLabel = 'Partially Available';
        reason = `Free for ${availableHours}h of ${hoursCount}h selected`;
      } else {
        status = 'UNAVAILABLE';
        statusLabel = 'Unavailable';
        reason = user.status === UserStatus.OFFLINE ? 'Offline / Non-working hours' : 'Outside scheduled availability';
      }

      const untilDate = createUtcTimestamp(dateStr, endHour);
      const until = formatToISTTime(untilDate);
      
      const freeWindowStart = createUtcTimestamp(dateStr, startHour);
      const freeWindowEnd = createUtcTimestamp(dateStr, startHour + availableHours);
      const freeWindow = status === 'PARTIALLY_AVAILABLE' ? `${formatToISTTime(freeWindowStart, false)} – ${formatToISTTime(freeWindowEnd)}` : undefined;

      let currentDurationFormatted: string | undefined;
      if (user.arrivedAt && user.presenceState === 'IN') {
        const diffMs = now.getTime() - user.arrivedAt.getTime();
        const hours = Math.floor(diffMs / 3600000);
        const mins = Math.floor((diffMs % 3600000) / 60000);
        currentDurationFormatted = `${hours}h ${mins}m`;
      }

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role || UserRole.MEMBER,
        avatarUrl: user.avatarUrl || undefined,
        title: user.title || undefined,
        room: user.room ? `Sector ${user.room.letter}` : undefined,
        subroom: user.subroom?.code,
        currentLocation: user.currentLocationName || (user.subroom ? user.subroom.code : (user.room ? `Sector ${user.room.letter}` : 'UNKNOWN')),
        attendanceState: user.presenceState === 'IN' ? 'IN' : user.presenceState === 'OUT' ? 'OUT' : 'UNKNOWN',
        presenceState: user.presenceState || PresenceState.UNKNOWN,
        arrivedAt: user.arrivedAt ? user.arrivedAt.toISOString() : undefined,
        arrivedAtIST: user.arrivedAt ? formatToISTTime(user.arrivedAt) : undefined,
        leftAt: user.leftAt ? user.leftAt.toISOString() : undefined,
        leftAtIST: user.leftAt ? formatToISTTime(user.leftAt) : undefined,
        currentDurationFormatted,
        lastSeenAt: user.lastSeenAt ? user.lastSeenAt.toISOString() : undefined,
        lastSeenAtIST: user.lastSeenAt ? formatToISTTime(user.lastSeenAt) : formatToISTTime(now),
        status,
        statusLabel,
        reason,
        until,
        freeWindow,
        activeTask: activeTask
          ? {
              id: activeTask.taskIdDisplay || activeTask.id,
              title: activeTask.title,
              priority: activeTask.priority,
              dueDate: activeTask.dueDate ? activeTask.dueDate.toISOString() : undefined,
            }
          : undefined,
      };
    });

    // Summary calculations (before status filter)
    const totalPeople = evaluatedPeople.length;
    const freeCount = evaluatedPeople.filter((p) => p.status === 'FREE').length;
    const busyCount = evaluatedPeople.filter((p) => p.status === 'BUSY').length;
    const partialCount = evaluatedPeople.filter((p) => p.status === 'PARTIALLY_AVAILABLE').length;
    const unavailableCount = evaluatedPeople.filter((p) => p.status === 'UNAVAILABLE').length;

    // Apply status filter if provided
    let filteredPeople = evaluatedPeople;
    if (filters.status && filters.status !== 'ALL') {
      filteredPeople = evaluatedPeople.filter((p) => p.status === filters.status);
    }

    const istWindow = formatUtcWindowToIST(dateStr, startHour, endHour);

    return {
      timeSlot: {
        date: dateStr,
        startHour,
        endHour,
        startFormatted: istWindow.startIST,
        endFormatted: istWindow.endIST,
        activeWindow: istWindow.activeWindowIST,
        dateFormatted: istWindow.dateIST,
        timezone: APP_TIMEZONE,
        timezoneLabel: TIMEZONE_LABEL,
      },
      summary: {
        totalPeople,
        freeCount,
        busyCount,
        partialCount,
        unavailableCount,
      },
      people: filteredPeople,
    };
  }

  /**
   * Detailed weekly timeline and commitments for a selected person in IST
   */
  static async getPersonDetailedAvailability(userId: string, startDateStr?: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        room: true,
        subroom: true,
        availabilitySlots: true,
        assignedTasks: {
          where: {
            status: { in: [TaskStatus.IN_PROGRESS, TaskStatus.ASSIGNED, TaskStatus.BLOCKED, TaskStatus.SUBMITTED] },
          },
          orderBy: { dueDate: 'asc' },
        },
      },
    });

    if (!user) {
      throw new Error(`User with ID ${userId} not found`);
    }

    const now = new Date();
    const startDate = startDateStr ? new Date(startDateStr + 'T00:00:00.000Z') : new Date(now.toISOString().split('T')[0] + 'T00:00:00.000Z');

    // Evaluate 7 days starting from startDate
    const daysTimeline: DayAvailabilityTimeline[] = [];
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const curDate = new Date(startDate);
      curDate.setUTCDate(startDate.getUTCDate() + dayOffset);
      const curDateStr = curDate.toISOString().split('T')[0];
      const curDayOfWeek = this.getDayOfWeek(curDate);
      const isToday = curDateStr === now.toISOString().split('T')[0];

      const daySlots = user.availabilitySlots.filter((s) => s.day === curDayOfWeek);
      const windows: DayTimelineWindow[] = [];

      let windowStart = 0;
      let currentHourState: 'FREE' | 'BUSY' | 'UNAVAILABLE' = 'UNAVAILABLE';

      const getHourState = (hour: number): 'FREE' | 'BUSY' | 'UNAVAILABLE' => {
        const slot = daySlots.find((s) => s.hour === hour);
        if (slot) {
          if (slot.state === SlotState.AVAILABLE || slot.state === SlotState.PREFERRED) return 'FREE';
          if (slot.state === SlotState.BUSY) return 'BUSY';
          return 'UNAVAILABLE';
        }
        if (hour >= 9 && hour < 17 && curDayOfWeek !== DayOfWeek.SATURDAY && curDayOfWeek !== DayOfWeek.SUNDAY) {
          return 'FREE';
        }
        return 'UNAVAILABLE';
      };

      currentHourState = getHourState(0);
      windowStart = 0;

      for (let h = 1; h <= 24; h++) {
        const nextState = h < 24 ? getHourState(h) : null;
        if (nextState !== currentHourState || h === 24) {
          if (currentHourState !== 'UNAVAILABLE' || (windowStart >= 8 && h <= 18)) {
            const startTimestamp = createUtcTimestamp(curDateStr, windowStart);
            const endTimestamp = createUtcTimestamp(curDateStr, h);

            windows.push({
              startHour: windowStart,
              endHour: h,
              startFormatted: formatToISTTime(startTimestamp, false),
              endFormatted: formatToISTTime(endTimestamp, true),
              state: currentHourState,
              label: currentHourState === 'FREE' ? 'Free / Available' : currentHourState === 'BUSY' ? 'Busy' : 'Unavailable',
              reason: currentHourState === 'BUSY' && user.assignedTasks[0] ? user.assignedTasks[0].title : undefined,
            });
          }
          currentHourState = nextState || 'UNAVAILABLE';
          windowStart = h;
        }
      }

      // Compute day aggregate status
      const hasFree = windows.some((w) => w.state === 'FREE');
      const hasBusy = windows.some((w) => w.state === 'BUSY');
      let dayStatus: 'FREE' | 'BUSY' | 'PARTIALLY_AVAILABLE' | 'UNAVAILABLE' = 'UNAVAILABLE';
      if (hasFree && !hasBusy) dayStatus = 'FREE';
      else if (hasBusy && !hasFree) dayStatus = 'BUSY';
      else if (hasFree && hasBusy) dayStatus = 'PARTIALLY_AVAILABLE';

      daysTimeline.push({
        date: curDateStr,
        dayName: `${dayNames[curDate.getUTCDay()]} ${curDate.getUTCDate()}`,
        dayOfWeek: curDayOfWeek,
        isToday,
        status: dayStatus,
        windows: windows.length > 0 ? windows : [
          {
            startHour: 9,
            endHour: 17,
            startFormatted: '02:30 PM',
            endFormatted: '10:30 PM IST',
            state: 'UNAVAILABLE',
            label: 'Off-schedule',
          },
        ],
      });
    }

    // Determine "Next Free" window in IST
    let nextFreeInfo: NextFreeInfo = {
      isCurrentlyFree: false,
      statusText: 'No availability found within the next 7 days.',
    };

    const currentUTCHour = now.getUTCHours();
    const todayTimeline = daysTimeline.find((d) => d.isToday) || daysTimeline[0];
    const activeWindowNow = todayTimeline.windows.find((w) => currentUTCHour >= w.startHour && currentUTCHour < w.endHour);

    if (activeWindowNow && activeWindowNow.state === 'FREE') {
      nextFreeInfo = {
        isCurrentlyFree: true,
        statusText: `Available until ${activeWindowNow.endFormatted}`,
        nextFreeDate: 'Today',
        nextFreeTime: activeWindowNow.endFormatted,
        durationFormatted: `${activeWindowNow.endHour - currentUTCHour}h remaining`,
      };
    } else {
      // Find the next upcoming free window
      let found = false;
      for (const day of daysTimeline) {
        for (const window of day.windows) {
          if (window.state === 'FREE') {
            if (!day.isToday || window.startHour > currentUTCHour) {
              nextFreeInfo = {
                isCurrentlyFree: false,
                statusText: `${day.isToday ? 'Today' : day.dayName} at ${window.startFormatted}`,
                nextFreeDate: day.isToday ? 'Today' : day.dayName,
                nextFreeTime: window.startFormatted,
                durationFormatted: `Available for ${window.endHour - window.startHour}h`,
              };
              found = true;
              break;
            }
          }
        }
        if (found) break;
      }
    }

    // Format upcoming commitments with IST dates
    const upcomingCommitments = user.assignedTasks.map((t) => ({
      id: t.taskIdDisplay || t.id,
      title: t.title,
      description: t.description,
      status: t.status,
      priority: t.priority,
      estimatedHours: t.estimatedHours,
      allocatedHours: t.allocatedHours,
      dueDate: t.dueDate ? t.dueDate.toISOString() : undefined,
      dueDateFormatted: t.dueDate ? formatToISTDateTime(t.dueDate) : 'Flexible',
      room: user.room ? `Sector ${user.room.letter}` : '—',
      subroom: user.subroom?.code || '—',
    }));

    const untilTimestamp = new Date(now.getTime() + 2 * 3600000);

    let currentDurationFormatted: string | undefined;
    if (user.arrivedAt && user.presenceState === 'IN') {
      const diffMs = now.getTime() - user.arrivedAt.getTime();
      const hours = Math.floor(diffMs / 3600000);
      const mins = Math.floor((diffMs % 3600000) / 60000);
      currentDurationFormatted = `${hours}h ${mins}m`;
    }

    return {
      person: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        avatarUrl: user.avatarUrl || undefined,
        title: user.title || undefined,
        room: user.room ? `Sector ${user.room.letter} (${user.room.name})` : undefined,
        subroom: user.subroom?.code,
        currentLocation: user.currentLocationName || (user.subroom ? user.subroom.code : (user.room ? `Sector ${user.room.letter}` : 'UNKNOWN')),
        attendanceState: user.presenceState === 'IN' ? 'IN' : user.presenceState === 'OUT' ? 'OUT' : 'UNKNOWN',
        presenceState: user.presenceState || PresenceState.UNKNOWN,
        arrivedAt: user.arrivedAt ? user.arrivedAt.toISOString() : undefined,
        arrivedAtIST: user.arrivedAt ? formatToISTTime(user.arrivedAt) : undefined,
        leftAt: user.leftAt ? user.leftAt.toISOString() : undefined,
        leftAtIST: user.leftAt ? formatToISTTime(user.leftAt) : undefined,
        currentDurationFormatted,
        lastSeenAt: user.lastSeenAt ? user.lastSeenAt.toISOString() : undefined,
        lastSeenAtIST: user.lastSeenAt ? formatToISTTime(user.lastSeenAt) : formatToISTTime(now),
        capacityLimitHours: user.capacityLimitHours,
        currentAllocatedHours: user.currentAllocatedHours,
      },
      currentStatus: {
        state: user.status === UserStatus.BUSY || user.assignedTasks[0]?.status === TaskStatus.IN_PROGRESS ? 'BUSY' : 'FREE',
        reason: user.assignedTasks[0] ? `Active Task: ${user.assignedTasks[0].taskIdDisplay || user.assignedTasks[0].title}` : (user.subroom ? `Assigned to Subroom ${user.subroom.code}` : 'Ready for work'),
        room: user.room ? `Sector ${user.room.letter}` : undefined,
        subroom: user.subroom?.code,
        until: formatToISTTime(untilTimestamp),
      },
      nextFree: nextFreeInfo,
      weeklyTimeline: daysTimeline,
      upcomingCommitments,
    };
  }

  private static getDayOfWeek(date: Date): DayOfWeek {
    const days: DayOfWeek[] = [
      DayOfWeek.SUNDAY,
      DayOfWeek.MONDAY,
      DayOfWeek.TUESDAY,
      DayOfWeek.WEDNESDAY,
      DayOfWeek.THURSDAY,
      DayOfWeek.FRIDAY,
      DayOfWeek.SATURDAY,
    ];
    return days[date.getUTCDay()];
  }
}
