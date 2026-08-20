import { FastifyPluginAsync } from 'fastify';
import { loginSchema } from '../../schemas/auth.schema.js';
import { AuthService } from '../../services/auth.service.js';

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /api/v1/auth/login
  fastify.post('/login', async (request, reply) => {
    const parseResult = loginSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Validation failed',
        details: parseResult.error.format(),
      });
    }

    try {
      const payload = await AuthService.validateCredentials(parseResult.data);
      const token = fastify.jwt.sign(payload);

      return reply.send({
        token,
        user: payload,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Invalid credentials';
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message,
      });
    }
  });

  // GET /api/v1/auth/me
  fastify.get('/me', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    try {
      const profile = await AuthService.getUserProfile(request.user.id);
      return reply.send(profile);
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
