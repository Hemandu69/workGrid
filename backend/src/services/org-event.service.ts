import { prisma } from '../db/client.js';
import { AccountStatus, EventResponseChoice, OrgEventStatus } from '@prisma/client';
import { CreateOrgEventInput, UpdateOrgEventInput } from '../schemas/org-event.schema.js';
import { AuthUserPayload } from '../plugins/auth.js';
import { publishDomainEvent } from '../events/domain-events.js';
import { convertISTToUTC, getISTDateTimeParts, formatToISTDate, formatToISTTime } from '../utils/time.js';

export class OrgEventNotFoundError extends Error {
  statusCode = 404;
  constructor(message = 'Event not found') {
    super(message);
  }
}

export class OrgEventForbiddenError extends Error {
  statusCode = 403;
  constructor(message = 'Not authorized to modify this event') {
    super(message);
  }
}

export class OrgEventLockedError extends Error {
  statusCode = 400;
  constructor(message: string) {
    super(message);
  }
}

/**
 * Effective status is derived from scheduledAt/scheduledEndAt/completedAt + cancellation
 * state, never trusted from a stale stored value. The clock alone can only ever move an
 * event as far as AWAITING_COMPLETION — only an explicit completeEvent() call (setting
 * completedAt) can make it COMPLETED.
 */
export type EffectiveOrgEventStatus = 'UPCOMING' | 'LIVE' | 'AWAITING_COMPLETION' | 'COMPLETED' | 'CANCELLED';

export function deriveEventStatus(
  scheduledAt: Date,
  scheduledEndAt: Date,
  completedAt: Date | null,
  storedStatus: OrgEventStatus,
  now: Date = new Date()
): EffectiveOrgEventStatus {
  if (storedStatus === OrgEventStatus.CANCELLED) return 'CANCELLED';
  if (completedAt != null) return 'COMPLETED';

  const nowMs = now.getTime();
  if (nowMs < scheduledAt.getTime()) return 'UPCOMING';
  if (nowMs < scheduledEndAt.getTime()) return 'LIVE';
  return 'AWAITING_COMPLETION';
}

function scheduledAtFromDateTime(date: string, time: string): Date {
  const [hourStr, minuteStr] = time.split(':');
  const { utcIso } = convertISTToUTC(date, parseInt(hourStr, 10), parseInt(minuteStr, 10));
  return new Date(utcIso);
}

function serializeEvent(
  event: {
    id: string;
    organizationId: string;
    title: string;
    description: string;
    scheduledAt: Date;
    scheduledEndAt: Date;
    completedAt: Date | null;
    status: OrgEventStatus;
    createdAt: Date;
    updatedAt: Date;
    createdBy: { id: string; name: string; role: string | null } | null;
    responses?: { userId: string; response: EventResponseChoice; respondedAt: Date }[];
  },
  currentUserId?: string
) {
  const effectiveStatus = deriveEventStatus(event.scheduledAt, event.scheduledEndAt, event.completedAt, event.status);
  const currentUserResponse = currentUserId
    ? event.responses?.find((r) => r.userId === currentUserId)?.response ?? null
    : null;

  return {
    id: event.id,
    organizationId: event.organizationId,
    title: event.title,
    description: event.description,
    scheduledAt: event.scheduledAt.toISOString(),
    scheduledEndAt: event.scheduledEndAt.toISOString(),
    dateIST: formatToISTDate(event.scheduledAt),
    timeIST: formatToISTTime(event.scheduledAt),
    endTimeIST: formatToISTTime(event.scheduledEndAt),
    status: effectiveStatus,
    completedAt: event.completedAt ? event.completedAt.toISOString() : null,
    createdById: event.createdBy?.id,
    createdByName: event.createdBy?.name || 'WorkGrid Administrator',
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString(),
    currentUserResponse,
  };
}

const CREATOR_SELECT = { id: true, name: true, role: true } as const;

