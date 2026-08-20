import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { config } from '../config/index.js';

export function setupErrorHandler(app: { setErrorHandler: (fn: (error: FastifyError | Error, request: FastifyRequest, reply: FastifyReply) => void) => void }): void {
  app.setErrorHandler((error: FastifyError | Error, request: FastifyRequest, reply: FastifyReply) => {
    request.log.error(error);

    // Zod validation error
    if (error instanceof ZodError) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Validation failed',
        details: error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        })),
      });
    }

    // Fastify schema validation error
    if ('validation' in error && error.validation) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: error.message,
      });
    }

    // Fastify standard HTTP status code error
    const statusCode = ('statusCode' in error && typeof error.statusCode === 'number') ? error.statusCode : 500;

    // Never leak stack traces or internal errors in production
    const message = statusCode >= 500 && config.NODE_ENV === 'production'
      ? 'An unexpected internal server error occurred'
      : error.message || 'Internal Server Error';

    return reply.status(statusCode).send({
      statusCode,
      error: statusCode >= 500 ? 'Internal Server Error' : error.name || 'Error',
      message,
    });
  });
}
