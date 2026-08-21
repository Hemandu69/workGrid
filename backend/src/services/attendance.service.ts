import { prisma } from '../db/client.js';
import { AccountStatus, PresenceState, TaskStatus, UserRole, UserStatus } from '@prisma/client';
import {
  AVAILABILITY_LABELS,
  availabilityFromUserStatus,
  userStatusFromAvailability,
} from '../utils/availability-projection.js';
import { formatToISTDate, formatToISTTime, getCurrentDate, APP_TIMEZONE, TIMEZONE_LABEL } from '../utils/time.js';
import { publishDomainEvent } from '../events/domain-events.js';

export interface AttendanceSessionDto {
  id: string;
  arrivedAt: string;
  arrivedAtIST: string;
  leftAt: string | null;
  leftAtIST: string | null;
  durationSeconds: number;
  durationFormatted: string;
}

export interface AttendanceMeResponse {
  state: 'IN' | 'OUT';
  presenceState: PresenceState;
  /** Authoritative operational availability, presence-suppressed when OUT. */
  availabilityState: 'FREE' | 'BUSY' | 'PARTIALLY_AVAILABLE' | 'UNAVAILABLE';
  availabilityLabel: string;
  currentSession: {
    id: string;
    arrivedAt: string;
    arrivedAtIST: string;
    durationSeconds: number;
  } | null;
  todaySummary: {
    totalSeconds: number;
    totalFormatted: string;
    sessionCount: number;
    firstArrivedAt?: string;
    firstArrivedAtIST?: string;
    lastLeftAt?: string;
    lastLeftAtIST?: string;
  };
  recentSessions: AttendanceSessionDto[];
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

export function formatDurationDetailed(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;

  const hh = hours.toString().padStart(2, '0');
  const mm = minutes.toString().padStart(2, '0');
  const ss = seconds.toString().padStart(2, '0');
  return `${hh}h ${mm}m ${ss}s`;
}

/**
 * Calculates start and end Date objects in UTC corresponding to the full 24h of today in IST
 */
export function getISTDayRange(targetDate: Date = new Date()): { startUtc: Date; endUtc: Date; istDateStr: string } {
  // Format target date into YYYY-MM-DD in Asia/Kolkata
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const istDateStr = formatter.format(targetDate); // e.g. "2026-08-20"

  // Construct start of day in IST: "2026-08-20T00:00:00+05:30"
  const startUtc = new Date(`${istDateStr}T00:00:00+05:30`);
  // End of day in IST: "2026-08-20T23:59:59.999+05:30"
  const endUtc = new Date(`${istDateStr}T23:59:59.999+05:30`);

  return { startUtc, endUtc, istDateStr };
}

export class AttendanceService {
  /**
   * Availability a person should hold on arrival: BUSY when work is already
   * assigned to them, otherwise FREE. Checking in must never leave someone
   * reading UNAVAILABLE, nor claim they are free while they hold live tasks.
   */
  private static async deriveArrivalAvailability(
    userId: string
  ): Promise<'FREE' | 'BUSY'> {
    const activeTaskCount =
      typeof prisma.task?.count === 'function'
        ? await prisma.task
            .count({
              where: {
                assigneeId: userId,
                status: { in: [TaskStatus.IN_PROGRESS, TaskStatus.ASSIGNED, TaskStatus.BLOCKED] },
              },
            })
            .catch(() => 0)
        : 0;

    return activeTaskCount > 0 ? 'BUSY' : 'FREE';
  }

  /**
   * Check In — Start a WorkGrid Attendance Period
   * Server timestamp is authoritative (UTC internal, presented in IST).
   * Idempotent: If already checked IN, returns the current active record.
   */
  static async checkIn(userId: string, ipAddress?: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      const error = new Error('User not found.');
      (error as any).statusCode = 404;
      throw error;
    }

    if (user.accountStatus !== AccountStatus.ACTIVE) {
      const error = new Error(`Account is in ${user.accountStatus} status. Only ACTIVE employees can check in.`);
      (error as any).statusCode = 403;
      throw error;
    }

