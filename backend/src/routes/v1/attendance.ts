import { FastifyPluginAsync } from 'fastify';
import { AttendanceService } from '../../services/attendance.service.js';
import { requireRole } from '../../plugins/auth.js';
import { PresenceState, UserRole } from '@prisma/client';

export const attendanceRoutes: FastifyPluginAsync = async (fastify) => {
  // ---------------------------------------------------------------------------
  // 1. POST /api/v1/attendance/in
  // Authenticated ACTIVE user only. Starts or retrieves active attendance session.
  // ---------------------------------------------------------------------------
  fastify.post(
    '/in',
    {
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      try {
        const result = await AttendanceService.checkIn(request.user.id, request.ip);
        return reply.status(200).send(result);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to record check-in';
        const statusCode = (err as any)?.statusCode || 500;
        return reply.status(statusCode).send({
          statusCode,
          error: statusCode === 403 ? 'Forbidden' : statusCode === 404 ? 'Not Found' : 'Internal Server Error',
          message,
        });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // 2. POST /api/v1/attendance/out
  // Authenticated ACTIVE user only. Ends active session and computes duration.
  // ---------------------------------------------------------------------------
  fastify.post(
    '/out',
    {
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      try {
        const result = await AttendanceService.checkOut(request.user.id, request.ip);
        return reply.status(200).send(result);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to record check-out';
        const statusCode = (err as any)?.statusCode || 500;
        return reply.status(statusCode).send({
          statusCode,
          error: statusCode === 403 ? 'Forbidden' : statusCode === 404 ? 'Not Found' : 'Internal Server Error',
          message,
        });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // 3. GET /api/v1/attendance/me
  // Authoritative live state, active session timer, and today's summary.
  // ---------------------------------------------------------------------------
  fastify.get(
    '/me',
    {
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      try {
        const result = await AttendanceService.getCurrentUserAttendance(request.user.id);
        return reply.send(result);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to fetch attendance status';
        const statusCode = (err as any)?.statusCode || 500;
        return reply.status(statusCode).send({
          statusCode,
          error: statusCode === 404 ? 'Not Found' : 'Internal Server Error',
          message,
        });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // 4. GET /api/v1/attendance/history
  // Attendance history grouped by IST calendar day for the authenticated user.
  // ---------------------------------------------------------------------------
  fastify.get(
    '/history',
    {
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      try {
        const query = request.query as { days?: string };
        const days = query.days ? parseInt(query.days, 10) : 30;
        const result = await AttendanceService.getAttendanceHistory(request.user.id, days);
        return reply.send(result);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to fetch attendance history';
        const statusCode = (err as any)?.statusCode || 500;
        return reply.status(statusCode).send({
          statusCode,
          error: statusCode === 404 ? 'Not Found' : 'Internal Server Error',
          message,
        });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // 5. GET /api/v1/attendance/overview
  // Organization-wide live attendance status (Super Admin, Admin).
  // ---------------------------------------------------------------------------
  fastify.get(
    '/overview',
    {
      preHandler: [requireRole([UserRole.SUPER_ADMIN, UserRole.ADMIN])],
    },
    async (request, reply) => {
      try {
        const query = request.query as {
          role?: UserRole;
          state?: PresenceState;
          search?: string;
        };

        const result = await AttendanceService.getAttendanceOverview(
          request.user.organizationId,
          {
            role: query.role,
            presenceState: query.state,
            search: query.search,
          }
        );
        return reply.send(result);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to fetch attendance overview';
        return reply.status(500).send({
          statusCode: 500,
          error: 'Internal Server Error',
          message,
        });
      }
    }
  );
};
