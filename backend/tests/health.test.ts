import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildApp } from '../src/app.js';
import * as dbModule from '../src/db/client.js';
import * as redisModule from '../src/redis/client.js';

describe('Backend Health Endpoints', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('GET /health/live should return 200 with liveness status', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/health/live',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('ok');
    expect(body.check).toBe('liveness');
    await app.close();
  });

  it('GET /health should return 200 when database and redis are healthy', async () => {
    vi.spyOn(dbModule, 'checkDatabaseHealth').mockResolvedValue({
      status: 'healthy',
      latencyMs: 5,
    });
    vi.spyOn(redisModule, 'checkRedisHealth').mockResolvedValue({
      status: 'healthy',
      latencyMs: 2,
    });

    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('ok');
    expect(body.services.database.status).toBe('healthy');
    expect(body.services.redis.status).toBe('healthy');
    await app.close();
  });

  it('GET /health should return 200 degraded when one dependency fails', async () => {
    vi.spyOn(dbModule, 'checkDatabaseHealth').mockResolvedValue({
      status: 'healthy',
      latencyMs: 5,
    });
    vi.spyOn(redisModule, 'checkRedisHealth').mockResolvedValue({
      status: 'unhealthy',
      error: 'Redis connection timeout',
    });

    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('degraded');
    expect(body.services.database.status).toBe('healthy');
    expect(body.services.redis.status).toBe('unhealthy');
    await app.close();
  });

  it('GET /health should return 503 unhealthy when both dependencies fail', async () => {
    vi.spyOn(dbModule, 'checkDatabaseHealth').mockResolvedValue({
      status: 'unhealthy',
      error: 'Database connection refused',
    });
    vi.spyOn(redisModule, 'checkRedisHealth').mockResolvedValue({
      status: 'unhealthy',
      error: 'Redis connection refused',
    });

    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(503);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('unhealthy');
    await app.close();
  });
});
