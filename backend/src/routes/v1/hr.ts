import { FastifyPluginAsync } from 'fastify';
import { HRService } from '../../services/hr.service.js';
import { requireRole } from '../../plugins/auth.js';
import { AccountStatus, UserRole } from '@prisma/client';
import {
  provisionUserSchema,
  updateRoleSchema,
  updateStatusSchema,
} from '../../schemas/hr.schema.js';
import { hrEventBus } from '../../events/hr-events.js';

export const hrRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/v1/hr/dashboard
  // Protected: SUPER_ADMIN and HR only
  fastify.get(
    '/dashboard',
    {
      preHandler: [requireRole([UserRole.SUPER_ADMIN, UserRole.HR])],
    },
    async (request, reply) => {
      try {
        const stats = await HRService.getHRDashboardStats(request.user.organizationId);
        return reply.send(stats);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to fetch HR dashboard stats';
        const statusCode = (err as any)?.statusCode || 500;
        return reply.status(statusCode).send({
          statusCode,
          error: statusCode === 403 ? 'Forbidden' : 'Internal Server Error',
          message,
        });
      }
    }
  );

  // GET /api/v1/hr/people
  // Protected: SUPER_ADMIN and HR only
  fastify.get(
    '/people',
    {
      preHandler: [requireRole([UserRole.SUPER_ADMIN, UserRole.HR])],
    },
    async (request, reply) => {
      const query = request.query as {
        role?: string;
        accountStatus?: string;
        search?: string;
      };

      try {
        const roleUpper = query.role ? query.role.toUpperCase() : undefined;
        const statusUpper = query.accountStatus ? query.accountStatus.toUpperCase() : undefined;

        const roleFilter =
          roleUpper && roleUpper !== 'ALL'
            ? roleUpper === 'UNASSIGNED'
              ? 'UNASSIGNED'
              : (roleUpper as UserRole)
            : undefined;

        const statusFilter =
          statusUpper && statusUpper !== 'ALL'
            ? (statusUpper as AccountStatus)
            : undefined;

        const users = await HRService.getPeopleDirectory(request.user.organizationId, {
          role: roleFilter,
          accountStatus: statusFilter,
          search: query.search?.trim() || undefined,
        });
        return reply.send(users);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to query people directory';
        const statusCode = (err as any)?.statusCode || 500;
        return reply.status(statusCode).send({
          statusCode,
          error: statusCode === 403 ? 'Forbidden' : 'Internal Server Error',
          message,
        });
      }
    }
  );

  // POST /api/v1/hr/users
  // Provision employee account
  fastify.post(
    '/users',
    {
      preHandler: [requireRole([UserRole.SUPER_ADMIN, UserRole.HR])],
    },
    async (request, reply) => {
      const parseResult = provisionUserSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Validation failed',
          details: parseResult.error.format(),
        });
      }

      try {
        const newUser = await HRService.provisionUser(
          request.user.organizationId,
          request.user,
          parseResult.data
        );
        return reply.status(201).send(newUser);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to provision user';
        const statusCode = (err as any)?.statusCode || 500;
        return reply.status(statusCode).send({
          statusCode,
          error: statusCode === 403 ? 'Forbidden' : statusCode === 409 ? 'Conflict' : 'Internal Server Error',
          message,
        });
      }
    }
  );

  // PATCH /api/v1/hr/users/:id/role
  // Assign or alter employee role (with transactional audit log)
  fastify.patch(
    '/users/:id/role',
    {
      preHandler: [requireRole([UserRole.SUPER_ADMIN, UserRole.HR])],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parseResult = updateRoleSchema.safeParse(request.body);

      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Validation failed',
          details: parseResult.error.format(),
        });
      }

      try {
        const result = await HRService.updateUserRole(
          request.user.organizationId,
          request.user,
          id,
          parseResult.data.role,
          parseResult.data.reason
        );
        return reply.send(result);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to update user role';
        const statusCode = (err as any)?.statusCode || 400;
        return reply.status(statusCode).send({
          statusCode,
          error: statusCode === 403 ? 'Forbidden' : statusCode === 404 ? 'Not Found' : 'Bad Request',
          message,
        });
      }
    }
  );

  // PATCH /api/v1/hr/users/:id/status
  // Activate, suspend, or deactivate user account
  fastify.patch(
    '/users/:id/status',
    {
      preHandler: [requireRole([UserRole.SUPER_ADMIN, UserRole.HR])],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parseResult = updateStatusSchema.safeParse(request.body);

      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Validation failed',
          details: parseResult.error.format(),
        });
      }

      try {
        const updated = await HRService.updateAccountStatus(
          request.user.organizationId,
          request.user,
          id,
          parseResult.data.accountStatus,
          parseResult.data.reason
        );
        return reply.send(updated);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to update account status';
        const statusCode = (err as any)?.statusCode || 400;
        return reply.status(statusCode).send({
          statusCode,
          error: statusCode === 403 ? 'Forbidden' : statusCode === 404 ? 'Not Found' : 'Bad Request',
          message,
        });
      }
    }
  );

  // GET /api/v1/hr/audit-logs
  // View Role Audit History
  fastify.get(
    '/audit-logs',
    {
      preHandler: [requireRole([UserRole.SUPER_ADMIN, UserRole.HR])],
    },
    async (request, reply) => {
      const query = request.query as { targetUserId?: string };

      try {
        const logs = await HRService.getRoleAuditLogs(
          request.user.organizationId,
          query.targetUserId
        );
        return reply.send(logs);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to fetch audit logs';
        const statusCode = (err as any)?.statusCode || 500;
        return reply.status(statusCode).send({
          statusCode,
          error: statusCode === 403 ? 'Forbidden' : 'Internal Server Error',
          message,
        });
      }
    }
  );

  // GET /api/v1/hr/events
  // Authenticated Real-Time HR Stream (SSE)
  // Protected: SUPER_ADMIN and HR only
  fastify.get(
    '/events',
    {
      preHandler: [requireRole([UserRole.SUPER_ADMIN, UserRole.HR])],
    },
    async (request, reply) => {
      const organizationId = request.user.organizationId;

      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });

      // Send initial connection event
      reply.raw.write(
        `data: ${JSON.stringify({
          type: 'CONNECTED',
          organizationId,
          timestamp: new Date().toISOString(),
        })}\n\n`
      );

      // Keepalive heartbeat timer
      const heartbeatInterval = setInterval(() => {
        if (!reply.raw.destroyed && !reply.raw.writableEnded) {
          reply.raw.write(': keepalive\n\n');
        }
      }, 25000);

      // Subscribe to organization-scoped HR events
      const unsubscribe = hrEventBus.subscribeHREvents(organizationId, (event) => {
        if (!reply.raw.destroyed && !reply.raw.writableEnded) {
          reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
        }
      });

      // Clean up when client disconnects
      request.raw.on('close', () => {
        clearInterval(heartbeatInterval);
        unsubscribe();
      });
    }
  );
};
