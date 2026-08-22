import { FastifyReply, FastifyRequest } from 'fastify';
import { IdempotencyService } from '../services/idempotency.service.js';

const IDEMPOTENCY_HEADER = 'idempotency-key';

/**
 * Wraps a mutation route handler with idempotency-key deduplication when the
 * client sends an `Idempotency-Key` header. Explicit per call site (not
 * global middleware) so it's obvious at a glance which routes are protected.
 * No header present => runs exactly as it does today, unprotected.
 */
export async function withIdempotency<T>(
  request: FastifyRequest,
  reply: FastifyReply,
  routeKey: string,
  handler: () => Promise<{ statusCode: number; body: T }>
): Promise<void> {
  const clientKey = request.headers[IDEMPOTENCY_HEADER] as string | undefined;

  if (!clientKey) {
    const result = await handler();
    reply.status(result.statusCode).send(result.body);
    return;
  }

  const { organizationId, id: userId } = request.user;
  const claim = await IdempotencyService.claim(organizationId, userId, routeKey, clientKey);

  if (!claim.acquired) {
    if (claim.replay) {
      reply.status(claim.replay.statusCode).send(claim.replay.body);
      return;
    }
    reply.status(409).send({
      statusCode: 409,
      error: 'Conflict',
      message: 'A request with this Idempotency-Key is already being processed.',
    });
    return;
  }

  try {
    const result = await handler();
    await IdempotencyService.complete(organizationId, userId, routeKey, clientKey, result.statusCode, result.body);
    reply.status(result.statusCode).send(result.body);
  } catch (err) {
    await IdempotencyService.release(organizationId, userId, routeKey, clientKey);
    throw err;
  }
}
