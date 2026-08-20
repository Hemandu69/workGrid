import Fastify, { FastifyInstance } from 'fastify';
import { config } from './config/index.js';
import { registerSecurityPlugins } from './plugins/security.js';
import { setupErrorHandler } from './plugins/error-handler.js';
import { healthRoutes } from './routes/health.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger:
      config.NODE_ENV === 'test'
        ? false
        : {
            level: config.LOG_LEVEL,
            transport:
              config.NODE_ENV === 'development'
                ? {
                    target: 'pino-pretty',
                    options: {
                      translateTime: 'HH:MM:ss Z',
                      ignore: 'pid,hostname',
                    },
                  }
                : undefined,
          },
  });

  // Global Error Handler
  setupErrorHandler(app);

  // Security Plugins (Helmet, CORS, Rate Limit, Sensible)
  await registerSecurityPlugins(app);

  // Route Registrations
  await app.register(healthRoutes);

  return app;
}
