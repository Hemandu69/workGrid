import { FastifyPluginAsync } from 'fastify';
import { UserService } from '../../services/user.service.js';
import { UserRole, UserStatus } from '@prisma/client';

export const userRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/v1/users
  fastify.get('/', async (request, reply) => {
    const query = request.query as {
      role?: string;
      status?: string;
      roomId?: string;
      subroomId?: string;
      search?: string;
    };

    try {
      const users = await UserService.getUsers({
        role: query.role ? (query.role.toUpperCase() as UserRole) : undefined,
        status: query.status ? (query.status.toUpperCase() as UserStatus) : undefined,
        roomId: query.roomId,
        subroomId: query.subroomId,
        search: query.search,
      });

      return reply.send(users);
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
  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const user = await UserService.getUserById(id);
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