    const now = getCurrentDate();

    // Check for an existing open attendance session
    const existingOpenRecord = await prisma.attendanceRecord.findFirst({
      where: {
        userId,
        leftAt: null,
      },
      orderBy: { arrivedAt: 'desc' },
    });

    if (existingOpenRecord) {
      const durationSeconds = Math.max(0, Math.floor((now.getTime() - existingOpenRecord.arrivedAt.getTime()) / 1000));

      // An open attendance record means the person IS present. If the user row
      // has drifted out of step (it can, because this idempotent path used to
      // return without touching it), reconcile it here — otherwise attendance
      // says IN while every availability projection still reads OUT.
      if (user.presenceState !== PresenceState.IN) {
        const reconciledAvailability = await this.deriveArrivalAvailability(user.id);

        await prisma.user.update({
          where: { id: user.id },
          data: {
            presenceState: PresenceState.IN,
            arrivedAt: existingOpenRecord.arrivedAt,
            leftAt: null,
            lastSeenAt: now,
            status: userStatusFromAvailability(reconciledAvailability),
          },
        });

        publishDomainEvent({
          type: 'AVAILABILITY_CHANGED',
          organizationId: user.organizationId,
          entityId: user.id,
          targetUserId: user.id,
          actorId: user.id,
          payload: {
            userId: user.id,
            personId: user.id,
            presenceState: PresenceState.IN,
            status: userStatusFromAvailability(reconciledAvailability),
            availabilityState: reconciledAvailability,
            availabilityLabel: AVAILABILITY_LABELS[reconciledAvailability],
            reconciled: true,
            isSimulated: false,
            timestamp: now.toISOString(),
          },
        });
      }

      return {
        state: 'IN' as const,
        presenceState: PresenceState.IN,
        recordId: existingOpenRecord.id,
        arrivedAt: existingOpenRecord.arrivedAt.toISOString(),
        arrivedAtIST: formatToISTTime(existingOpenRecord.arrivedAt),
        durationSeconds,
        durationFormatted: formatDuration(durationSeconds),
        isExistingSession: true,
        message: `Already checked IN at ${formatToISTTime(existingOpenRecord.arrivedAt)}.`,
      };
    }

    const arrivalAvailability = await this.deriveArrivalAvailability(user.id);

    // Atomically create attendance record and update user presence
    const result = await prisma.$transaction(async (tx) => {
      const record = await tx.attendanceRecord.create({
        data: {
          userId: user.id,
          organizationId: user.organizationId,
          arrivedAt: now,
          leftAt: null,
        },
      });

      await tx.user.update({
        where: { id: user.id },
        data: {
          presenceState: PresenceState.IN,
          arrivedAt: now,
          leftAt: null,
          lastSeenAt: now,
          status: userStatusFromAvailability(arrivalAvailability),
        },
      });

      if (typeof (tx as any).auditEvent?.create === 'function') {
        await (tx as any).auditEvent.create({
          data: {
            organizationId: user.organizationId,
            userId: user.id,
            action: 'ATTENDANCE_CHECK_IN',
            entityType: 'AttendanceRecord',
            entityId: record.id,
            details: { arrivedAt: now.toISOString(), arrivedAtIST: formatToISTTime(now) },
            ipAddress: ipAddress || null,
          },
        }).catch(() => null);
      }

      return record;
    });

    // Publish Real-Time Domain Events (Organization Scoped)
    publishDomainEvent({
      type: 'EMPLOYEE_CHECKED_IN',
      organizationId: user.organizationId,
      entityId: result.id,
      targetUserId: user.id,
      actorId: user.id,
      payload: {
        userId: user.id,
        userName: user.name,
        userRole: user.role,
        arrivedAt: now.toISOString(),
        arrivedAtIST: formatToISTTime(now),
        presenceState: PresenceState.IN,
      },
    });

