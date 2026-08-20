import Redis from 'ioredis';
import { config } from '../config/index.js';

let redisClient: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis(config.REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        // Exponential backoff capped at 2 seconds
        return Math.min(times * 100, 2000);
      },
      lazyConnect: true,
    });

    redisClient.on('error', (err) => {
      // Avoid unhandled rejection crashing the app in background
      if (process.env.NODE_ENV !== 'test') {
        console.error('Redis Client Error:', err.message);
      }
    });
  }
  return redisClient;
}

export async function checkRedisHealth(): Promise<{ status: 'healthy' | 'unhealthy'; latencyMs?: number; error?: string }> {
  const client = getRedisClient();
  const start = Date.now();
  try {
    if (client.status === 'wait') {
      await client.connect();
    }
    const response = await client.ping();
    if (response === 'PONG') {
      return {
        status: 'healthy',
        latencyMs: Date.now() - start,
      };
    }
    return {
      status: 'unhealthy',
      error: `Unexpected Redis response: ${response}`,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Redis connection failed';
    return {
      status: 'unhealthy',
      error: message,
    };
  }
}

export async function closeRedisConnection(): Promise<void> {
  if (redisClient) {
    await redisClient.quit().catch(() => redisClient?.disconnect());
    redisClient = null;
  }
}
