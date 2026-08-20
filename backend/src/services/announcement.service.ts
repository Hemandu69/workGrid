import { prisma } from '../db/client.js';
import { CreateAnnouncementInput } from '../schemas/announcement.schema.js';
import { AuthUserPayload } from '../plugins/auth.js';
import { AnnouncementStatus, AudienceScope } from '@prisma/client';

export class AnnouncementService {
  static async getAnnouncements(filters: {
    status?: AnnouncementStatus;
    scope?: AudienceScope;
    targetRoom?: string;
    organizationId?: string;
  }) {
    const where: any = {};

    if (filters.organizationId) where.organizationId = filters.organizationId;
    if (filters.status) where.status = filters.status;
    if (filters.scope) where.scope = filters.scope;
    if (filters.targetRoom) where.targetRoom = filters.targetRoom;

    const announcements = await prisma.announcement.findMany({
      where,
      orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
      include: {
        author: true,
      },
    });

    return announcements.map((a) => ({
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
    }));
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

    return {
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
  }
}
