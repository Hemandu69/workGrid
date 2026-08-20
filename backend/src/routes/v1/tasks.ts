import { FastifyPluginAsync } from 'fastify';
import { TaskService } from '../../services/task.service.js';
import { createTaskSchema, updateTaskStatusSchema, addTaskCommentSchema } from '../../schemas/task.schema.js';
import { requireRole } from '../../plugins/auth.js';
import { TaskPriority, TaskStatus, UserRole } from '@prisma/client';

export const taskRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/v1/tasks
  fastify.get('/', async (request, reply) => {
    const query = request.query as {
      status?: string;
      priority?: string;
      assigneeId?: string;
      roomLetter?: string;
      campaignId?: string;
      search?: string;
    };

    try {
      const tasks = await TaskService.getTasks({
        status: query.status ? (query.status.toUpperCase() as TaskStatus) : undefined,
        priority: query.priority ? (query.priority.toUpperCase() as TaskPriority) : undefined,
        assigneeId: query.assigneeId,
        roomLetter: query.roomLetter,
        campaignId: query.campaignId,
        search: query.search,
      });

      return reply.send(tasks);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to query tasks';
      return reply.status(500).send({
        statusCode: 500,
        error: 'Internal Server Error',
        message,
      });
    }
  });

  // GET /api/v1/tasks/:id
  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const task = await TaskService.getTaskById(id);
      return reply.send(task);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Task not found';
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message,
      });
    }
  });

  // POST /api/v1/tasks
  // Protected: SUPER_ADMIN, ADMIN, SERVER can assign tasks
  fastify.post(
    '/',
    {
      preHandler: [requireRole([UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.SERVER])],
    },
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
        const task = await TaskService.createTask(parseResult.data, request.user);
        return reply.status(201).send(task);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to create task';
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message,
        });
      }
    }
  );

  // PATCH /api/v1/tasks/:id/status
  // Protected: Authenticated users can update task status
  fastify.patch(
    '/:id/status',
    {
      preHandler: [fastify.authenticate],
    },
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
        const task = await TaskService.updateTaskStatus(id, parseResult.data);
        return reply.send(task);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to update task status';
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message,
        });
      }
    }
  );

  // POST /api/v1/tasks/:id/comments
  // Protected: Authenticated users can comment on tasks
  fastify.post(
    '/:id/comments',
    {
      preHandler: [fastify.authenticate],
    },
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
        const message = err instanceof Error ? err.message : 'Failed to add comment';
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message,
        });
      }
    }
  );
};
