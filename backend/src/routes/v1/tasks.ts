import { FastifyPluginAsync, FastifyReply } from 'fastify';
import { TaskService } from '../../services/task.service.js';
import {
  createTaskSchema,
  updateTaskStatusSchema,
  updateTaskProgressSchema,
  reassignTaskSchema,
  splitTeamTaskSchema,
  addTaskCommentSchema,
} from '../../schemas/task.schema.js';
import { requireRole } from '../../plugins/auth.js';
import { paginationQuerySchema } from '../../schemas/pagination.schema.js';
import { withIdempotency } from '../../utils/idempotency-helper.js';
import { TaskPriority, TaskStatus, UserRole } from '@prisma/client';

function sendError(reply: FastifyReply, err: unknown, fallbackMessage: string) {
  const statusCode = (err as { statusCode?: number })?.statusCode || 400;
  const message = err instanceof Error ? err.message : fallbackMessage;
  const error =
    statusCode === 404 ? 'Not Found' : statusCode === 403 ? 'Forbidden' : statusCode === 409 ? 'Conflict' : 'Bad Request';
  return reply.status(statusCode).send({ statusCode, error, message });
}

// Roles authorized to interact with the task domain at all. HR is
// deliberately excluded — HR remains a people-management role and must not
// gain operational task visibility through this route.
const TASK_DOMAIN_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.TEAM_LEAD,
  UserRole.SERVER,
  UserRole.MEMBER,
];

