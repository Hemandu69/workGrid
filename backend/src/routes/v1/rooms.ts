import { FastifyPluginAsync } from 'fastify';
import { RoomService } from '../../services/room.service.js';
import { updateSubroomCapacitySchema } from '../../schemas/room.schema.js';
import { requireRole } from '../../plugins/auth.js';
import { UserRole } from '@prisma/client';

export const roomRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/v1/rooms
  fastify.get('/', async (request, reply) => {
    try {
      const rooms = await RoomService.getAllRooms();
      return reply.send(rooms);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fetch rooms';
      return reply.status(500).send({
        statusCode: 500,
        error: 'Internal Server Error',
        message,
      });
    }
  });

  // GET /api/v1/rooms/:letter
  fastify.get('/:letter', async (request, reply) => {
    const { letter } = request.params as { letter: string };
    try {
      const room = await RoomService.getRoomByLetter(letter);
      return reply.send(room);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Room not found';
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message,
      });
    }
  });

  // PATCH /api/v1/rooms/subrooms/:id/capacity
  // Protected: Only SUPER_ADMIN and ADMIN can adjust room capacities
  fastify.patch(
    '/subrooms/:id/capacity',
    {
      preHandler: [requireRole([UserRole.SUPER_ADMIN, UserRole.ADMIN])],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parseResult = updateSubroomCapacitySchema.safeParse(request.body);

      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Validation failed',
          details: parseResult.error.format(),
        });
      }

      try {
        const updated = await RoomService.updateSubroomCapacity(id, parseResult.data.memberCapacity);
        return reply.send({
          message: 'Subroom capacity updated successfully',
          subroom: updated,
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to update subroom capacity';
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message,
        });
      }
    }
  );
};
