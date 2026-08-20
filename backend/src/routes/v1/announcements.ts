import { FastifyPluginAsync } from 'fastify';
import { AnnouncementService } from '../../services/announcement.service.js';
import { createAnnouncementSchema } from '../../schemas/announcement.schema.js';
import { requireRole } from '../../plugins/auth.js';
import { AnnouncementStatus, AudienceScope, UserRole } from '@prisma/client';

export const announcementRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/v1/announcements
  fastify.get('/', async (request, reply) => {
    const query = request.query as {
      status?: string;
      scope?: string;
      targetRoom?: string;
    };

    try {
      const announcements = await AnnouncementService.getAnnouncements({
        status: query.status ? (query.status.toUpperCase() as AnnouncementStatus) : undefined,
        scope: query.scope ? (query.scope.toUpperCase() as AudienceScope) : undefined,
        targetRoom: query.targetRoom,
      });

      return reply.send(announcements);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to query announcements';
      return reply.status(500).send({
        statusCode: 500,
        error: 'Internal Server Error',
        message,
      });
    }
  });

  // POST /api/v1/announcements
  // Protected: SUPER_ADMIN and ADMIN can publish announcements
  fastify.post(
    '/',
    {
      preHandler: [requireRole([UserRole.SUPER_ADMIN, UserRole.ADMIN])],
    },
    async (request, reply) => {
      const parseResult = createAnnouncementSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Validation failed',
          details: parseResult.error.format(),
        });
      }

      try {
        const announcement = await AnnouncementService.createAnnouncement(parseResult.data, request.user);
        return reply.status(201).send(announcement);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to create announcement';
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message,
        });
      }
    }
  );
};
