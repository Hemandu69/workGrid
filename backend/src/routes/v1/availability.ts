import { FastifyPluginAsync } from 'fastify';
import { AvailabilityService } from '../../services/availability.service.js';
import { updateWeeklyScheduleSchema } from '../../schemas/availability.schema.js';
import { requireRole } from '../../plugins/auth.js';
import { UserRole } from '@prisma/client';

export const availabilityRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/v1/availability/people (or /api/v1/users/availability/people)
  // Protected: Only SUPER_ADMIN and ADMIN can access organization-wide people availability overview
  fastify.get(
    '/availability/people',
    {
      preHandler: [requireRole([UserRole.SUPER_ADMIN, UserRole.ADMIN])],
    },
    async (request, reply) => {
      const query = request.query as {
        date?: string;
        startHour?: string;
        endHour?: string;
        status?: string;
        role?: string;
        room?: string;
        search?: string;
      };

      try {
        const result = await AvailabilityService.getPeopleAvailability({
          date: query.date,
          startHour: query.startHour ? parseInt(query.startHour, 10) : undefined,
          endHour: query.endHour ? parseInt(query.endHour, 10) : undefined,
          status: query.status,
          role: query.role,
          room: query.room,
          search: query.search,
        });

        return reply.send(result);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to query people availability';
        return reply.status(500).send({
          statusCode: 500,
          error: 'Internal Server Error',
          message,
        });
      }
    }
  );

  // GET /api/v1/availability/people/:id
  // Protected: Only SUPER_ADMIN and ADMIN can access detailed weekly person availability
  fastify.get(
    '/availability/people/:id',
    {
      preHandler: [requireRole([UserRole.SUPER_ADMIN, UserRole.ADMIN])],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const query = request.query as { startDate?: string };

      try {
        const result = await AvailabilityService.getPersonDetailedAvailability(id, query.startDate);
        return reply.send(result);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to query person detailed availability';
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message,
        });
      }
    }
  );

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
