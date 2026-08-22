import { FastifyPluginAsync } from 'fastify';
import { UserService } from '../../services/user.service.js';
import { paginationQuerySchema } from '../../schemas/pagination.schema.js';
import { UserRole, UserStatus } from '@prisma/client';

export const userRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/v1/users
  // Always scoped to the authenticated caller's own organization — never
  // trust a client-supplied organizationId (none is even accepted here).
  fastify.get('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const query = request.query as {
      role?: string;
      status?: string;
      roomId?: string;
      subroomId?: string;
      search?: string;
    };

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
      const result = await UserService.getUsers(
        {
          organizationId: request.user.organizationId,
          role: query.role ? (query.role.toUpperCase() as UserRole) : undefined,
          status: query.status ? (query.status.toUpperCase() as UserStatus) : undefined,
          roomId: query.roomId,
          subroomId: query.subroomId,
          search: query.search,
        },
        paginationResult.data
      );

      return reply.send(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to query users';
      return reply.status(500).send({
        statusCode: 500,
        error: 'Internal Server Error',
        message,
      });
    }
  });

  // GET /api/v1/users/:id
  fastify.get('/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const user = await UserService.getUserById(id, request.user.organizationId);
      return reply.send(user);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'User not found';
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message,
      });
    }
  });
};
