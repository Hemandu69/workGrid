import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { checkDatabaseHealth } from '../db/client.js';
import { checkRedisHealth } from '../redis/client.js';

interface HealthResponse {
  status: 'ok' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptimeSeconds: number;
  environment: string;
  version: string;
  services: {
    database: {
      status: 'healthy' | 'unhealthy';
      latencyMs?: number;
      error?: string;
    };
    redis: {
      status: 'healthy' | 'unhealthy';
      latencyMs?: number;
      error?: string;
    };
  };
}

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  // Liveness probe: returns 200 OK if server process is running
  app.get('/health/live', async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.status(200).send({ status: 'ok', check: 'liveness' });
  });

  // Readiness / Full Health probe
  const handleFullHealthCheck = async (_req: FastifyRequest, reply: FastifyReply) => {
    const [dbHealth, redisHealth] = await Promise.all([
      checkDatabaseHealth(),
      checkRedisHealth(),
    ]);

    const isDbHealthy = dbHealth.status === 'healthy';
    const isRedisHealthy = redisHealth.status === 'healthy';

    let overallStatus: HealthResponse['status'] = 'ok';
    if (!isDbHealthy && !isRedisHealthy) {
      overallStatus = 'unhealthy';
    } else if (!isDbHealthy || !isRedisHealthy) {
      overallStatus = 'degraded';
    }

    const payload: HealthResponse = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      environment: process.env.NODE_ENV || 'development',
      version: process.env.npm_package_version || '1.0.0',
      services: {
        database: dbHealth,
        redis: redisHealth,
      },
    };

    const statusCode = overallStatus === 'unhealthy' ? 503 : 200;
    return reply.status(statusCode).send(payload);
  };

  app.get('/health', handleFullHealthCheck);
  app.get('/health/ready', handleFullHealthCheck);
  app.get('/api/v1/health', handleFullHealthCheck);
}
