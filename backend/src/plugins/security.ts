import { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import { config } from '../config/index.js';

export async function registerSecurityPlugins(app: FastifyInstance): Promise<void> {
  // Useful HTTP utility helpers (e.g. reply.notFound(), reply.badRequest())
  await app.register(sensible);

  // Security Headers
  await app.register(helmet, {
    contentSecurityPolicy: process.env.NODE_ENV === 'production',
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });

  // CORS Configuration
  const rawOrigins = config.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean);
  const allowedOrigins = rawOrigins.map((o) => o.replace(/\/+$/, ''));

  await app.register(cors, {
    origin: (origin, cb) => {
      // Allow requests with no origin (like mobile apps, curl, server-to-server, health checks)
      if (!origin) return cb(null, true);

      const normalizedOrigin = origin.replace(/\/+$/, '');

      // In development or test, allow local origins and configured origins
      if (config.NODE_ENV === 'development' || config.NODE_ENV === 'test') {
        if (
          normalizedOrigin.startsWith('http://localhost') ||
          normalizedOrigin.startsWith('http://127.0.0.1') ||
          allowedOrigins.includes(normalizedOrigin) ||
          allowedOrigins.includes(origin)
        ) {
          return cb(null, true);
        }
      }

      // In production, strictly match against configured frontend origins
      if (allowedOrigins.includes(normalizedOrigin) || allowedOrigins.includes(origin)) {
        return cb(null, true);
      }

      return cb(new Error(`Not allowed by CORS: ${origin}`), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // Global Rate Limiting — disabled under automated tests, where a single
  // suite can legitimately fire far more than RATE_LIMIT_MAX requests against
  // one in-process app instance within the same time window.
  if (config.NODE_ENV !== 'test') {
    await app.register(rateLimit, {
      max: config.RATE_LIMIT_MAX,
      timeWindow: config.RATE_LIMIT_TIME_WINDOW,
      allowList: ['127.0.0.1', 'localhost'],
      errorResponseBuilder: () => ({
        statusCode: 429,
        error: 'Too Many Requests',
        message: 'Rate limit exceeded, please try again later.',
      }),
    });
  }
}
