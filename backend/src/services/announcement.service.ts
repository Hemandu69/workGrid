import { prisma } from '../db/client.js';
import { CreateAnnouncementInput, UpdateAnnouncementInput } from '../schemas/announcement.schema.js';
import { AuthUserPayload } from '../plugins/auth.js';
import { AnnouncementStatus, AudienceScope } from '@prisma/client';
import { publishDomainEvent } from '../events/domain-events.js';
import { DEFAULT_PAGE_LIMIT } from '../schemas/pagination.schema.js';

export class AnnouncementNotFoundError extends Error {
  statusCode = 404;
  constructor(message = 'Announcement not found') {
    super(message);
  }
}

function mapAnnouncement(a: {
  id: string;
  title: string;
  content: string;
  status: AnnouncementStatus;
  scope: AudienceScope;
  targetRoom: string | null;
  pinned: boolean;
  publishedAt: Date | null;
  scheduledFor: Date | null;
  createdAt: Date;
  author: { name: string; role: string | null } | null;
}) {
  return {
    id: a.id,
    title: a.title,
    content: a.content,
    status: a.status,
    scope: a.scope,
    targetRoom: a.targetRoom || undefined,
    authorName: a.author?.name || 'System Administrator',
    authorRole: a.author?.role ? a.author.role.replace('_', ' ') : 'Global Admin',
    pinned: a.pinned,
    publishedAt: a.publishedAt ? a.publishedAt.toISOString() : undefined,
    scheduledFor: a.scheduledFor ? a.scheduledFor.toISOString() : undefined,
    createdAt: a.createdAt.toISOString(),
  };
}

export class AnnouncementService {
  static async getAnnouncements(
    filters: {
      status?: AnnouncementStatus;
      scope?: AudienceScope;
      targetRoom?: string;
      organizationId?: string;
    },
    pagination: { limit: number; offset: number } = { limit: DEFAULT_PAGE_LIMIT, offset: 0 }
  ) {
    const where: any = {};

    if (filters.organizationId) where.organizationId = filters.organizationId;
    // Default excludes ARCHIVED (soft-deleted) announcements — a caller must
    // explicitly ask for status=ARCHIVED to see them.
    where.status = filters.status ? filters.status : { not: AnnouncementStatus.ARCHIVED };
    if (filters.scope) where.scope = filters.scope;
    if (filters.targetRoom) where.targetRoom = filters.targetRoom;

    const [total, announcements] = await prisma.$transaction(async (tx) => [
      await tx.announcement.count({ where }),
      await tx.announcement.findMany({
        where,
        orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
        include: {
          author: true,
        },
        take: pagination.limit,
        skip: pagination.offset,
      }),
    ]);

    return {
      items: announcements.map(mapAnnouncement),
      total,
      limit: pagination.limit,
      offset: pagination.offset,
    };
  }

  static async createAnnouncement(input: CreateAnnouncementInput, user: AuthUserPayload) {
    const announcement = await prisma.announcement.create({
      data: {
        organizationId: user.organizationId,
        title: input.title,
        content: input.content,
        scope: input.scope,
        targetRoom: input.targetRoom,
        status: input.status,
        pinned: input.pinned,
        authorId: user.id,
        publishedAt: input.status === AnnouncementStatus.PUBLISHED ? new Date() : undefined,
        scheduledFor: input.scheduledFor ? new Date(input.scheduledFor) : undefined,
      },
      include: {
        author: true,
      },
    });

    const result = {
      id: announcement.id,
      title: announcement.title,
      content: announcement.content,
      status: announcement.status,
      scope: announcement.scope,
      targetRoom: announcement.targetRoom || undefined,
      authorName: announcement.author?.name || user.name,
      authorRole: announcement.author?.role ? announcement.author.role.replace('_', ' ') : (user.role ? user.role.replace('_', ' ') : 'Global Admin'),
      pinned: announcement.pinned,
      publishedAt: announcement.publishedAt ? announcement.publishedAt.toISOString() : undefined,
      scheduledFor: announcement.scheduledFor ? announcement.scheduledFor.toISOString() : undefined,
      createdAt: announcement.createdAt.toISOString(),
    };

    publishDomainEvent({
      type: 'ANNOUNCEMENT_CREATED',
      organizationId: user.organizationId,
      entityId: announcement.id,
      actorId: user.id,
      payload: result,
    });

    return result;
  }

  static async updateAnnouncement(id: string, input: UpdateAnnouncementInput, user: AuthUserPayload) {
    const existing = await prisma.announcement.findUnique({ where: { id } });
    if (!existing || existing.organizationId !== user.organizationId) {
      throw new AnnouncementNotFoundError();
    }

    const updated = await prisma.announcement.update({
      where: { id },
      data: {
        title: input.title ?? undefined,
        content: input.content ?? undefined,
        scope: input.scope ?? undefined,
        targetRoom: input.targetRoom ?? undefined,
        scheduledFor: input.scheduledFor ? new Date(input.scheduledFor) : undefined,
      },
      include: { author: true },
    });

    const result = mapAnnouncement(updated);

    publishDomainEvent({
      type: 'ANNOUNCEMENT_UPDATED',
      organizationId: user.organizationId,
      entityId: id,
      actorId: user.id,
      payload: { announcementId: id, organizationId: user.organizationId, announcement: result },
    });

    return result;
  }

  static async deleteAnnouncement(id: string, user: AuthUserPayload) {
    const existing = await prisma.announcement.findUnique({ where: { id } });
    if (!existing || existing.organizationId !== user.organizationId) {
      throw new AnnouncementNotFoundError();
    }

    // Soft delete: the existing ARCHIVED status value (unused until now)
    // marks an announcement as removed while preserving the row.
    await prisma.announcement.update({
      where: { id },
      data: { status: AnnouncementStatus.ARCHIVED },
    });

    publishDomainEvent({
      type: 'ANNOUNCEMENT_DELETED',
      organizationId: user.organizationId,
      entityId: id,
      actorId: user.id,
      payload: { announcementId: id, organizationId: user.organizationId },
    });
  }

  static async setPinned(id: string, pinned: boolean, user: AuthUserPayload) {
    const existing = await prisma.announcement.findUnique({ where: { id } });
    if (!existing || existing.organizationId !== user.organizationId) {
      throw new AnnouncementNotFoundError();
    }

    const updated = await prisma.announcement.update({
      where: { id },
      data: { pinned },
      include: { author: true },
    });

    const result = mapAnnouncement(updated);

    publishDomainEvent({
      type: pinned ? 'ANNOUNCEMENT_PINNED' : 'ANNOUNCEMENT_UNPINNED',
      organizationId: user.organizationId,
      entityId: id,
      actorId: user.id,
      payload: { announcementId: id, organizationId: user.organizationId, announcement: result },
    });

    return result;
  }
}