export const taskRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/v1/tasks — role-scoped: MEMBER sees only their own, TEAM_LEAD/
  // SERVER see only their room, ADMIN/SUPER_ADMIN see the whole organization.
  fastify.get(
    '/',
    { preHandler: [requireRole(TASK_DOMAIN_ROLES)] },
    async (request, reply) => {
      const query = request.query as {
        status?: string;
        priority?: string;
        assigneeId?: string;
        roomLetter?: string;
        campaignId?: string;
        search?: string;
      };

      const statusValue = query.status?.toUpperCase();
      const priorityValue = query.priority?.toUpperCase();

      const paginationResult = paginationQuerySchema.safeParse(request.query);
      if (!paginationResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid pagination parameters',
          details: paginationResult.error.format(),
        });
      }

      try {
        const result = await TaskService.getTasks(
          {
            status: statusValue && statusValue in TaskStatus ? (statusValue as TaskStatus) : undefined,
            priority: priorityValue && priorityValue in TaskPriority ? (priorityValue as TaskPriority) : undefined,
            assigneeId: query.assigneeId || undefined,
            roomLetter: query.roomLetter || undefined,
            campaignId: query.campaignId || undefined,
            search: query.search || undefined,
          },
          request.user,
          paginationResult.data
        );
        return reply.send(result);
      } catch (err: unknown) {
        return sendError(reply, err, 'Failed to query tasks');
      }
    }
  );

  // GET /api/v1/tasks/analytics — backend-derived KPIs; registered before
  // '/:id' so it is never swallowed by the param route.
  fastify.get(
    '/analytics',
    { preHandler: [requireRole([UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TEAM_LEAD])] },
    async (request, reply) => {
      try {
        const analytics = await TaskService.getTaskAnalytics(request.user);
        return reply.send(analytics);
      } catch (err: unknown) {
        return sendError(reply, err, 'Failed to compute task analytics');
      }
    }
  );

  // GET /api/v1/tasks/:id
  fastify.get(
    '/:id',
    { preHandler: [requireRole(TASK_DOMAIN_ROLES)] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const task = await TaskService.getTaskById(id, request.user);
        return reply.send(task);
      } catch (err: unknown) {
        return sendError(reply, err, 'Task not found');
      }
    }
  );

  // GET /api/v1/tasks/:id/history — combined assignment + status audit trail
  fastify.get(
    '/:id/history',
    { preHandler: [requireRole(TASK_DOMAIN_ROLES)] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const history = await TaskService.getTaskHistory(id, request.user);
        return reply.send(history);
      } catch (err: unknown) {
        return sendError(reply, err, 'Failed to fetch task history');
      }
    }
  );

  // POST /api/v1/tasks
  // Protected: SUPER_ADMIN, ADMIN, TEAM_LEAD can create/assign tasks. SERVER
  // does not get general task-creation capability — a SERVER may still
  // receive tasks assigned by others, just never create/assign them.
  fastify.post(
    '/',
    { preHandler: [requireRole([UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TEAM_LEAD])] },
    async (request, reply) => {
      const parseResult = createTaskSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Validation failed',
          details: parseResult.error.format(),
        });
      }

      try {
        await withIdempotency(request, reply, 'task.create', async () => {
          const task = await TaskService.createTask(parseResult.data, request.user);
          return { statusCode: 201, body: task };
        });
      } catch (err: unknown) {
        return sendError(reply, err, 'Failed to create task');
      }
    }
  );

  // PATCH /api/v1/tasks/:id/status
  fastify.patch(
    '/:id/status',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parseResult = updateTaskStatusSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Validation failed',
          details: parseResult.error.format(),
        });
      }

      try {
        const task = await TaskService.updateTaskStatus(id, parseResult.data, request.user);
        return reply.send(task);
      } catch (err: unknown) {
        return sendError(reply, err, 'Failed to update task status');
      }
    }
  );

  // PATCH /api/v1/tasks/:id/progress
  fastify.patch(
    '/:id/progress',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parseResult = updateTaskProgressSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Validation failed',
          details: parseResult.error.format(),
        });
      }

      try {
        const task = await TaskService.updateTaskProgress(id, parseResult.data, request.user);
        return reply.send(task);
      } catch (err: unknown) {
        return sendError(reply, err, 'Failed to update task progress');
      }
    }
  );

  // PATCH /api/v1/tasks/:id/assignment — reassign to a different person
  fastify.patch(
    '/:id/assignment',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parseResult = reassignTaskSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Validation failed',
          details: parseResult.error.format(),
        });
      }

      try {
        const task = await TaskService.reassignTask(id, parseResult.data, request.user);
        return reply.send(task);
      } catch (err: unknown) {
        return sendError(reply, err, 'Failed to reassign task');
      }
    }
  );

  // POST /api/v1/tasks/:id/split — divide an unassigned team task among
  // several members, creating a new individual task per member
  fastify.post(
    '/:id/split',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parseResult = splitTeamTaskSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Validation failed',
          details: parseResult.error.format(),
        });
      }

      try {
        const result = await TaskService.splitTeamTask(id, parseResult.data, request.user);
        return reply.status(201).send(result);
      } catch (err: unknown) {
        return sendError(reply, err, 'Failed to split team task');
      }
    }
  );

  // POST /api/v1/tasks/:id/complete — convenience for the common case
  fastify.post(
    '/:id/complete',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const task = await TaskService.completeTask(id, request.user);
        return reply.send(task);
      } catch (err: unknown) {
        return sendError(reply, err, 'Failed to complete task');
      }
    }
  );

  // POST /api/v1/tasks/:id/cancel
  fastify.post(
    '/:id/cancel',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = (request.body || {}) as { reason?: string };
      try {
        const task = await TaskService.cancelTask(id, body.reason, request.user);
        return reply.send(task);
      } catch (err: unknown) {
        return sendError(reply, err, 'Failed to cancel task');
      }
    }
  );

  // POST /api/v1/tasks/:id/comments
  fastify.post(
    '/:id/comments',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parseResult = addTaskCommentSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Validation failed',
          details: parseResult.error.format(),
        });
      }

      try {
        const comment = await TaskService.addTaskComment(id, parseResult.data, request.user);
        return reply.status(201).send(comment);
      } catch (err: unknown) {
        return sendError(reply, err, 'Failed to add comment');
      }
    }
  );
};