export class OrgEventService {
  /**
   * Organization-scoped event list, visible to every authenticated user in the org.
   */
  static async listEvents(organizationId: string, currentUserId: string, statusFilter?: EffectiveOrgEventStatus) {
    const events = await prisma.organizationEvent.findMany({
      where: { organizationId },
      orderBy: { scheduledAt: 'asc' },
      include: {
        createdBy: { select: CREATOR_SELECT },
        responses: { where: { userId: currentUserId }, select: { userId: true, response: true, respondedAt: true } },
      },
    });

    const serialized = events.map((e) => serializeEvent(e, currentUserId));
    return statusFilter ? serialized.filter((e) => e.status === statusFilter) : serialized;
  }

  static async getEventById(eventId: string, organizationId: string, currentUserId: string) {
    const event = await prisma.organizationEvent.findUnique({
      where: { id: eventId },
      include: {
        createdBy: { select: CREATOR_SELECT },
        responses: { where: { userId: currentUserId }, select: { userId: true, response: true, respondedAt: true } },
      },
    });

    if (!event || event.organizationId !== organizationId) {
      throw new OrgEventNotFoundError();
    }

    return serializeEvent(event, currentUserId);
  }

  static async createEvent(input: CreateOrgEventInput, user: AuthUserPayload) {
    const scheduledAt = scheduledAtFromDateTime(input.date, input.time);
    const scheduledEndAt = scheduledAtFromDateTime(input.date, input.endTime);

    const event = await prisma.organizationEvent.create({
      data: {
        organizationId: user.organizationId,
        title: input.title,
        description: input.description,
        scheduledAt,
        scheduledEndAt,
        createdById: user.id,
      },
      include: { createdBy: { select: CREATOR_SELECT } },
    });

    const result = serializeEvent(event);

    publishDomainEvent({
      type: 'ORG_EVENT_CREATED',
      organizationId: user.organizationId,
      entityId: event.id,
      actorId: user.id,
      payload: { eventId: event.id, organizationId: user.organizationId, event: result },
    });

    return result;
  }

  static async updateEvent(eventId: string, input: UpdateOrgEventInput, user: AuthUserPayload) {
    const existing = await prisma.organizationEvent.findUnique({ where: { id: eventId } });
    if (!existing || existing.organizationId !== user.organizationId) {
      throw new OrgEventNotFoundError();
    }

    const effectiveStatus = deriveEventStatus(existing.scheduledAt, existing.scheduledEndAt, existing.completedAt, existing.status);
    if (effectiveStatus === 'COMPLETED') {
      throw new OrgEventLockedError('Completed events cannot be edited.');
    }
    if (effectiveStatus === 'CANCELLED') {
      throw new OrgEventLockedError('Cancelled events cannot be edited.');
    }

    const wantsTimeChange = Boolean(input.date || input.time || input.endTime);
    if (wantsTimeChange && (effectiveStatus === 'LIVE' || effectiveStatus === 'AWAITING_COMPLETION')) {
      throw new OrgEventLockedError('The date and time of an event that has already started cannot be changed.');
    }

    let scheduledAt = existing.scheduledAt;
    let scheduledEndAt = existing.scheduledEndAt;
    if (input.date || input.time || input.endTime) {
      const current = getISTDateTimeParts(existing.scheduledAt);
      const currentEnd = getISTDateTimeParts(existing.scheduledEndAt);
      const date = input.date || current.dateStr;
      const time = input.time || `${String(current.hour).padStart(2, '0')}:${String(current.minute).padStart(2, '0')}`;
      const endTime = input.endTime || `${String(currentEnd.hour).padStart(2, '0')}:${String(currentEnd.minute).padStart(2, '0')}`;
      scheduledAt = scheduledAtFromDateTime(date, time);
      scheduledEndAt = scheduledAtFromDateTime(date, endTime);
    }

    const event = await prisma.organizationEvent.update({
      where: { id: eventId },
      data: {
        title: input.title ?? undefined,
        description: input.description ?? undefined,
        scheduledAt,
        scheduledEndAt,
      },
      include: { createdBy: { select: CREATOR_SELECT } },
    });

    const result = serializeEvent(event);

    publishDomainEvent({
      type: 'ORG_EVENT_UPDATED',
      organizationId: user.organizationId,
      entityId: event.id,
      actorId: user.id,
      payload: { eventId: event.id, organizationId: user.organizationId, event: result },
    });

    return result;
  }

