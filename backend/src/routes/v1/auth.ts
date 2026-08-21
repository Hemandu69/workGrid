import { FastifyPluginAsync } from 'fastify';
import {
  loginSchema,
  registerSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '../../schemas/auth.schema.js';
import { AuthService } from '../../services/auth.service.js';
import { AUTH_COOKIE_NAME } from '../../plugins/auth.js';
import { config } from '../../config/index.js';

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
      const payload = await AuthService.validateCredentials(parseResult.data, request.ip);
      const token = fastify.jwt.sign(payload);
      const isProduction = config.NODE_ENV === 'production';

      // Set secure HttpOnly cookie for browser sessions (SameSite=None in production for cross-site Vercel <-> Render)
      reply.setCookie(AUTH_COOKIE_NAME, token, {
        path: '/',
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? 'none' : 'lax',
        maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
      });

      return reply.send({
        message: 'Authenticated successfully',
        token,
        user: payload,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Invalid credentials';
      const statusCode = (err as any)?.statusCode || 401;
      return reply.status(statusCode).send({
        statusCode,
        error: statusCode === 403 ? 'Forbidden' : 'Unauthorized',
        message,
      });
    }
  });

  // POST /api/v1/auth/register (Optional public onboarding; defaults to MEMBER and PENDING)
  fastify.post('/register', async (request, reply) => {
    const parseResult = registerSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Validation failed',
        details: parseResult.error.format(),
      });
    }

    try {
      const newUser = await AuthService.register(parseResult.data, request.ip);
      return reply.status(201).send({
        message: 'Registration successful. Account is pending administrator review.',
        user: newUser,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Registration failed';
      const statusCode = (err as any)?.statusCode || 500;
      return reply.status(statusCode).send({
        statusCode,
        error: statusCode === 409 ? 'Conflict' : 'Internal Server Error',
        message,
      });
    }
  });

  // GET /api/v1/auth/me (Protected: Authoritative user identity source of truth)
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

  // POST /api/v1/auth/logout (Clears session cookie & logs audit event)
  fastify.post('/logout', async (request, reply) => {
    const isProduction = config.NODE_ENV === 'production';
    reply.clearCookie(AUTH_COOKIE_NAME, {
      path: '/',
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
    });

    if (request.cookies?.[AUTH_COOKIE_NAME] || request.headers.authorization) {
      try {
        await fastify.authenticate(request, reply);
        if (request.user) {
          await AuthService.logout(request.user.id, request.user.organizationId, request.ip);
        }
      } catch {
        // Continue logout cleanup
      }
    }

    return reply.send({
      message: 'Logged out successfully',
    });
  });

  // POST /api/v1/auth/forgot-password
  fastify.post('/forgot-password', async (request, reply) => {
    const parseResult = forgotPasswordSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Validation failed',
        details: parseResult.error.format(),
      });
    }

    try {
      const result = await AuthService.requestPasswordReset(parseResult.data.email, request.ip);
      return reply.send(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to process request';
      return reply.status(500).send({
        statusCode: 500,
        error: 'Internal Server Error',
        message,
      });
    }
  });

  // POST /api/v1/auth/reset-password
  fastify.post('/reset-password', async (request, reply) => {
    const parseResult = resetPasswordSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Validation failed',
        details: parseResult.error.format(),
      });
    }

    try {
      const result = await AuthService.resetPassword(parseResult.data, request.ip);
      return reply.send(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to reset password';
      const statusCode = (err as any)?.statusCode || 400;
      return reply.status(statusCode).send({
        statusCode,
        error: statusCode === 400 ? 'Bad Request' : 'Internal Server Error',
        message,
      });
    }
  });
};
