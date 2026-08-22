import { FastifyPluginAsync } from 'fastify';
import { CampaignService } from '../../services/campaign.service.js';
import { createTaskCampaignSchema } from '../../schemas/task.schema.js';
import { requireRole } from '../../plugins/auth.js';
import { UserRole } from '@prisma/client';

export const campaignRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/v1/task-campaigns
  // Protected: campaigns are organizational data and must not leak cross-org.
  fastify.get('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    try {
      const campaigns = await CampaignService.getCampaigns(request.user.organizationId);
      return reply.send(campaigns);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to query campaigns';
      return reply.status(500).send({
        statusCode: 500,
        error: 'Internal Server Error',
        message,
      });
    }
  });

  // POST /api/v1/task-campaigns
  // Protected: SUPER_ADMIN and ADMIN can create campaigns
  fastify.post(
    '/',
    {
      preHandler: [requireRole([UserRole.SUPER_ADMIN, UserRole.ADMIN])],
    },
    async (request, reply) => {
      const parseResult = createTaskCampaignSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Validation failed',
          details: parseResult.error.format(),
        });
      }

      try {
        const campaign = await CampaignService.createCampaign(parseResult.data, request.user);
        return reply.status(201).send(campaign);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to create campaign';
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message,
        });
      }
    }
  );
};