  static async cancelEvent(eventId: string, user: AuthUserPayload) {
    const existing = await prisma.organizationEvent.findUnique({ where: { id: eventId } });
    if (!existing || existing.organizationId !== user.organizationId) {
      throw new OrgEventNotFoundError();
    }

    const effectiveStatus = deriveEventStatus(existing.scheduledAt, existing.scheduledEndAt, existing.completedAt, existing.status);
    if (effectiveStatus === 'CANCELLED') {
      throw new OrgEventLockedError('Event is already cancelled.');
    }
    if (effectiveStatus === 'COMPLETED') {
      throw new OrgEventLockedError('Completed events cannot be cancelled.');
    }

    const event = await prisma.organizationEvent.update({
      where: { id: eventId },
      data: { status: OrgEventStatus.CANCELLED },
      include: { createdBy: { select: CREATOR_SELECT } },
    });

    const result = serializeEvent(event);

    publishDomainEvent({
      type: 'ORG_EVENT_CANCELLED',
      organizationId: user.organizationId,
      entityId: event.id,
      actorId: user.id,
      payload: { eventId: event.id, organizationId: user.organizationId, event: result },
    });

    return result;
  }

  /**
   * The clock alone can only ever bring an event as far as AWAITING_COMPLETION — only an
   * ADMIN/SUPER_ADMIN explicitly marking it done here sets completedAt, which is what
   * deriveEventStatus treats as authoritative for COMPLETED.
   */
  static async completeEvent(eventId: string, user: AuthUserPayload) {
    const existing = await prisma.organizationEvent.findUnique({ where: { id: eventId } });
    if (!existing || existing.organizationId !== user.organizationId) {
      throw new OrgEventNotFoundError();
    }

    const effectiveStatus = deriveEventStatus(existing.scheduledAt, existing.scheduledEndAt, existing.completedAt, existing.status);
    if (effectiveStatus === 'CANCELLED') {
      throw new OrgEventLockedError('Cancelled events cannot be marked as done.');
    }
    if (effectiveStatus === 'COMPLETED') {
      throw new OrgEventLockedError('Event is already marked as done.');
    }

    const event = await prisma.organizationEvent.update({
      where: { id: eventId },
      data: { completedAt: new Date() },
      include: { createdBy: { select: CREATOR_SELECT } },
    });

    const result = serializeEvent(event);

    publishDomainEvent({
      type: 'ORG_EVENT_COMPLETED',
      organizationId: user.organizationId,
      entityId: event.id,
      actorId: user.id,
      payload: { eventId: event.id, organizationId: user.organizationId, event: result },
    });

    return result;
  }

  /**
   * Every authenticated organization user may set/change their response while the event
   * is still open. Once an event is COMPLETED or CANCELLED, responses are locked to
   * preserve the final historical record.
   */
  static async upsertResponse(eventId: string, response: EventResponseChoice, user: AuthUserPayload) {
    const event = await prisma.organizationEvent.findUnique({ where: { id: eventId } });
    if (!event || event.organizationId !== user.organizationId) {
      throw new OrgEventNotFoundError();
    }

    const effectiveStatus = deriveEventStatus(event.scheduledAt, event.scheduledEndAt, event.completedAt, event.status);
    if (effectiveStatus === 'CANCELLED') {
      throw new OrgEventLockedError('Cannot respond to a cancelled event.');
    }
    if (effectiveStatus === 'COMPLETED') {
      throw new OrgEventLockedError('Cannot respond to a completed event.');
    }

    const existingResponse = await prisma.organizationEventResponse.findUnique({
      where: { eventId_userId: { eventId, userId: user.id } },
    });

    const now = new Date();
    const saved = await prisma.organizationEventResponse.upsert({
      where: { eventId_userId: { eventId, userId: user.id } },
      create: { eventId, userId: user.id, response, respondedAt: now },
      update: { response, respondedAt: now },
    });

    publishDomainEvent({
      type: 'ORG_EVENT_RESPONSE_CHANGED',
      organizationId: user.organizationId,
      entityId: eventId,
      actorId: user.id,
      payload: {
        eventId,
        organizationId: user.organizationId,
        userId: user.id,
        response: saved.response,
        previousResponse: existingResponse?.response ?? null,
        respondedAt: saved.respondedAt.toISOString(),
      },
    });

    return { eventId, userId: user.id, response: saved.response, respondedAt: saved.respondedAt.toISOString() };
  }

