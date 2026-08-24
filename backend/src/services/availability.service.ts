import { prisma } from '../db/client.js';
import { UserRole, TaskStatus, PresenceState } from '@prisma/client';
import { publishDomainEvent } from '../events/domain-events.js';
import {
  AvailabilityState,
  availabilityFromUserStatus,
  userStatusFromAvailability,
  deriveAvailability,
  deriveTaskDrivenAvailability,
  resolveCurrentLocation,
  isPresent,
  AVAILABILITY_LABELS,
} from '../utils/availability-projection.js';
import { formatToISTTime, formatToISTDateTime } from '../utils/time.js';

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
  activeTask?: {
    id: string;
    title: string;
    priority: string;
    dueDate?: string;
  };
}

export class AvailabilityService {
  /**
   * Sets a person's authoritative operational availability (FREE / BUSY /
   * PARTIALLY_AVAILABLE / UNAVAILABLE) and broadcasts it organization-wide.
   * Room assignment is never touched — availability and location are separate
   * pieces of state. This is a live presence-derived signal, distinct from —
   * and never to be confused with — event attendance (see OrgEventService),
   * which belongs to a specific event, not to "right now."
   */
  static async setAvailabilityState(
    personId: string,
    state: AvailabilityState,
    actor: { id: string; organizationId: string }
  ) {
    const now = new Date();

    const user = await prisma.user.findUnique({
      where: { id: personId },
      include: { room: true, subroom: true },
    });

    if (!user) {
      const error = new Error(`Person ${personId} not found.`);
      (error as any).statusCode = 404;
      throw error;
    }

    // Presence dominates availability: someone who has not checked IN cannot be
    // marked FREE or BUSY, because every projection would suppress it anyway.
    if (!isPresent(user.presenceState) && state !== 'UNAVAILABLE') {
      const error = new Error(
        `${user.name} is currently checked OUT. Check in before setting availability to ${state}.`
      );
      (error as any).statusCode = 409;
      throw error;
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        status: userStatusFromAvailability(state),
        lastSeenAt: now,
      },
    });

    const currentLocation = resolveCurrentLocation({
      presenceState: updated.presenceState,
      currentLocationName: updated.currentLocationName,
      subroomCode: user.subroom?.code,
      roomLetter: user.room?.letter,
    });

    // Payload is intentionally minimal — never put name/status/location on
    // the wire here; authorized clients refetch the (correctly role-scoped)
    // REST endpoints on receipt. See socket.ts's dedicated AVAILABILITY_CHANGED
    // dispatch branch for delivery scoping.
    publishDomainEvent({
      type: 'AVAILABILITY_CHANGED',
      organizationId: user.organizationId,
      entityId: user.id,
      targetUserId: user.id,
      actorId: actor.id,
      payload: {
        userId: user.id,
        personId: user.id,
        organizationId: user.organizationId,
        roomId: user.roomId,
        subroomId: user.subroomId,
      },
    });

    return {
      personId: updated.id,
      name: updated.name,
      availabilityState: state,
      availabilityLabel: AVAILABILITY_LABELS[state],
      presenceState: updated.presenceState,
      currentLocation,
    };
  }

  /**
   * Applies a task-driven availability transition and broadcasts it.
   * Used when a task is assigned to or completed by a real account.
   */
  static async syncAvailabilityWithTasks(userId: string, actorId?: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !isPresent(user.presenceState)) return null;

    const activeTaskCount = await prisma.task.count({
      where: {
        assigneeId: userId,
        status: { in: [TaskStatus.IN_PROGRESS, TaskStatus.ASSIGNED, TaskStatus.BLOCKED] },
      },
    });

    const nextState = deriveTaskDrivenAvailability(
      availabilityFromUserStatus(user.status),
      activeTaskCount > 0
    );

    if (!nextState) return null;

    return this.setAvailabilityState(userId, nextState, {
      id: actorId || userId,
      organizationId: user.organizationId,
    });
  }

  /**
   * Enterprise-wide People Availability Overview — always the LIVE
   * operational status (presence + stored availability + active task),
   * never a scheduled/hourly projection. There is no "as of a chosen time
   * window" mode any more: availability is either what it is right now, or
   * it's an event-attendance decision (OrgEventService), never a generic
   * hourly slot.
   */
  static async getPeopleAvailability(filters: {
    status?: string;
    role?: string;
    room?: string;
    search?: string;
    organizationId?: string;
  }) {
    const now = new Date();

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

      const projected = deriveAvailability({
        presenceState: user.presenceState,
        storedState: availabilityFromUserStatus(user.status),
        activeTaskLabel: activeTask ? activeTask.taskIdDisplay || activeTask.title : null,
        locationLabel: user.subroom ? `Subroom ${user.subroom.code}` : undefined,
      });

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
        room: user.room ? `Section ${user.room.letter}` : undefined,
        subroom: user.subroom?.code,
        // Authoritative: a person who is not checked IN is "Outside", even
        // though their permanent room assignment is unchanged.
        currentLocation: resolveCurrentLocation({
          presenceState: user.presenceState,
          currentLocationName: user.currentLocationName,
          subroomCode: user.subroom?.code,
          roomLetter: user.room?.letter,
        }),
        attendanceState: user.presenceState === 'IN' ? 'IN' : user.presenceState === 'OUT' ? 'OUT' : 'UNKNOWN',
        presenceState: user.presenceState || PresenceState.UNKNOWN,
        arrivedAt: user.arrivedAt ? user.arrivedAt.toISOString() : undefined,
        arrivedAtIST: user.arrivedAt ? formatToISTTime(user.arrivedAt) : undefined,
        leftAt: user.leftAt ? user.leftAt.toISOString() : undefined,
        leftAtIST: user.leftAt ? formatToISTTime(user.leftAt) : undefined,
        currentDurationFormatted,
        lastSeenAt: user.lastSeenAt ? user.lastSeenAt.toISOString() : undefined,
        lastSeenAtIST: user.lastSeenAt ? formatToISTTime(user.lastSeenAt) : formatToISTTime(now),
        status: projected.state,
        statusLabel: projected.label,
        reason: projected.reason,
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

    return {
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
   * Live snapshot for a selected person: identity, presence/location, their
   * current operational status, and their active task commitments. No
   * schedule, no timeline, no "next free" projection — those belonged to the
   * retired hourly availability model. A person's future plans are now
   * expressed as event attendance (OrgEventService), viewed per-event, not
   * per-person.
   */
  static async getPersonDetailedAvailability(userId: string) {
    const now = new Date();

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        room: true,
        subroom: true,
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
      room: user.room ? `Section ${user.room.letter}` : '—',
      subroom: user.subroom?.code || '—',
    }));

    let currentDurationFormatted: string | undefined;
    if (user.arrivedAt && user.presenceState === 'IN') {
      const diffMs = now.getTime() - user.arrivedAt.getTime();
      const hours = Math.floor(diffMs / 3600000);
      const mins = Math.floor((diffMs % 3600000) / 60000);
      currentDurationFormatted = `${hours}h ${mins}m`;
    }

    // One authoritative projection drives both the status box and the avatar
    // badge, so they can never disagree about whether someone is free.
    const userProjection = deriveAvailability({
      presenceState: user.presenceState,
      storedState: availabilityFromUserStatus(user.status),
      activeTaskLabel: user.assignedTasks[0]
        ? user.assignedTasks[0].taskIdDisplay || user.assignedTasks[0].title
        : null,
      locationLabel: user.subroom ? `Subroom ${user.subroom.code}` : undefined,
    });

    return {
      person: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: userStatusFromAvailability(userProjection.state),
        availabilityState: userProjection.state,
        avatarUrl: user.avatarUrl || undefined,
        title: user.title || undefined,
        room: user.room ? `Section ${user.room.letter} (${user.room.name})` : undefined,
        subroom: user.subroom?.code,
        currentLocation: resolveCurrentLocation({
          presenceState: user.presenceState,
          currentLocationName: user.currentLocationName,
          subroomCode: user.subroom?.code,
          roomLetter: user.room?.letter,
        }),
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
        state: userProjection.state,
        label: userProjection.label,
        reason: userProjection.reason,
        room: user.room ? `Section ${user.room.letter}` : undefined,
        subroom: user.subroom?.code,
      },
      upcomingCommitments,
    };
  }
}