    publishDomainEvent({
      type: 'ATTENDANCE_UPDATED',
      organizationId: user.organizationId,
      entityId: user.id,
      targetUserId: user.id,
      actorId: user.id,
      payload: {
        userId: user.id,
        state: 'IN',
        presenceState: PresenceState.IN,
        arrivedAt: now.toISOString(),
      },
    });

    publishDomainEvent({
      type: 'LOCATION_CHANGED',
      organizationId: user.organizationId,
      entityId: user.id,
      targetUserId: user.id,
      actorId: user.id,
      payload: {
        userId: user.id,
        userName: user.name,
        userRole: user.role,
        currentLocation: user.currentLocationName,
        presenceState: PresenceState.IN,
        roomId: user.roomId,
        subroomId: user.subroomId,
        timestamp: now.toISOString(),
      },
    });

    publishDomainEvent({
      type: 'ROOM_STATUS_CHANGED',
      organizationId: user.organizationId,
      entityId: user.roomId || user.id,
      targetUserId: user.id,
      actorId: user.id,
      payload: {
        userId: user.id,
        roomId: user.roomId,
        subroomId: user.subroomId,
        presenceState: PresenceState.IN,
      },
    });

    publishDomainEvent({
      type: 'AVAILABILITY_CHANGED',
      organizationId: user.organizationId,
      entityId: user.id,
      targetUserId: user.id,
      actorId: user.id,
      payload: {
        userId: user.id,
        personId: user.id,
        presenceState: PresenceState.IN,
        status: userStatusFromAvailability(arrivalAvailability),
        availabilityState: arrivalAvailability,
        availabilityLabel: AVAILABILITY_LABELS[arrivalAvailability],
        isSimulated: false,
        timestamp: now.toISOString(),
      },
    });

    return {
      state: 'IN' as const,
      presenceState: PresenceState.IN,
      recordId: result.id,
      arrivedAt: now.toISOString(),
      arrivedAtIST: formatToISTTime(now),
      durationSeconds: 0,
      durationFormatted: '0m',
      isExistingSession: false,
      message: `Checked IN at ${formatToISTTime(now)}.`,
    };
  }

  /**
   * Check Out — End the Current Attendance Period
   * Server timestamp is authoritative.
   * Idempotent: If already checked OUT, returns safe response.
   */
  static async checkOut(userId: string, ipAddress?: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      const error = new Error('User not found.');
      (error as any).statusCode = 404;
      throw error;
    }

    if (user.accountStatus !== AccountStatus.ACTIVE) {
      const error = new Error(`Account is in ${user.accountStatus} status. Only ACTIVE employees can check out.`);
      (error as any).statusCode = 403;
      throw error;
    }

    const now = getCurrentDate();

    // Find the current open attendance record
    const openRecord = await prisma.attendanceRecord.findFirst({
      where: {
        userId,
        leftAt: null,
      },
      orderBy: { arrivedAt: 'desc' },
    });

    if (!openRecord) {
      // User is already OUT
      const lastLeftAt = user.leftAt || now;
      return {
        state: 'OUT' as const,
        presenceState: PresenceState.OUT,
        leftAt: lastLeftAt.toISOString(),
        leftAtIST: formatToISTTime(lastLeftAt),
        durationSeconds: 0,
        durationFormatted: '0m',
        isAlreadyOut: true,
        message: 'No active check-in session found. You are currently marked OUT.',
      };
    }

    const durationSeconds = Math.max(0, Math.floor((now.getTime() - openRecord.arrivedAt.getTime()) / 1000));

    // Atomically close attendance session and update user presence
    const result = await prisma.$transaction(async (tx) => {
      const updatedRecord = await tx.attendanceRecord.update({
        where: { id: openRecord.id },
        data: {
          leftAt: now,
          durationSeconds,
        },
      });

      await tx.user.update({
        where: { id: user.id },
        data: {
          presenceState: PresenceState.OUT,
          leftAt: now,
          lastSeenAt: now,
          status: 'OFFLINE',
        },
      });

      if (typeof (tx as any).auditEvent?.create === 'function') {
        await (tx as any).auditEvent.create({
          data: {
            organizationId: user.organizationId,
            userId: user.id,
            action: 'ATTENDANCE_CHECK_OUT',
            entityType: 'AttendanceRecord',
            entityId: updatedRecord.id,
            details: {
              arrivedAt: openRecord.arrivedAt.toISOString(),
              leftAt: now.toISOString(),
              durationSeconds,
              durationFormatted: formatDuration(durationSeconds),
            },
            ipAddress: ipAddress || null,
          },
        }).catch(() => null);
      }

      return updatedRecord;
    });

