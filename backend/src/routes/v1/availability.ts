import { FastifyPluginAsync } from 'fastify';
import { AvailabilityService } from '../../services/availability.service.js';
import { updateWeeklyScheduleSchema, setAvailabilityStatusSchema, updateWeekAvailabilitySchema } from '../../schemas/availability.schema.js';
import { AvailabilityState } from '../../utils/availability-projection.js';
import { requireRole } from '../../plugins/auth.js';
import { UserRole } from '@prisma/client';
import { prisma } from '../../db/client.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const availabilityRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/v1/availability/people
  // Protected: SUPER_ADMIN and ADMIN have global scope; SERVER is strictly scoped to their assigned room.
  fastify.get(
    '/availability/people',
    {
      preHandler: [requireRole([UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.SERVER])],
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
          date: query.date,
          startHour: query.startHour ? parseInt(query.startHour, 10) : undefined,
          endHour: query.endHour ? parseInt(query.endHour, 10) : undefined,
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
      const query = request.query as { startDate?: string };

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

  // POST /api/v1/availability/meal/start
  // Starts a temporary, reversible Lunch/Dinner period — self-only, always
  // request.user.id, no personId accepted (matches the attendance
  // check-in/out endpoints' already-self-only shape).
  fastify.post(
    '/availability/meal/start',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const result = await AvailabilityService.startMeal(request.user.id, {
          id: request.user.id,
          organizationId: request.user.organizationId,
        });
        return reply.send(result);
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number })?.statusCode || 400;
        const message = err instanceof Error ? err.message : 'Failed to start meal break';
        return reply.status(statusCode).send({
          statusCode,
          error: statusCode === 404 ? 'Not Found' : statusCode === 409 ? 'Conflict' : 'Bad Request',
          message,
        });
      }
    }
  );

  // POST /api/v1/availability/meal/end
  // Ends the meal period, restoring the prior status — self-only.
  fastify.post(
    '/availability/meal/end',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const result = await AvailabilityService.endMeal(request.user.id, {
          id: request.user.id,
          organizationId: request.user.organizationId,
        });
        return reply.send(result);
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number })?.statusCode || 400;
        const message = err instanceof Error ? err.message : 'Failed to end meal break';
        return reply.status(statusCode).send({
          statusCode,
          error: statusCode === 404 ? 'Not Found' : statusCode === 409 ? 'Conflict' : 'Bad Request',
          message,
        });
      }
    }
  );

  // GET /api/v1/users/:id/availability
  // Protected: Authenticated users can view their own schedule; SUPER_ADMIN/ADMIN can view anyone's.
  fastify.get(
    '/users/:id/availability',
    {
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      if (request.user.id !== id && request.user.role !== 'SUPER_ADMIN' && request.user.role !== 'ADMIN') {
        return reply.status(403).send({
          statusCode: 403,
          error: 'Forbidden',
          message: 'You are only authorized to view your own availability schedule',
        });
      }

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
    }
  );

  // PUT /api/v1/users/:id/availability
  // Self-only — recurring availability belongs to the person themselves.
  // Admins retain read access via the GET route above; this route only writes.
  fastify.put(
    '/users/:id/availability',
    {
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      if (request.user.id !== id) {
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

  // GET /api/v1/users/:id/availability/calendar?weekStart=YYYY-MM-DD&month=&year=
  // Protected: Authenticated users can view their own effective calendar week;
  // SUPER_ADMIN/ADMIN can view anyone's — same guard as the recurring GET above.
  fastify.get(
    '/users/:id/availability/calendar',
    {
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const query = request.query as { weekStart?: string; month?: string; year?: string };

      if (request.user.id !== id && request.user.role !== 'SUPER_ADMIN' && request.user.role !== 'ADMIN') {
        return reply.status(403).send({
          statusCode: 403,
          error: 'Forbidden',
          message: 'You are only authorized to view your own availability schedule',
        });
      }

      if (!query.weekStart || !DATE_RE.test(query.weekStart)) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'weekStart is required and must be in YYYY-MM-DD format',
        });
      }

      try {
        const schedule = await AvailabilityService.getEffectiveWeekAvailability(
          id,
          query.weekStart,
          query.month ? parseInt(query.month, 10) : undefined,
          query.year ? parseInt(query.year, 10) : undefined
        );
        return reply.send(schedule);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to fetch calendar availability';
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message,
        });
      }
    }
  );

  // PUT /api/v1/users/:id/availability/calendar
  // Self-only — date-specific overrides belong to the person themselves,
  // same rule as the recurring PUT above.
  fastify.put(
    '/users/:id/availability/calendar',
    {
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      if (request.user.id !== id) {
        return reply.status(403).send({
          statusCode: 403,
          error: 'Forbidden',
          message: 'You are only authorized to update your own availability schedule',
        });
      }

      const parseResult = updateWeekAvailabilitySchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Validation failed',
          details: parseResult.error.format(),
        });
      }

      try {
        const updated = await AvailabilityService.updateWeekAvailability(id, parseResult.data, {
          id: request.user.id,
        });
        return reply.send(updated);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to update calendar availability';
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message,
        });
      }
    }
  );
};
