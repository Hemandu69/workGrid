import { FastifyPluginAsync } from 'fastify';
import { AnnouncementService } from '../../services/announcement.service.js';
import { createAnnouncementSchema } from '../../schemas/announcement.schema.js';
import { requireRole } from '../../plugins/auth.js';
import { paginationQuerySchema } from '../../schemas/pagination.schema.js';
import { withIdempotency } from '../../utils/idempotency-helper.js';
import { AnnouncementStatus, AudienceScope, UserRole } from '@prisma/client';

export const announcementRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/v1/announcements
  // Always scoped to the authenticated caller's own organization — never
  // trust a client-supplied organizationId (none is even accepted here).
  fastify.get('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const query = request.query as {
      status?: string;
      scope?: string;
      targetRoom?: string;
    };

    const paginationResult = paginationQuerySchema.safeParse(request.query);
    if (!paginationResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Invalid pagination parameters',
        details: paginationResult.error.format(),
      });
    }

    try {
      const result = await AnnouncementService.getAnnouncements(
        {
          organizationId: request.user.organizationId,
          status: query.status ? (query.status.toUpperCase() as AnnouncementStatus) : undefined,
          scope: query.scope ? (query.scope.toUpperCase() as AudienceScope) : undefined,
          targetRoom: query.targetRoom,
        },
        paginationResult.data
      );

      return reply.send(result);
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
        await withIdempotency(request, reply, 'announcement.create', async () => {
          const announcement = await AnnouncementService.createAnnouncement(parseResult.data, request.user);
          return { statusCode: 201, body: announcement };
        });
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