    // Publish Real-Time Domain Events (Organization Scoped)
    publishDomainEvent({
      type: 'EMPLOYEE_CHECKED_OUT',
      organizationId: user.organizationId,
      entityId: result.id,
      targetUserId: user.id,
      actorId: user.id,
      payload: {
        userId: user.id,
        userName: user.name,
        userRole: user.role,
        leftAt: now.toISOString(),
        leftAtIST: formatToISTTime(now),
        durationSeconds,
        durationFormatted: formatDuration(durationSeconds),
        presenceState: PresenceState.OUT,
      },
    });

    publishDomainEvent({
      type: 'ATTENDANCE_UPDATED',
      organizationId: user.organizationId,
      entityId: user.id,
      targetUserId: user.id,
      actorId: user.id,
      payload: {
        userId: user.id,
        state: 'OUT',
        presenceState: PresenceState.OUT,
        leftAt: now.toISOString(),
      },
    });

    publishDomainEvent({
      type: 'LOCATION_CHANGED',
      organizationId: user.organizationId,
      entityId: user.id,
      targetUserId: user.id,
      actorId: user.id,
      payload: {
        userId: user.id,
        userName: user.name,
        userRole: user.role,
        currentLocation: 'Outside',
        presenceState: PresenceState.OUT,
        roomId: user.roomId,
        subroomId: user.subroomId,
        timestamp: now.toISOString(),
      },
    });

    publishDomainEvent({
      type: 'ROOM_STATUS_CHANGED',
      organizationId: user.organizationId,
      entityId: user.roomId || user.id,
      targetUserId: user.id,
      actorId: user.id,
      payload: {
        userId: user.id,
        roomId: user.roomId,
        subroomId: user.subroomId,
        presenceState: PresenceState.OUT,
      },
    });

    publishDomainEvent({
      type: 'AVAILABILITY_CHANGED',
      organizationId: user.organizationId,
      entityId: user.id,
      targetUserId: user.id,
      actorId: user.id,
      payload: {
        userId: user.id,
        personId: user.id,
        presenceState: PresenceState.OUT,
        status: UserStatus.OFFLINE,
        // Presence dominates: leaving projects UNAVAILABLE everywhere.
        availabilityState: 'UNAVAILABLE',
        availabilityLabel: AVAILABILITY_LABELS.UNAVAILABLE,
        currentLocation: 'Outside',
        isSimulated: false,
        timestamp: now.toISOString(),
      },
    });

