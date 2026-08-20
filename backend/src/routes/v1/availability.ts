import { FastifyPluginAsync } from 'fastify';
import { AvailabilityService } from '../../services/availability.service.js';
import { updateWeeklyScheduleSchema } from '../../schemas/availability.schema.js';

export const availabilityRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/v1/users/:id/availability
  fastify.get('/users/:id/availability', async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const schedule = await AvailabilityService.getUserAvailability(id);
      return reply.send(schedule);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fetch user availability';
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message,
      });
    }
  });

  // PUT /api/v1/users/:id/availability
  // Protected: Authenticated users can update their own schedule
  fastify.put(
    '/users/:id/availability',
    {
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      // Ensure user is updating their own schedule (or is Admin)
      if (request.user.id !== id && request.user.role !== 'SUPER_ADMIN' && request.user.role !== 'ADMIN') {
        return reply.status(403).send({
          statusCode: 403,
          error: 'Forbidden',
          message: 'You are only authorized to update your own availability schedule',
        });
      }

      const parseResult = updateWeeklyScheduleSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Validation failed',
          details: parseResult.error.format(),
        });
      }

      try {
        const updated = await AvailabilityService.updateWeeklySchedule(id, parseResult.data);
        return reply.send(updated);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to update schedule';
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message,
        });
      }
    }
  );
};
