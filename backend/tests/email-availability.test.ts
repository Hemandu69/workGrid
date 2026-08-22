import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import supertest from 'supertest';
import * as redisModule from '../src/redis/client.js';
import { BloomFilterService } from '../src/services/bloom-filter.service.js';

/**
 * Minimal fake mirroring the ioredis pipeline API BloomFilterService uses
 * (getbit/setbit queued, resolved together by exec()) — an in-memory bit
 * array keyed by Redis key, exactly like the real bitmap would behave.
 */
function createFakeRedisWithBits() {
  const bits = new Map<string, Set<number>>();
  return {
    status: 'ready',
    connect: vi.fn().mockResolvedValue(undefined),
    pipeline: vi.fn(() => {
      const commands: Array<() => [Error | null, unknown]> = [];
      const pipelineObj = {
        getbit: (key: string, pos: number) => {
          commands.push(() => [null, bits.get(key)?.has(pos) ? 1 : 0]);
          return pipelineObj;
        },
        setbit: (key: string, pos: number, val: number) => {
          commands.push(() => {
            if (!bits.has(key)) bits.set(key, new Set());
            if (val) bits.get(key)!.add(pos);
            else bits.get(key)!.delete(pos);
            return [null, 0];
          });
          return pipelineObj;
        },
        exec: async () => commands.map((run) => run()),
      };
      return pipelineObj;
    }),
  };
}

/**
 * Models a real connection failure the way ioredis actually surfaces it on
 * a pipeline: exec() resolves (does not throw) with a per-command
 * [Error, null] tuple for every queued command, rather than the whole
 * exec() call rejecting. A prior version of definitelyAbsent() treated a
 * truthy per-command error as equivalent to "bit is 0" via `err || val===0`,
 * which silently reported real, already-registered emails as available
 * whenever Redis was unreachable — the exact false negative the spec
 * explicitly forbids. This fixture reproduces that failure mode directly.
 */
function createFakeRedisWithPerCommandErrors() {
  return {
    status: 'ready',
    connect: vi.fn().mockResolvedValue(undefined),
    pipeline: vi.fn(() => {
      let queued = 0;
      const pipelineObj = {
        getbit: () => {
          queued++;
          return pipelineObj;
        },
        setbit: () => {
          queued++;
          return pipelineObj;
        },
        exec: async () => Array.from({ length: queued }, () => [new Error('Connection is closed.'), null]),
      };
      return pipelineObj;
    }),
  };
}

describe('BloomFilterService (unit)', () => {
  it('definitelyAbsent() is true for an email that was never added', async () => {
    vi.spyOn(redisModule, 'getRedisClient').mockReturnValue(createFakeRedisWithBits() as any);
    const result = await BloomFilterService.definitelyAbsent('never.added@example.com');
    expect(result).toBe(true);
  });

  it('definitelyAbsent() is false for an email after add()', async () => {
    const fake = createFakeRedisWithBits();
    vi.spyOn(redisModule, 'getRedisClient').mockReturnValue(fake as any);

    await BloomFilterService.add('added@example.com');
    const result = await BloomFilterService.definitelyAbsent('added@example.com');
    expect(result).toBe(false);
  });

  it('adding one email does not mark an unrelated email as present', async () => {
    const fake = createFakeRedisWithBits();
    vi.spyOn(redisModule, 'getRedisClient').mockReturnValue(fake as any);

    await BloomFilterService.add('added@example.com');
    const result = await BloomFilterService.definitelyAbsent('completely.different@example.com');
    expect(result).toBe(true);
  });

  it('fails open (returns false, i.e. "maybe present") when Redis is unreachable — never trusts an unreadable filter', async () => {
    vi.spyOn(redisModule, 'getRedisClient').mockImplementation(() => {
      throw new Error('Redis unreachable (test)');
    });
    const result = await BloomFilterService.definitelyAbsent('anyone@example.com');
    expect(result).toBe(false);
  });

  it('regression: a per-command pipeline error (real connection-failure shape) is never read as "bit is 0" — must fall through to Postgres, never report a false negative', async () => {
    vi.spyOn(redisModule, 'getRedisClient').mockReturnValue(createFakeRedisWithPerCommandErrors() as any);
    const result = await BloomFilterService.definitelyAbsent('registered.but.redis.down@example.com');
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// HTTP-level: GET /api/v1/auth/email-availability
// ---------------------------------------------------------------------------

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('../src/db/client.js', () => ({
  prisma: mockPrisma,
  checkDatabaseHealth: vi.fn().mockResolvedValue({ status: 'healthy', latencyMs: 1 }),
}));

describe('GET /api/v1/auth/email-availability (integration)', () => {
  let app: FastifyInstance;
  let fakeRedis: ReturnType<typeof createFakeRedisWithBits>;

  const EXISTING_EMAIL = 'taken@workgrid.corp';

  beforeAll(async () => {
    mockPrisma.user.findUnique.mockImplementation(async ({ where }: any) => {
      if (where?.email === EXISTING_EMAIL) return { id: 'usr-taken' };
      return null;
    });

    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    fakeRedis = createFakeRedisWithBits();
    vi.spyOn(redisModule, 'getRedisClient').mockReturnValue(fakeRedis as any);
    mockPrisma.user.findUnique.mockClear();
    mockPrisma.user.findUnique.mockImplementation(async ({ where }: any) => {
      if (where?.email === EXISTING_EMAIL) return { id: 'usr-taken' };
      return null;
    });
    // Pre-warm the filter the same way registration would.
    await BloomFilterService.add(EXISTING_EMAIL);
  });

  it('rejects an invalid email with 400', async () => {
    const res = await supertest(app.server).get('/api/v1/auth/email-availability?email=not-an-email');
    expect(res.status).toBe(400);
  });

  it('reports available for an email the Bloom filter has never seen, without ever querying Postgres', async () => {
    const res = await supertest(app.server).get('/api/v1/auth/email-availability?email=brand.new@workgrid.corp');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ available: true });
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('falls through to Postgres for an email the Bloom filter might have seen, and reports taken when it exists', async () => {
    const res = await supertest(app.server).get(`/api/v1/auth/email-availability?email=${EXISTING_EMAIL}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ available: false });
    expect(mockPrisma.user.findUnique).toHaveBeenCalled();
  });

  it('is case-insensitive — an uppercase variant of a taken email is still reported taken', async () => {
    const res = await supertest(app.server).get('/api/v1/auth/email-availability?email=TAKEN@WORKGRID.CORP');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ available: false });
  });

  it('a Bloom-filter positive that Postgres does not confirm is still reported available — the filter is never authoritative', async () => {
    // Simulate a Bloom false positive / stale filter entry: the bit is set,
    // but Postgres has no matching row.
    await BloomFilterService.add('phantom@workgrid.corp');

    const res = await supertest(app.server).get('/api/v1/auth/email-availability?email=phantom@workgrid.corp');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ available: true });
    expect(mockPrisma.user.findUnique).toHaveBeenCalled();
  });

  // NOTE: the 429 rate-limit path (config.rateLimit override on this route)
  // is intentionally not asserted here — @fastify/rate-limit is skipped
  // entirely under NODE_ENV==='test' (see backend/src/plugins/security.ts),
  // consistent with how the rest of this suite already treats rate limiting.
});
