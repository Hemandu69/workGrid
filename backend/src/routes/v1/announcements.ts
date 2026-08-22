import { FastifyPluginAsync } from 'fastify';
import { AnnouncementService } from '../../services/announcement.service.js';
import { createAnnouncementSchema, updateAnnouncementSchema } from '../../schemas/announcement.schema.js';
import { requireRole } from '../../plugins/auth.js';
import { paginationQuerySchema } from '../../schemas/pagination.schema.js';
import { withIdempotency } from '../../utils/idempotency-helper.js';
import { AnnouncementStatus, AudienceScope, UserRole } from '@prisma/client';

function sendError(reply: any, err: unknown, fallbackMessage: string) {
  const statusCode = (err as any)?.statusCode || 500;
  const message = err instanceof Error ? err.message : fallbackMessage;
  const error =
    statusCode === 404 ? 'Not Found' : statusCode === 403 ? 'Forbidden' : statusCode === 400 ? 'Bad Request' : 'Internal Server Error';
  return reply.status(statusCode).send({ statusCode, error, message });
}

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

  // PATCH /api/v1/announcements/:id
  // Protected: SUPER_ADMIN and ADMIN can edit announcements
  fastify.patch(
    '/:id',
    { preHandler: [requireRole([UserRole.SUPER_ADMIN, UserRole.ADMIN])] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parseResult = updateAnnouncementSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Validation failed',
          details: parseResult.error.format(),
        });
      }

      try {
        const announcement = await AnnouncementService.updateAnnouncement(id, parseResult.data, request.user);
        return reply.send(announcement);
      } catch (err: unknown) {
        return sendError(reply, err, 'Failed to update announcement');
      }
    }
  );

  // DELETE /api/v1/announcements/:id
  // Protected: SUPER_ADMIN and ADMIN can delete (soft-delete) announcements
  fastify.delete(
    '/:id',
    { preHandler: [requireRole([UserRole.SUPER_ADMIN, UserRole.ADMIN])] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        await AnnouncementService.deleteAnnouncement(id, request.user);
        return reply.status(204).send();
      } catch (err: unknown) {
        return sendError(reply, err, 'Failed to delete announcement');
      }
    }
  );

  // POST /api/v1/announcements/:id/pin
  // Protected: SUPER_ADMIN and ADMIN can pin announcements
  fastify.post(
    '/:id/pin',
    { preHandler: [requireRole([UserRole.SUPER_ADMIN, UserRole.ADMIN])] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const announcement = await AnnouncementService.setPinned(id, true, request.user);
        return reply.send(announcement);
      } catch (err: unknown) {
        return sendError(reply, err, 'Failed to pin announcement');
      }
    }
  );

  // POST /api/v1/announcements/:id/unpin
  // Protected: SUPER_ADMIN and ADMIN can unpin announcements
  fastify.post(
    '/:id/unpin',
    { preHandler: [requireRole([UserRole.SUPER_ADMIN, UserRole.ADMIN])] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const announcement = await AnnouncementService.setPinned(id, false, request.user);
        return reply.send(announcement);
      } catch (err: unknown) {
        return sendError(reply, err, 'Failed to unpin announcement');
      }
    }
  );
};