  /**
   * Eligible users = ACTIVE accounts within the requesting organization only.
   * This is the single authoritative source for "Total eligible" everywhere.
   */
  private static async getEligibleUserIds(organizationId: string): Promise<string[]> {
    const users = await prisma.user.findMany({
      where: { organizationId, accountStatus: AccountStatus.ACTIVE },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }

  static async getAnalytics(eventId: string, organizationId: string) {
    const event = await prisma.organizationEvent.findUnique({ where: { id: eventId } });
    if (!event || event.organizationId !== organizationId) {
      throw new OrgEventNotFoundError();
    }

    const eligibleIds = await this.getEligibleUserIds(organizationId);
    const eligibleSet = new Set(eligibleIds);

    const responses = eligibleIds.length
      ? await prisma.organizationEventResponse.findMany({
          where: { eventId, userId: { in: eligibleIds } },
          select: { userId: true, response: true },
        })
      : [];

    const attending = responses.filter((r) => r.response === EventResponseChoice.ATTENDING).length;
    const maybe = responses.filter((r) => r.response === EventResponseChoice.MAYBE).length;
    const notAttending = responses.filter((r) => r.response === EventResponseChoice.NOT_ATTENDING).length;
    const respondedIds = new Set(responses.map((r) => r.userId));
    const noResponse = eligibleIds.filter((id) => !respondedIds.has(id) && eligibleSet.has(id)).length;

    const totalEligible = eligibleIds.length;
    const attendanceRate = totalEligible > 0 ? Math.round((attending / totalEligible) * 100) : 0;

    return {
      eventId,
      totalEligible,
      attending,
      maybe,
      notAttending,
      noResponse,
      attendanceRate,
    };
  }

  static async getResponses(eventId: string, organizationId: string) {
    const event = await prisma.organizationEvent.findUnique({ where: { id: eventId } });
    if (!event || event.organizationId !== organizationId) {
      throw new OrgEventNotFoundError();
    }

    const eligibleUsers = await prisma.user.findMany({
      where: { organizationId, accountStatus: AccountStatus.ACTIVE },
      select: { id: true, name: true, email: true, avatarUrl: true, role: true },
    });
    const eligibleIds = eligibleUsers.map((u) => u.id);

    const responses = eligibleIds.length
      ? await prisma.organizationEventResponse.findMany({
          where: { eventId, userId: { in: eligibleIds } },
          select: { userId: true, response: true, respondedAt: true },
        })
      : [];

    const responseByUserId = new Map(responses.map((r) => [r.userId, r]));

    const breakdown: Record<'ATTENDING' | 'MAYBE' | 'NOT_ATTENDING' | 'NO_RESPONSE', Array<{
      id: string;
      name: string;
      email: string;
      avatarUrl?: string;
      role: string | null;
      respondedAt?: string;
    }>> = {
      ATTENDING: [],
      MAYBE: [],
      NOT_ATTENDING: [],
      NO_RESPONSE: [],
    };

    for (const u of eligibleUsers) {
      const r = responseByUserId.get(u.id);
      const bucket = r ? r.response : 'NO_RESPONSE';
      breakdown[bucket].push({
        id: u.id,
        name: u.name,
        email: u.email,
        avatarUrl: u.avatarUrl || undefined,
        role: u.role,
        respondedAt: r?.respondedAt.toISOString(),
      });
    }

    return breakdown;
  }
}
