import { FastifyPluginAsync } from 'fastify';
import { NotificationService } from '../../services/notification.service.js';
import { notificationKeyParamsSchema } from '../../schemas/notification.schema.js';

/**
 * Notification read state is strictly user-scoped: every handler derives the
 * owner from `request.user.id` (populated by the authenticate decorator from
 * the database, not from client-supplied claims). No route accepts a user id,
 * so there is no shape in which one user can address another's read state.
 */
export const notificationRoutes: FastifyPluginAsync = async (fastify) => {
  // ---------------------------------------------------------------------------
  // 1. GET /api/v1/notifications/read-state
  // The authenticated user's persisted read state, used to reconcile the
  // client-side feed on every load.
  // ---------------------------------------------------------------------------
  fastify.get('/read-state', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    try {
      const result = await NotificationService.getReadState(request.user.id);
      return reply.send(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load notification read state';
      return reply.status(500).send({
        statusCode: 500,
        error: 'Internal Server Error',
        message,
      });
    }
  });

  // ---------------------------------------------------------------------------
  // 2. POST /api/v1/notifications/read-all
  // Marks every currently-delivered notification read for this user. Idempotent.
  // ---------------------------------------------------------------------------
  fastify.post('/read-all', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    try {
      const result = await NotificationService.markAllRead(request.user.id);
      return reply.send(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to mark all notifications read';
      return reply.status(500).send({
        statusCode: 500,
        error: 'Internal Server Error',
        message,
      });
    }
  });

  // ---------------------------------------------------------------------------
  // 3. POST /api/v1/notifications/:notificationKey/read
  // Marks one notification read for this user. Idempotent.
  // ---------------------------------------------------------------------------
  fastify.post('/:notificationKey/read', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const parseResult = notificationKeyParamsSchema.safeParse(request.params);
    if (!parseResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Validation failed',
        details: parseResult.error.format(),
      });
    }

    try {
      const result = await NotificationService.markRead(request.user.id, parseResult.data.notificationKey);
      return reply.send(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to mark notification read';
      return reply.status(500).send({
        statusCode: 500,
        error: 'Internal Server Error',
        message,
      });
    }
  });
};
