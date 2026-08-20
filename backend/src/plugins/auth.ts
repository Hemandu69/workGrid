import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import { config } from '../config/index.js';
import { AccountStatus, UserRole } from '@prisma/client';

export interface AuthUserPayload {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  accountStatus: AccountStatus;
  organizationId: string;
  roomId?: string;
  subroomId?: string;
}

export type Capability =
  | 'MANAGE_PEOPLE'
  | 'PROVISION_USERS'
  | 'ASSIGN_ROLES'
  | 'MANAGE_ACCOUNT_STATUS'
  | 'VIEW_ROLE_AUDIT'
  | 'OPERATIONS_ACCESS'
  | 'ROOM_MANAGEMENT'
  | 'SERVER_MONITORING'
  | 'TASK_MANAGEMENT'
  | 'ANNOUNCEMENTS_MANAGE'
  | 'SUPER_ADMIN_ACCESS';

export const ROLE_CAPABILITIES: Record<UserRole, Capability[]> = {
  [UserRole.SUPER_ADMIN]: [
    'MANAGE_PEOPLE',
    'PROVISION_USERS',
    'ASSIGN_ROLES',
    'MANAGE_ACCOUNT_STATUS',
    'VIEW_ROLE_AUDIT',
    'OPERATIONS_ACCESS',
    'ROOM_MANAGEMENT',
    'SERVER_MONITORING',
    'TASK_MANAGEMENT',
    'ANNOUNCEMENTS_MANAGE',
    'SUPER_ADMIN_ACCESS',
  ],
  [UserRole.ADMIN]: [
    'OPERATIONS_ACCESS',
    'ROOM_MANAGEMENT',
    'SERVER_MONITORING',
    'TASK_MANAGEMENT',
    'ANNOUNCEMENTS_MANAGE',
  ],
  [UserRole.HR]: [
    'MANAGE_PEOPLE',
    'PROVISION_USERS',
    'ASSIGN_ROLES',
    'MANAGE_ACCOUNT_STATUS',
    'VIEW_ROLE_AUDIT',
  ],
  [UserRole.TEAM_LEAD]: [
    'TASK_MANAGEMENT',
  ],
  [UserRole.SERVER]: [
    'OPERATIONS_ACCESS', // room-scoped only
    'SERVER_MONITORING',
    'TASK_MANAGEMENT',
  ],
  [UserRole.MEMBER]: [
    'TASK_MANAGEMENT',
  ],
};

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
 * and has an ACTIVE account status.
 */
export function requireRole(allowedRoles: UserRole[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    // 1. Ensure authenticated
    await (request.server as FastifyInstance).authenticate(request, reply);
    if (reply.sent) return;

    // 2. Check account status
    const accountStatus = request.user.accountStatus;
    if (accountStatus && accountStatus !== AccountStatus.ACTIVE) {
      return reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: `Account is in ${accountStatus} state. Access denied.`,
      });
    }

    // 3. Check role
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
 * Capability-based Authorization Guard: Verifies that authenticated user has the required capability
 * and has an ACTIVE account status.
 */
export function requireCapability(requiredCapability: Capability) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    // 1. Ensure authenticated
    await (request.server as FastifyInstance).authenticate(request, reply);
    if (reply.sent) return;

    // 2. Check account status
    const accountStatus = request.user.accountStatus;
    if (accountStatus && accountStatus !== AccountStatus.ACTIVE) {
      return reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: `Account is in ${accountStatus} state. Access denied.`,
      });
    }

    // 3. Check capability
    const userRole = request.user.role;
    const capabilities = ROLE_CAPABILITIES[userRole] || [];
    if (!capabilities.includes(requiredCapability)) {
      return reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: `Role ${userRole} lacks capability ${requiredCapability}.`,
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
