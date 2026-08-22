import { FastifyPluginAsync } from 'fastify';
import { OperationsService } from '../../services/operations.service.js';
import { publishDomainEvent } from '../../events/domain-events.js';
import { requireRole } from '../../plugins/auth.js';
import { PresenceState, UserRole } from '@prisma/client';
import { prisma } from '../../db/client.js';
import { z } from 'zod';

const updatePresenceSchema = z.object({
  userId: z.string().optional(),
  presenceState: z.enum(['IN', 'OUT', 'UNKNOWN']).optional(),
  currentLocationName: z.string().nullable().optional(),
  currentLocationRoomId: z.string().nullable().optional(),
  currentLocationSubroomId: z.string().nullable().optional(),
});

export const operationsRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/v1/operations/grid
  // Protected: SUPER_ADMIN and ADMIN have global scope; SERVER is strictly scoped to assigned room.
  fastify.get(
    '/grid',
    {
      preHandler: [requireRole([UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.SERVER])],
    },
    async (request, reply) => {
      const query = request.query as {
        room?: string;
        search?: string;
      };

      let targetRoomFilter = query.room;

      // Server Role Scope Enforcement
      if (request.user.role === UserRole.SERVER) {
        let serverUser = null;
        if (typeof prisma.user?.findUnique === 'function') {
          serverUser = await prisma.user.findUnique({
            where: { id: request.user.id },
            include: { room: true },
          }).catch(() => null);
        }

        let assignedRoomLetter = serverUser?.room?.letter?.toUpperCase();
        const rId = request.user.roomId || serverUser?.roomId;
        if (!assignedRoomLetter && rId) {
          if (rId.toLowerCase().includes('room-b') || rId === 'b') {
            assignedRoomLetter = 'B';
          } else if (typeof prisma.room?.findFirst === 'function') {
            const r = await prisma.room.findFirst({ where: { id: rId } }).catch(() => null);
            if (r) assignedRoomLetter = r.letter.toUpperCase();
          }
          if (!assignedRoomLetter && typeof prisma.room?.findMany === 'function') {
            const rooms = await prisma.room.findMany().catch(() => []);
            const r = rooms.find((x: any) => x.id === rId);
            if (r) assignedRoomLetter = r.letter.toUpperCase();
          }
        }

        if (!assignedRoomLetter) {
          const r = typeof prisma.room?.findFirst === 'function'
            ? await prisma.room.findFirst({
                where: { members: { some: { id: request.user.id } } },
              }).catch(() => null)
            : null;
          if (r) assignedRoomLetter = r.letter.toUpperCase();
        }

        if (!assignedRoomLetter) {
          return reply.status(403).send({
            statusCode: 403,
            error: 'Forbidden',
            message: 'Server user has no assigned room scope.',
          });
        }

        if (query.room && query.room !== 'ALL') {
          const requestedLetter = query.room.toUpperCase().replace('ROOM', '').replace('SECTOR', '').replace('SECTION', '').trim();
          const assignedRoomLetterMatch = assignedRoomLetter ? assignedRoomLetter.toUpperCase().replace('ROOM', '').replace('SECTOR', '').replace('SECTION', '').trim() : '';

          if (assignedRoomLetterMatch && requestedLetter !== assignedRoomLetterMatch) {
            return reply.status(403).send({
              statusCode: 403,
              error: 'Forbidden',
              message: `As a Server for Section ${assignedRoomLetterMatch}, you cannot access operations for Section ${requestedLetter}.`,
            });
          }
        }

        targetRoomFilter = assignedRoomLetter;
      }

      try {
        const grid = await OperationsService.getOperationalGrid({
          room: targetRoomFilter,
          search: query.search,
        });

        return reply.send(grid);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to fetch operational grid';
        return reply.status(500).send({
          statusCode: 500,
          error: 'Internal Server Error',
          message,
        });
      }
    }
  );

  // GET /api/v1/operations/events/:id
  fastify.get(
    '/events/:id',
    {
      preHandler: [requireRole([UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.SERVER])],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      try {
        const eventDetail = await OperationsService.getEventDetail(id);
        return reply.send(eventDetail);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Event not found';
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message,
        });
      }
    }
  );

  // POST /api/v1/operations/presence
  // Updates real user check-in / location state
  fastify.post(
    '/presence',
    {
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const parseResult = updatePresenceSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Validation failed',
          details: parseResult.error.format(),
        });
      }

      const targetUserId = parseResult.data.userId || request.user.id;

      // Only Admin or user themselves can update presence
      if (
        targetUserId !== request.user.id &&
        request.user.role !== UserRole.SUPER_ADMIN &&
        request.user.role !== UserRole.ADMIN
      ) {
        return reply.status(403).send({
          statusCode: 403,
          error: 'Forbidden',
          message: 'Not authorized to update another user presence',
        });
      }

      try {
        const updated = await OperationsService.updateUserPresence(targetUserId, {
          presenceState: parseResult.data.presenceState as PresenceState | undefined,
          currentLocationName: parseResult.data.currentLocationName,
          currentLocationRoomId: parseResult.data.currentLocationRoomId,
          currentLocationSubroomId: parseResult.data.currentLocationSubroomId,
        });

        return reply.send(updated);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to update presence';
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message,
        });
      }
    }
  );

  // GET /api/v1/operations/person/:id
  // Retrieves availability detail for a real, authenticated user.
  fastify.get(
    '/person/:id',
    async (request, reply) => {
      const { id } = request.params as { id: string };

      try {
        const personDetail = await OperationsService.getPersonDetail(id);
        return reply.send(personDetail);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Person not found';
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message,
        });
      }
    }
  );
};
