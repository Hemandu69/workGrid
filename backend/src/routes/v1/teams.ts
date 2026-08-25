import { FastifyPluginAsync } from 'fastify';
import { UserRole } from '@prisma/client';
import { requireRole } from '../../plugins/auth.js';
import { TeamService } from '../../services/team.service.js';
import { TeamAllocationService } from '../../services/team-allocation.service.js';
import {
  createTeamSchema,
  updateTeamSchema,
  addTeamMemberSchema,
  allocateTeamSchema,
  replaceTeamMemberSchema,
  overrideTeamPlacementSchema,
  clearTeamPlacementSchema,
  placementPreviewQuerySchema,
} from '../../schemas/team.schema.js';

function sendTeamError(reply: any, err: unknown, fallbackMessage: string) {
  const statusCode = (err as any)?.statusCode || 400;
  const message = err instanceof Error ? err.message : fallbackMessage;
  const error = statusCode === 404 ? 'Not Found' : statusCode === 403 ? 'Forbidden' : 'Bad Request';
  return reply.status(statusCode).send({ statusCode, error, message });
}

const ADMIN_ONLY = [UserRole.SUPER_ADMIN, UserRole.ADMIN];

export const teamRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/v1/teams
  fastify.get('/', { preHandler: [requireRole(ADMIN_ONLY)] }, async (request, reply) => {
    try {
      const query = request.query as { eventId?: string };
      const teams = await TeamService.listTeams(request.user.organizationId, query.eventId);
      return reply.send(teams);
    } catch (err: unknown) {
      return sendTeamError(reply, err, 'Failed to list teams');
    }
  });

  // POST /api/v1/teams
  fastify.post('/', { preHandler: [requireRole(ADMIN_ONLY)] }, async (request, reply) => {
    const parsed = createTeamSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'Validation failed', details: parsed.error.format() });
    }
    try {
      const team = await TeamService.createTeam(request.user.organizationId, parsed.data);
      return reply.status(201).send(team);
    } catch (err: unknown) {
      return sendTeamError(reply, err, 'Failed to create team');
    }
  });

  // GET /api/v1/teams/:id
  fastify.get('/:id', { preHandler: [requireRole(ADMIN_ONLY)] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const team = await TeamService.getTeam(id, request.user.organizationId);
      return reply.send(team);
    } catch (err: unknown) {
      return sendTeamError(reply, err, 'Failed to fetch team');
    }
  });

  // PATCH /api/v1/teams/:id
  fastify.patch('/:id', { preHandler: [requireRole(ADMIN_ONLY)] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = updateTeamSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'Validation failed', details: parsed.error.format() });
    }
    try {
      const team = await TeamService.updateTeam(id, request.user.organizationId, parsed.data);
      return reply.send(team);
    } catch (err: unknown) {
      return sendTeamError(reply, err, 'Failed to update team');
    }
  });

  // DELETE /api/v1/teams/:id
  fastify.delete('/:id', { preHandler: [requireRole(ADMIN_ONLY)] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      await TeamService.deleteTeam(id, request.user.organizationId);
      return reply.send({ message: 'Team deleted' });
    } catch (err: unknown) {
      return sendTeamError(reply, err, 'Failed to delete team');
    }
  });

  // POST /api/v1/teams/:id/members
  fastify.post('/:id/members', { preHandler: [requireRole(ADMIN_ONLY)] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = addTeamMemberSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'Validation failed', details: parsed.error.format() });
    }
    try {
      const team = await TeamService.addMember(id, request.user.organizationId, parsed.data.userId);
      return reply.send(team);
    } catch (err: unknown) {
      return sendTeamError(reply, err, 'Failed to add team member');
    }
  });

  // DELETE /api/v1/teams/:id/members/:userId
  fastify.delete('/:id/members/:userId', { preHandler: [requireRole(ADMIN_ONLY)] }, async (request, reply) => {
    const { id, userId } = request.params as { id: string; userId: string };
    try {
      const team = await TeamService.removeMember(id, request.user.organizationId, userId);
      return reply.send(team);
    } catch (err: unknown) {
      return sendTeamError(reply, err, 'Failed to remove team member');
    }
  });

  // GET /api/v1/teams/:id/placement?eventId=&sectionLetter=
  fastify.get('/:id/placement', { preHandler: [requireRole(ADMIN_ONLY)] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = placementPreviewQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'Validation failed', details: parsed.error.format() });
    }
    try {
      const preview = await TeamAllocationService.getSectionPlacementPreview(
        id,
        parsed.data.eventId,
        parsed.data.sectionLetter,
        request.user.organizationId
      );
      return reply.send(preview);
    } catch (err: unknown) {
      return sendTeamError(reply, err, 'Failed to load placement preview');
    }
  });

  // POST /api/v1/teams/:id/placement/allocate
  fastify.post('/:id/placement/allocate', { preHandler: [requireRole(ADMIN_ONLY)] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = allocateTeamSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'Validation failed', details: parsed.error.format() });
    }
    try {
      const preview = await TeamAllocationService.allocateTeamToSection(
        id,
        parsed.data.eventId,
        parsed.data.sectionLetter,
        request.user
      );
      return reply.send(preview);
    } catch (err: unknown) {
      return sendTeamError(reply, err, 'Failed to allocate team');
    }
  });

  // POST /api/v1/teams/:id/placement/replace
  fastify.post('/:id/placement/replace', { preHandler: [requireRole(ADMIN_ONLY)] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = replaceTeamMemberSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'Validation failed', details: parsed.error.format() });
    }
    try {
      const result = await TeamAllocationService.replacePlacement(id, parsed.data.eventId, parsed.data.userId, request.user);
      return reply.send(result);
    } catch (err: unknown) {
      return sendTeamError(reply, err, 'Failed to replace team member');
    }
  });

  // PATCH /api/v1/teams/:id/placement/:userId
  fastify.patch('/:id/placement/:userId', { preHandler: [requireRole(ADMIN_ONLY)] }, async (request, reply) => {
    const { id, userId } = request.params as { id: string; userId: string };
    const parsed = overrideTeamPlacementSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'Validation failed', details: parsed.error.format() });
    }
    try {
      const preview = await TeamAllocationService.overridePlacement(
        id,
        parsed.data.eventId,
        userId,
        parsed.data.subroomCode,
        request.user
      );
      return reply.send(preview);
    } catch (err: unknown) {
      return sendTeamError(reply, err, 'Failed to override team placement');
    }
  });

  // DELETE /api/v1/teams/:id/placement
  fastify.delete('/:id/placement', { preHandler: [requireRole(ADMIN_ONLY)] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = clearTeamPlacementSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'Validation failed', details: parsed.error.format() });
    }
    try {
      await TeamAllocationService.clearTeamPlacement(id, parsed.data.eventId, request.user);
      return reply.send({ message: 'Team placement cleared for this event' });
    } catch (err: unknown) {
      return sendTeamError(reply, err, 'Failed to clear team placement');
    }
  });
};
