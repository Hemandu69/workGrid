import { FastifyPluginAsync } from 'fastify';
import { OrgEventService, EffectiveOrgEventStatus } from '../../services/org-event.service.js';
import { createOrgEventSchema, updateOrgEventSchema, updateOrgEventResponseSchema } from '../../schemas/org-event.schema.js';
import { requireRole } from '../../plugins/auth.js';
import { UserRole } from '@prisma/client';

const VALID_STATUS_FILTERS: EffectiveOrgEventStatus[] = ['UPCOMING', 'LIVE', 'COMPLETED', 'CANCELLED'];

function sendError(reply: any, err: unknown, fallbackMessage: string) {
  const statusCode = (err as any)?.statusCode || 500;
  const message = err instanceof Error ? err.message : fallbackMessage;
  const error =
    statusCode === 404 ? 'Not Found' : statusCode === 403 ? 'Forbidden' : statusCode === 400 ? 'Bad Request' : 'Internal Server Error';
  return reply.status(statusCode).send({ statusCode, error, message });
}

export const eventRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/v1/events — visible to every authenticated organization user
  fastify.get('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    try {
      const query = request.query as { status?: string };
      const statusFilter = query.status?.toUpperCase();
      const filter = VALID_STATUS_FILTERS.includes(statusFilter as EffectiveOrgEventStatus)
        ? (statusFilter as EffectiveOrgEventStatus)
        : undefined;

      const events = await OrgEventService.listEvents(request.user.organizationId, request.user.id, filter);
      return reply.send(events);
    } catch (err: unknown) {
      return sendError(reply, err, 'Failed to fetch events');
    }
  });

  // GET /api/v1/events/:id
  fastify.get('/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const event = await OrgEventService.getEventById(id, request.user.organizationId, request.user.id);
      return reply.send(event);
    } catch (err: unknown) {
      return sendError(reply, err, 'Event not found');
    }
  });

  // POST /api/v1/events — SUPER_ADMIN, ADMIN only
  fastify.post(
    '/',
    { preHandler: [requireRole([UserRole.SUPER_ADMIN, UserRole.ADMIN])] },
    async (request, reply) => {
      const parseResult = createOrgEventSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Validation failed',
          details: parseResult.error.format(),
        });
      }

      try {
        const event = await OrgEventService.createEvent(parseResult.data, request.user);
        return reply.status(201).send(event);
      } catch (err: unknown) {
        return sendError(reply, err, 'Failed to create event');
      }
    }
  );

  // PATCH /api/v1/events/:id — SUPER_ADMIN, ADMIN only
  fastify.patch(
    '/:id',
    { preHandler: [requireRole([UserRole.SUPER_ADMIN, UserRole.ADMIN])] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parseResult = updateOrgEventSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Validation failed',
          details: parseResult.error.format(),
        });
      }

      try {
        const event = await OrgEventService.updateEvent(id, parseResult.data, request.user);
        return reply.send(event);
      } catch (err: unknown) {
        return sendError(reply, err, 'Failed to update event');
      }
    }
  );

  // POST /api/v1/events/:id/cancel — SUPER_ADMIN, ADMIN only
  fastify.post(
    '/:id/cancel',
    { preHandler: [requireRole([UserRole.SUPER_ADMIN, UserRole.ADMIN])] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const event = await OrgEventService.cancelEvent(id, request.user);
        return reply.send(event);
      } catch (err: unknown) {
        return sendError(reply, err, 'Failed to cancel event');
      }
    }
  );

  // GET /api/v1/events/:id/analytics — SUPER_ADMIN, ADMIN only
  fastify.get(
    '/:id/analytics',
    { preHandler: [requireRole([UserRole.SUPER_ADMIN, UserRole.ADMIN])] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const analytics = await OrgEventService.getAnalytics(id, request.user.organizationId);
        return reply.send(analytics);
      } catch (err: unknown) {
        return sendError(reply, err, 'Failed to fetch event analytics');
      }
    }
  );

  // GET /api/v1/events/:id/responses — SUPER_ADMIN, ADMIN only
  fastify.get(
    '/:id/responses',
    { preHandler: [requireRole([UserRole.SUPER_ADMIN, UserRole.ADMIN])] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const breakdown = await OrgEventService.getResponses(id, request.user.organizationId);
        return reply.send(breakdown);
      } catch (err: unknown) {
        return sendError(reply, err, 'Failed to fetch event responses');
      }
    }
  );

  // PUT /api/v1/events/:id/response — every authenticated organization user
  fastify.put(
    '/:id/response',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parseResult = updateOrgEventResponseSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Validation failed',
          details: parseResult.error.format(),
        });
      }

      try {
        const result = await OrgEventService.upsertResponse(id, parseResult.data.response, request.user);
        return reply.send(result);
      } catch (err: unknown) {
        return sendError(reply, err, 'Failed to save event response');
      }
    }
  );
};
