import { FastifyPluginAsync } from 'fastify';
import { DashboardService } from '../../services/dashboard.service.js';

export const dashboardRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/v1/dashboard/summary
  fastify.get('/summary', async (request, reply) => {
    try {
      const organizationId = (request as any).user?.organizationId;
      const summary = await DashboardService.getSummary(organizationId);
      return reply.send(summary);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to generate dashboard summary';
      return reply.status(500).send({
        statusCode: 500,
        error: 'Internal Server Error',
        message,
      });
    }
  });
};
