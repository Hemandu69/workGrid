import { FastifyPluginAsync } from 'fastify';
import { authRoutes } from './auth.js';
import { roomRoutes } from './rooms.js';
import { userRoutes } from './users.js';
import { taskRoutes } from './tasks.js';
import { campaignRoutes } from './campaigns.js';
import { announcementRoutes } from './announcements.js';
import { availabilityRoutes } from './availability.js';
import { dashboardRoutes } from './dashboard.js';
import { operationsRoutes } from './operations.js';
import { hrRoutes } from './hr.js';

export const v1Routes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(authRoutes, { prefix: '/auth' });
  await fastify.register(roomRoutes, { prefix: '/rooms' });
  await fastify.register(userRoutes, { prefix: '/users' });
  await fastify.register(taskRoutes, { prefix: '/tasks' });
  await fastify.register(campaignRoutes, { prefix: '/task-campaigns' });
  await fastify.register(announcementRoutes, { prefix: '/announcements' });
  await fastify.register(availabilityRoutes);
  await fastify.register(dashboardRoutes, { prefix: '/dashboard' });
  await fastify.register(operationsRoutes, { prefix: '/operations' });
  await fastify.register(hrRoutes, { prefix: '/hr' });
};