    return {
      state: 'OUT' as const,
      presenceState: PresenceState.OUT,
      recordId: result.id,
      arrivedAt: openRecord.arrivedAt.toISOString(),
      arrivedAtIST: formatToISTTime(openRecord.arrivedAt),
      leftAt: now.toISOString(),
      leftAtIST: formatToISTTime(now),
      durationSeconds,
      durationFormatted: formatDuration(durationSeconds),
      message: `Checked OUT at ${formatToISTTime(now)}. Worked for ${formatDuration(durationSeconds)}.`,
    };
  }

  /**
   * Authoritative Live Attendance & Today's Summary for the Authenticated User
   */
  static async getCurrentUserAttendance(userId: string): Promise<AttendanceMeResponse> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      const error = new Error('User not found.');
      (error as any).statusCode = 404;
      throw error;
    }

    const now = getCurrentDate();
    const { startUtc, endUtc } = getISTDayRange(now);

    // Fetch today's records for this user
    const todayRecords = await prisma.attendanceRecord.findMany({
      where: {
        userId,
        arrivedAt: {
          gte: startUtc,
          lte: endUtc,
        },
      },
      orderBy: { arrivedAt: 'asc' },
    });

    // Check for open session
    const openRecord = todayRecords.find((r) => r.leftAt === null) ||
      await prisma.attendanceRecord.findFirst({
        where: { userId, leftAt: null },
        orderBy: { arrivedAt: 'desc' },
      });

    let totalSeconds = 0;
    for (const r of todayRecords) {
      if (r.durationSeconds !== null && r.durationSeconds !== undefined) {
        totalSeconds += r.durationSeconds;
      } else if (r.leftAt === null) {
        totalSeconds += Math.max(0, Math.floor((now.getTime() - r.arrivedAt.getTime()) / 1000));
      }
    }

    const firstRecord = todayRecords[0];
    const completedRecords = todayRecords.filter((r) => r.leftAt !== null);
    const lastCompletedRecord = completedRecords[completedRecords.length - 1];

    const currentSession = openRecord
      ? {
          id: openRecord.id,
          arrivedAt: openRecord.arrivedAt.toISOString(),
          arrivedAtIST: formatToISTTime(openRecord.arrivedAt),
          durationSeconds: Math.max(0, Math.floor((now.getTime() - openRecord.arrivedAt.getTime()) / 1000)),
        }
      : null;

    const recentSessions: AttendanceSessionDto[] = todayRecords.map((r) => {
      const dur = r.durationSeconds ?? (r.leftAt ? 0 : Math.max(0, Math.floor((now.getTime() - r.arrivedAt.getTime()) / 1000)));
      return {
        id: r.id,
        arrivedAt: r.arrivedAt.toISOString(),
        arrivedAtIST: formatToISTTime(r.arrivedAt),
        leftAt: r.leftAt ? r.leftAt.toISOString() : null,
        leftAtIST: r.leftAt ? formatToISTTime(r.leftAt) : null,
        durationSeconds: dur,
        durationFormatted: formatDuration(dur),
      };
    });

    // Presence dominates: an open session means the stored availability applies,
    // otherwise the person reads UNAVAILABLE regardless of what is stored.
    const projectedAvailability = openRecord
      ? availabilityFromUserStatus(user.status)
      : ('UNAVAILABLE' as const);

    return {
      state: openRecord ? 'IN' : 'OUT',
      presenceState: openRecord ? PresenceState.IN : PresenceState.OUT,
      availabilityState: projectedAvailability,
      availabilityLabel: AVAILABILITY_LABELS[projectedAvailability],
      currentSession,
      todaySummary: {
        totalSeconds,
        totalFormatted: formatDuration(totalSeconds),
        sessionCount: todayRecords.length,
        firstArrivedAt: firstRecord?.arrivedAt.toISOString(),
        firstArrivedAtIST: firstRecord ? formatToISTTime(firstRecord.arrivedAt) : undefined,
        lastLeftAt: !openRecord && lastCompletedRecord ? lastCompletedRecord.leftAt?.toISOString() : undefined,
        lastLeftAtIST: !openRecord && lastCompletedRecord && lastCompletedRecord.leftAt ? formatToISTTime(lastCompletedRecord.leftAt) : undefined,
      },
      recentSessions,
    };
  }

  /**
   * Get User Attendance History Grouped by IST Date
   */
  static async getAttendanceHistory(userId: string, limitDays = 30) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      const error = new Error('User not found.');
      (error as any).statusCode = 404;
      throw error;
    }

    const records = await prisma.attendanceRecord.findMany({
      where: { userId },
      orderBy: { arrivedAt: 'desc' },
      take: limitDays * 5, // up to 5 sessions/day
    });

    // Group records by IST Date (e.g. "20 Aug 2026")
    const groupsMap = new Map<string, {
      date: string;
      dateFormatted: string;
      totalSeconds: number;
      sessions: AttendanceSessionDto[];
    }>();

    for (const r of records) {
      const dateKey = formatToISTDate(r.arrivedAt);
      if (!groupsMap.has(dateKey)) {
        groupsMap.set(dateKey, {
          date: dateKey,
          dateFormatted: dateKey,
          totalSeconds: 0,
          sessions: [],
        });
      }

      const grp = groupsMap.get(dateKey)!;
      const dur = r.durationSeconds ?? (r.leftAt ? 0 : Math.max(0, Math.floor((new Date().getTime() - r.arrivedAt.getTime()) / 1000)));
      grp.totalSeconds += dur;
      grp.sessions.push({
        id: r.id,
        arrivedAt: r.arrivedAt.toISOString(),
        arrivedAtIST: formatToISTTime(r.arrivedAt),
        leftAt: r.leftAt ? r.leftAt.toISOString() : null,
        leftAtIST: r.leftAt ? formatToISTTime(r.leftAt) : null,
        durationSeconds: dur,
        durationFormatted: formatDuration(dur),
      });
    }

    const history = Array.from(groupsMap.values()).map((g) => ({
      ...g,
      totalFormatted: formatDuration(g.totalSeconds),
    }));

    return {
      userId,
      userName: user.name,
      totalDays: history.length,
      history,
    };
  }

  /**
   * Administrative & HR Attendance Overview across the Organization
   */
  static async getAttendanceOverview(
    organizationId: string,
    filters: {
      role?: UserRole;
      presenceState?: PresenceState;
      search?: string;
    } = {}
  ) {
    const where: any = {
      organizationId,
      accountStatus: AccountStatus.ACTIVE,
    };

    if (filters.role) where.role = filters.role;
    if (filters.presenceState) where.presenceState = filters.presenceState;
    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { email: { contains: filters.search, mode: 'insensitive' } },
        { title: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const now = getCurrentDate();
    const { startUtc, endUtc } = getISTDayRange(now);

    const users = await prisma.user.findMany({
      where,
      orderBy: [{ presenceState: 'asc' }, { name: 'asc' }],
      include: {
        room: true,
        subroom: true,
        attendanceRecords: {
          where: {
            arrivedAt: {
              gte: startUtc,
              lte: endUtc,
            },
          },
          orderBy: { arrivedAt: 'asc' },
        },
      },
    });

    const overview = users.map((u) => {
      const openRecord = u.attendanceRecords.find((r) => r.leftAt === null);
      let todaySeconds = 0;
      for (const r of u.attendanceRecords) {
        if (r.durationSeconds !== null && r.durationSeconds !== undefined) {
          todaySeconds += r.durationSeconds;
        } else if (r.leftAt === null) {
          todaySeconds += Math.max(0, Math.floor((now.getTime() - r.arrivedAt.getTime()) / 1000));
        }
      }

      const currentDuration = openRecord
        ? Math.max(0, Math.floor((now.getTime() - openRecord.arrivedAt.getTime()) / 1000))
        : 0;

      return {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        title: u.title,
        avatarUrl: u.avatarUrl,
        room: u.room ? `Section ${u.room.letter}` : undefined,
        subroom: u.subroom?.code,
        presenceState: u.presenceState,
        isCurrentlyIn: u.presenceState === PresenceState.IN,
        arrivedAt: u.arrivedAt ? u.arrivedAt.toISOString() : undefined,
        arrivedAtIST: u.arrivedAt ? formatToISTTime(u.arrivedAt) : undefined,
        leftAt: u.leftAt ? u.leftAt.toISOString() : undefined,
        leftAtIST: u.leftAt ? formatToISTTime(u.leftAt) : undefined,
        currentDurationSeconds: currentDuration,
        currentDurationFormatted: formatDuration(currentDuration),
        todayTotalSeconds: todaySeconds,
        todayTotalFormatted: formatDuration(todaySeconds),
        sessionCount: u.attendanceRecords.length,
      };
    });

    const totalActiveUsers = overview.length;
    const totalPresentIn = overview.filter((p) => p.isCurrentlyIn).length;
    const totalPresentOut = totalActiveUsers - totalPresentIn;

    return {
      stats: {
        totalActiveUsers,
        totalPresentIn,
        totalPresentOut,
      },
      people: overview,
    };
  }
}
