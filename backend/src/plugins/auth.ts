import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import { config } from '../config/index.js';
import { UserRole } from '@prisma/client';

export interface AuthUserPayload {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  organizationId: string;
  roomId?: string;
  subroomId?: string;
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    user: AuthUserPayload;
  }
}

export async function registerAuthPlugin(app: FastifyInstance): Promise<void> {
  await app.register(fastifyJwt, {
    secret: config.JWT_SECRET,
    sign: {
      expiresIn: config.JWT_EXPIRES_IN,
    },
  });

  app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Invalid or expired authentication token';
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message,
      });
    }
  });
}

/**
 * RBAC Authorization Guard: Verifies that authenticated user has one of the allowed roles
 */
export function requireRole(allowedRoles: UserRole[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    // 1. Ensure authenticated
    await (request.server as FastifyInstance).authenticate(request, reply);
    if (reply.sent) return;

    // 2. Check role
    const userRole = request.user.role;
    if (!allowedRoles.includes(userRole)) {
      return reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: `Role ${userRole} is not authorized to access this resource. Required: ${allowedRoles.join(', ')}`,
      });
    }
  };
}

/**
 * Optional Authentication: Attaches request.user if valid token present, but doesn't block if missing
 */
export async function optionalAuthenticate(request: FastifyRequest) {
  try {
    await request.jwtVerify();
  } catch {
    // Continue unauthenticated
  }
}
