import { FastifyPluginAsync } from 'fastify';
import { RoomService } from '../../services/room.service.js';
import { updateSubroomCapacitySchema, assignRoomSchema } from '../../schemas/room.schema.js';
import { requireRole } from '../../plugins/auth.js';
import { UserRole } from '@prisma/client';
import { prisma } from '../../db/client.js';

function sendAssignmentError(reply: any, err: unknown, fallbackMessage: string) {
  const statusCode = (err as any)?.statusCode || 400;
  const message = err instanceof Error ? err.message : fallbackMessage;
  const error = statusCode === 404 ? 'Not Found' : statusCode === 403 ? 'Forbidden' : 'Bad Request';
  return reply.status(statusCode).send({ statusCode, error, message });
}

export const roomRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/v1/rooms
  // Protected: authenticated users only, always scoped to their own organization.
  fastify.get(
    '/',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const rooms = await RoomService.getAllRooms(request.user.organizationId);
        return reply.send(rooms);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to fetch rooms';
        return reply.status(500).send({
          statusCode: 500,
          error: 'Internal Server Error',
          message,
        });
      }
    }
  );

  // GET /api/v1/rooms/:letter
  // If called with a SERVER token, enforces that the Server can only inspect their assigned room.
  fastify.get('/:letter', async (request, reply) => {
    const { letter } = request.params as { letter: string };

    // Optional auth check for role boundary enforcement
    if (request.headers.authorization) {
      try {
        await request.jwtVerify();
        if (request.user.role === UserRole.SERVER) {
          const serverUser = await prisma.user.findUnique({
            where: { id: request.user.id },
            include: { room: true },
          });

          if (!serverUser?.room) {
            return reply.status(403).send({
              statusCode: 403,
              error: 'Forbidden',
              message: 'Server has no assigned room scope.',
            });
          }

          if (serverUser.room.letter.toUpperCase() !== letter.toUpperCase()) {
            return reply.status(403).send({
              statusCode: 403,
              error: 'Forbidden',
              message: `As a Server for Section ${serverUser.room.letter}, you are not authorized to inspect Section ${letter.toUpperCase()}.`,
            });
          }
        }
      } catch {
        // Continue if unauthenticated public call
      }
    }

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

  // POST /api/v1/rooms/:id/servers
  // Protected: SUPER_ADMIN and ADMIN can assign servers to a room (max 3 servers per room)
  fastify.post(
    '/:id/servers',
    {
      preHandler: [requireRole([UserRole.SUPER_ADMIN, UserRole.ADMIN])],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { userId } = request.body as { userId: string };

      if (!userId) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'userId is required',
        });
      }

      try {
        const updated = await RoomService.assignServerToRoom(id, userId);
        return reply.send({
          message: 'Server assigned to room successfully',
          user: updated,
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to assign server to room';
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message,
        });
      }
    }
  );

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

  // ---------------------------------------------------------------------------
  // Dynamic Room/Subroom Assignment — single authoritative source, works for
  // both real (PostgreSQL) users and simulated in-memory test personnel.
  // Protected: SUPER_ADMIN and ADMIN only (existing people/operations
  // management boundary — matches POST /:id/servers above).
  // ---------------------------------------------------------------------------

  // GET /api/v1/rooms/assignment/me — any authenticated user's own section,
  // subroom, and current subroom partners (the admin-only /:personId route
  // below cannot be used by a MEMBER/TEAM_LEAD to see their own assignment).
  fastify.get(
    '/assignment/me',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const assignment = await RoomService.getPersonAssignment(request.user.id, request.user.organizationId);
        return reply.send(assignment);
      } catch (err: unknown) {
        return sendAssignmentError(reply, err, 'Failed to fetch your assignment');
      }
    }
  );

  // GET /api/v1/rooms/assignment/:personId
  fastify.get(
    '/assignment/:personId',
    { preHandler: [requireRole([UserRole.SUPER_ADMIN, UserRole.ADMIN])] },
    async (request, reply) => {
      const { personId } = request.params as { personId: string };
      try {
        const assignment = await RoomService.getPersonAssignment(personId, request.user.organizationId);
        return reply.send(assignment);
      } catch (err: unknown) {
        return sendAssignmentError(reply, err, 'Failed to fetch assignment');
      }
    }
  );

  // PATCH /api/v1/rooms/assignment/:personId — assign or reassign
  fastify.patch(
    '/assignment/:personId',
    { preHandler: [requireRole([UserRole.SUPER_ADMIN, UserRole.ADMIN])] },
    async (request, reply) => {
      const { personId } = request.params as { personId: string };
      const parseResult = assignRoomSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Validation failed',
          details: parseResult.error.format(),
        });
      }

      try {
        const result = await RoomService.setPersonAssignment(
          personId,
          { sectionLetter: parseResult.data.sectionLetter, subroomCode: parseResult.data.subroomCode },
          request.user
        );
        return reply.send(result);
      } catch (err: unknown) {
        return sendAssignmentError(reply, err, 'Failed to assign room');
      }
    }
  );

  // DELETE /api/v1/rooms/assignment/:personId — clear assignment
  fastify.delete(
    '/assignment/:personId',
    { preHandler: [requireRole([UserRole.SUPER_ADMIN, UserRole.ADMIN])] },
    async (request, reply) => {
      const { personId } = request.params as { personId: string };
      try {
        const result = await RoomService.setPersonAssignment(personId, { sectionLetter: null }, request.user);
        return reply.send(result);
      } catch (err: unknown) {
        return sendAssignmentError(reply, err, 'Failed to clear assignment');
      }
    }
  );
};
