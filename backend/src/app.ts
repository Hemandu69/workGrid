import Fastify, { FastifyInstance } from 'fastify';
import { config } from './config/index.js';
import { registerSecurityPlugins } from './plugins/security.js';
import { registerAuthPlugin } from './plugins/auth.js';
import { setupErrorHandler } from './plugins/error-handler.js';
import { healthRoutes } from './routes/health.js';
import { v1Routes } from './routes/v1/index.js';
import { setupSocketIO } from './realtime/socket.js';

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

  // Gracefully parse empty body with application/json content-type
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    if (!body || body === '') {
      done(null, {});
      return;
    }
    try {
      const json = JSON.parse(body as string);
      done(null, json);
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  // JWT & Authentication Plugin
  await registerAuthPlugin(app);

  // Initialize Socket.IO Real-Time Transport (Single WorkGrid Real-Time Layer)
  setupSocketIO(app);

  // Route Registrations
  await app.register(healthRoutes);
  await app.register(v1Routes, { prefix: '/api/v1' });

  return app;
}
