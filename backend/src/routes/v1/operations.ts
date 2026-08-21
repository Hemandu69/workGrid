import { FastifyPluginAsync } from 'fastify';
import { OperationsService } from '../../services/operations.service.js';
import { SimulationService } from '../../services/simulation.service.js';
import { AvailabilityService } from '../../services/availability.service.js';
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

  // POST /api/v1/operations/simulation/toggle
  // Toggles or sets state for a simulated test person without database writes
  // Requires authentication so the real organizationId is available for Socket.IO routing
  fastify.post(
    '/simulation/toggle',
    {
      preHandler: [requireRole([UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.SERVER])],
    },
    async (request, reply) => {
      const { id, presenceState } = request.body as { id: string; presenceState?: 'IN' | 'OUT' };

      if (!id) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Simulation person id is required.',
        });
      }

      try {
        const currentPerson = SimulationService.getSimulatedPerson(id);
        if (!currentPerson) {
          return reply.status(404).send({
            statusCode: 404,
            error: 'Not Found',
            message: `Simulated person ${id} not found.`,
          });
        }

        const targetState = presenceState || (currentPerson.presenceState === 'IN' ? 'OUT' : 'IN');
        const updated = SimulationService.updateSimulatedPersonState(id, targetState);

        // Use the authenticated user's real organizationId so events route to the
        // correct Socket.IO room (organization:<orgId>) where all clients are subscribed.
        const organizationId = request.user.organizationId;

        // Common payload identifying this as a simulated person (no real userId)
        const simulationPayload = {
          userId: null,
          simulatedPersonId: updated.id,
          personId: updated.id,
          name: updated.name,
          role: updated.role,
          section: updated.sectionLetter,
          sectionLetter: updated.sectionLetter,
          subroomCode: updated.subroomCode,
          presenceState: updated.presenceState,
          attendanceState: updated.attendanceState,
          availabilityState: updated.availabilityState,
          location: updated.presenceState === 'IN' ? updated.subroomCode : 'Outside',
          isSimulated: true,
          timestamp: new Date().toISOString(),
        };

        // Emit the same full event set as real authenticated check-in/check-out,
        // using the real org ID so they arrive in the clients' Socket.IO room.
        publishDomainEvent({
          type: 'PRESENCE_CHANGED',
          organizationId,
          entityId: updated.id,
          payload: simulationPayload,
        });

        publishDomainEvent({
          type: 'ATTENDANCE_UPDATED',
          organizationId,
          entityId: updated.id,
          payload: simulationPayload,
        });

        publishDomainEvent({
          type: 'LOCATION_CHANGED',
          organizationId,
          entityId: updated.id,
          payload: simulationPayload,
        });

        publishDomainEvent({
          type: 'ROOM_STATUS_CHANGED',
          organizationId,
          entityId: updated.sectionLetter,
          payload: {
            ...simulationPayload,
            roomLetter: updated.sectionLetter,
          },
        });

        publishDomainEvent({
          type: 'AVAILABILITY_CHANGED',
          organizationId,
          entityId: updated.id,
          payload: simulationPayload,
        });

        return reply.send({
          success: true,
          person: updated,
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to toggle simulation state';
        return reply.status(500).send({
          statusCode: 500,
          error: 'Internal Server Error',
          message,
        });
      }
    }
  );

  // POST /api/v1/operations/simulation/reset
  // Restores initial test fixtures for simulated personnel
  // Requires authentication so the real organizationId is available for Socket.IO routing
  fastify.post(
    '/simulation/reset',
    {
      preHandler: [requireRole([UserRole.SUPER_ADMIN, UserRole.ADMIN])],
    },
    async (request, reply) => {
      try {
        const resetPersonnel = SimulationService.resetSimulation();

        const organizationId = request.user.organizationId;

        // Broadcast a grid-wide reset event to all connected clients using real org ID
        publishDomainEvent({
          type: 'GRID_UPDATED',
          organizationId,
          entityId: 'simulation-reset',
          payload: {
            resetSimulation: true,
            isSimulated: true,
            timestamp: new Date().toISOString(),
          },
        });

        // Also emit ROOM_STATUS_CHANGED so any section-scoped listeners react
        publishDomainEvent({
          type: 'ROOM_STATUS_CHANGED',
          organizationId,
          entityId: 'ALL',
          payload: {
            resetSimulation: true,
            isSimulated: true,
          },
        });

        return reply.send({
          success: true,
          message: 'Simulation reset to default fixture state.',
          personnel: resetPersonnel,
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to reset simulation';
        return reply.status(500).send({
          statusCode: 500,
          error: 'Internal Server Error',
          message,
        });
      }
    }
  );

  // GET /api/v1/operations/person/:id
  // Retrieves details for either real database user or simulated personnel
  fastify.get(
    '/person/:id',
    async (request, reply) => {
      const { id } = request.params as { id: string };

      try {
        const personDetail = await OperationsService.getPersonDetail(id);
        if (personDetail) {
          return reply.send(personDetail);
        }

        // If not simulated, delegate to AvailabilityService for database user
        const dbUserAvailability = await AvailabilityService.getUserAvailability(id);
        return reply.send(dbUserAvailability);
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
