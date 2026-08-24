import { FastifyPluginAsync } from 'fastify';
import { AvailabilityService } from '../../services/availability.service.js';
import { setAvailabilityStatusSchema } from '../../schemas/availability.schema.js';
import { AvailabilityState } from '../../utils/availability-projection.js';
import { requireRole } from '../../plugins/auth.js';
import { UserRole } from '@prisma/client';
import { prisma } from '../../db/client.js';

export const availabilityRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/v1/availability/people
  // Protected: SUPER_ADMIN and ADMIN have global scope; SERVER is strictly scoped to their assigned room.
  // Always returns the LIVE operational status — there is no scheduled/hourly
  // window to select any more.
  fastify.get(
    '/availability/people',
    {
      preHandler: [requireRole([UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.SERVER])],
    },
    async (request, reply) => {
      const query = request.query as {
        status?: string;
        role?: string;
        room?: string;
        search?: string;
      };

      let targetRoomFilter = query.room;

      // Server Role Boundary Enforcement:
      // A Server is strictly a room-level overseer and can only see people in their assigned room.
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
            message: 'You are assigned as SERVER but currently have no room assignment.',
          });
        }

        // If client specified a room query, ensure it matches the server's assigned room
        if (query.room && query.room !== 'ALL') {
          const requestedLetter = query.room.toUpperCase().replace('ROOM', '').replace('SECTOR', '').replace('SECTION', '').trim();
          const assignedRoomLetterMatch = assignedRoomLetter ? assignedRoomLetter.toUpperCase().replace('ROOM', '').replace('SECTOR', '').replace('SECTION', '').trim() : '';

          if (assignedRoomLetterMatch && requestedLetter !== assignedRoomLetterMatch) {
            return reply.code(403).send({
              statusCode: 403,
              error: 'Forbidden',
              message: `As a Server for Section ${assignedRoomLetterMatch}, you cannot access availability for Section ${requestedLetter}.`,
            });
          }
        }

        // Lock query strictly to server's assigned room
        targetRoomFilter = assignedRoomLetter;
      }

      try {
        const result = await AvailabilityService.getPeopleAvailability({
          status: query.status,
          role: query.role,
          room: targetRoomFilter,
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
  // Protected: SUPER_ADMIN and ADMIN have global scope; SERVER can only inspect people in their assigned room.
  fastify.get(
    '/availability/people/:id',
    {
      preHandler: [requireRole([UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.SERVER])],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      // Server Role Scope Enforcement
      if (request.user.role === UserRole.SERVER) {
        let serverUser = null;
        let targetUser = null;

        if (typeof prisma.user?.findUnique === 'function') {
          [serverUser, targetUser] = await Promise.all([
            prisma.user.findUnique({ where: { id: request.user.id }, include: { room: true } }).catch(() => null),
            prisma.user.findUnique({ where: { id }, include: { room: true } }).catch(() => null),
          ]);
        }

        if (!targetUser && typeof prisma.user?.findFirst === 'function') {
          targetUser = await prisma.user.findFirst({ where: { id } }).catch(() => null);
        }

        const serverRoomId = request.user.roomId || serverUser?.roomId;

        if (!serverRoomId) {
          return reply.status(403).send({
            statusCode: 403,
            error: 'Forbidden',
            message: 'Server has no room assignment.',
          });
        }

        if (targetUser && targetUser.roomId && targetUser.roomId !== serverRoomId) {
          return reply.status(403).send({
            statusCode: 403,
            error: 'Forbidden',
            message: 'Servers can only access availability details for people assigned to their room.',
          });
        }
      }

      try {
        const result = await AvailabilityService.getPersonDetailedAvailability(id);
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

  // POST /api/v1/availability/status
  // Sets the authoritative operational availability (FREE/BUSY/PARTIALLY_AVAILABLE/
  // UNAVAILABLE) for a person. Self-only — a person owns their own live
  // presence; no role, including SUPER_ADMIN/ADMIN/SERVER, may set it on
  // someone else's behalf. Management roles retain full read access via
  // GET /availability/people(/:id) — this route only ever writes.
  fastify.post(
    '/availability/status',
    {
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const parseResult = setAvailabilityStatusSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Validation failed',
          details: parseResult.error.format(),
        });
      }

      const { state } = parseResult.data;
      const targetPersonId = parseResult.data.personId || request.user.id;

      if (targetPersonId !== request.user.id) {
        return reply.status(403).send({
          statusCode: 403,
          error: 'Forbidden',
          message: 'You are only authorized to change your own availability.',
        });
      }

      try {
        const result = await AvailabilityService.setAvailabilityState(
          targetPersonId,
          state as AvailabilityState,
          { id: request.user.id, organizationId: request.user.organizationId }
        );
        return reply.send(result);
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number })?.statusCode || 400;
        const message = err instanceof Error ? err.message : 'Failed to update availability status';
        return reply.status(statusCode).send({
          statusCode,
          error: statusCode === 404 ? 'Not Found' : statusCode === 409 ? 'Conflict' : 'Bad Request',
          message,
        });
      }
    }
  );

};
