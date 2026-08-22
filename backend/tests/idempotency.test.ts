import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import supertest from 'supertest';
import { UserRole, AccountStatus, TaskStatus } from '@prisma/client';
import * as redisModule from '../src/redis/client.js';
import { IdempotencyService } from '../src/services/idempotency.service.js';
import { IDEMPOTENCY_TTL_SECONDS } from '../src/redis/ttl-config.js';

/** Minimal in-memory fake mirroring ioredis's SET/GET/DEL argument shape. */
function createFakeRedis(opts: { throwOnSet?: boolean } = {}) {
  const store = new Map<string, string>();
  return {
    status: 'ready',
    connect: vi.fn().mockResolvedValue(undefined),
    set: vi.fn(async (key: string, value: string, ...args: unknown[]) => {
      if (opts.throwOnSet) throw new Error('Redis unreachable');
      const mode = args[2] as string | undefined; // 'NX' | 'XX' | undefined
      const exists = store.has(key);
      if (mode === 'NX' && exists) return null;
      if (mode === 'XX' && !exists) return null;
      store.set(key, value);
      return 'OK';
    }),
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    del: vi.fn(async (key: string) => {
      const had = store.has(key);
      store.delete(key);
      return had ? 1 : 0;
    }),
  };
}

describe('IdempotencyService (unit)', () => {
  // Each test re-spies getRedisClient with its own fresh fake below, so no
  // explicit reset is needed between them. Deliberately NOT using
  // vi.restoreAllMocks() here — it resets every vi.fn() in the whole file
  // (not just this describe's spies), which would also wipe out the
  // vi.hoisted() Prisma mocks' default implementations set up further down.

  it('claim() acquires the lock for a never-seen key', async () => {
    vi.spyOn(redisModule, 'getRedisClient').mockReturnValue(createFakeRedis() as any);
    const result = await IdempotencyService.claim('org-1', 'user-1', 'test.route', 'key-a');
    expect(result.acquired).toBe(true);
    expect(result.replay).toBeUndefined();
  });

  it('claims with the TTL sourced from the central redis/ttl-config.ts constant', async () => {
    const fake = createFakeRedis();
    vi.spyOn(redisModule, 'getRedisClient').mockReturnValue(fake as any);
    await IdempotencyService.claim('org-1', 'user-1', 'test.route', 'key-ttl');
    expect(fake.set).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      'EX',
      IDEMPOTENCY_TTL_SECONDS,
      'NX'
    );
  });

  it('claim() on a still-pending key returns acquired:false with no replay (concurrent duplicate)', async () => {
    const fake = createFakeRedis();
    vi.spyOn(redisModule, 'getRedisClient').mockReturnValue(fake as any);

    const first = await IdempotencyService.claim('org-1', 'user-1', 'test.route', 'key-b');
    expect(first.acquired).toBe(true);

    const second = await IdempotencyService.claim('org-1', 'user-1', 'test.route', 'key-b');
    expect(second.acquired).toBe(false);
    expect(second.replay).toBeUndefined();
  });

  it('claim() after complete() replays the stored response instead of re-acquiring', async () => {
    const fake = createFakeRedis();
    vi.spyOn(redisModule, 'getRedisClient').mockReturnValue(fake as any);

    await IdempotencyService.claim('org-1', 'user-1', 'test.route', 'key-c');
    await IdempotencyService.complete('org-1', 'user-1', 'test.route', 'key-c', 201, { id: 'task-123' });

    const retry = await IdempotencyService.claim('org-1', 'user-1', 'test.route', 'key-c');
    expect(retry.acquired).toBe(false);
    expect(retry.replay).toEqual({ statusCode: 201, body: { id: 'task-123' } });
  });

  it('release() clears the lock so a genuine retry can re-acquire', async () => {
    const fake = createFakeRedis();
    vi.spyOn(redisModule, 'getRedisClient').mockReturnValue(fake as any);

    await IdempotencyService.claim('org-1', 'user-1', 'test.route', 'key-d');
    await IdempotencyService.release('org-1', 'user-1', 'test.route', 'key-d');

    const retry = await IdempotencyService.claim('org-1', 'user-1', 'test.route', 'key-d');
    expect(retry.acquired).toBe(true);
  });

  it('different keys never collide with each other', async () => {
    const fake = createFakeRedis();
    vi.spyOn(redisModule, 'getRedisClient').mockReturnValue(fake as any);

    const a = await IdempotencyService.claim('org-1', 'user-1', 'test.route', 'key-e');
    const b = await IdempotencyService.claim('org-1', 'user-1', 'test.route', 'key-f');
    expect(a.acquired).toBe(true);
    expect(b.acquired).toBe(true);
  });

  it('the same client key on a different route does not collide (routeKey is part of the identity)', async () => {
    const fake = createFakeRedis();
    vi.spyOn(redisModule, 'getRedisClient').mockReturnValue(fake as any);

    const a = await IdempotencyService.claim('org-1', 'user-1', 'task.create', 'shared-key');
    const b = await IdempotencyService.claim('org-1', 'user-1', 'announcement.create', 'shared-key');
    expect(a.acquired).toBe(true);
    expect(b.acquired).toBe(true);
  });

  it('fails open (acquired: true) when Redis is unreachable, so the mutation still runs', async () => {
    vi.spyOn(redisModule, 'getRedisClient').mockReturnValue(createFakeRedis({ throwOnSet: true }) as any);
    const result = await IdempotencyService.claim('org-1', 'user-1', 'test.route', 'key-g');
    expect(result.acquired).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// HTTP-level integration: duplicate task-creation requests via POST /tasks
// ---------------------------------------------------------------------------

const USERS: Record<string, any> = {
  'admin-1': { id: 'admin-1', name: 'Marcus Sterling', email: 'admin@workgrid.corp', role: 'ADMIN', accountStatus: 'ACTIVE', organizationId: 'org-1', roomId: null },
  'member-1': { id: 'member-1', name: 'Sarah Connor', email: 'sarah@workgrid.corp', role: 'MEMBER', accountStatus: 'ACTIVE', organizationId: 'org-1', roomId: null },
};

let tasks: any[] = [];
let taskSeq = 0;

function makeTask(overrides: Record<string, any> = {}) {
  taskSeq++;
  return {
    id: `task-${taskSeq}`,
    taskIdDisplay: `TSK-${1000 + taskSeq}`,
    organizationId: 'org-1',
    title: `Task ${taskSeq}`,
    description: 'desc',
    status: TaskStatus.ASSIGNED,
    priority: 'MEDIUM',
    taskType: 'INDIVIDUAL',
    teamSection: null,
    parentTaskId: null,
    progress: 0,
    estimatedHours: 8,
    allocatedHours: 0,
    dueDate: null,
    assigneeId: null,
    creatorId: null,
    campaignId: null,
    tags: [],
    completedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function hydrate(t: any) {
  const assignee = t.assigneeId ? USERS[t.assigneeId] : null;
  return {
    ...t,
    assignee: assignee ? { ...assignee, room: null, subroom: null } : null,
    creator: t.creatorId ? USERS[t.creatorId] : null,
    campaign: null,
    childTasks: [],
    _count: { comments: 0 },
  };
}

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    task: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    room: { findFirst: vi.fn() },
    user: { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    taskComment: { create: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    auditEvent: { create: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    $transaction: vi.fn(),
  },
}));

vi.mock('../src/db/client.js', () => ({
  prisma: mockPrisma,
  checkDatabaseHealth: vi.fn().mockResolvedValue({ status: 'healthy', latencyMs: 1 }),
}));

describe('POST /api/v1/tasks — Idempotency-Key deduplication (integration)', () => {
  let app: FastifyInstance;
  const tokens: Record<string, string> = {};
  let fakeRedis: ReturnType<typeof createFakeRedis>;

  beforeAll(async () => {
    mockPrisma.task.findFirst.mockImplementation(({ where }: any) => {
      const ors: any[] = where.OR || [where];
      const found = tasks.find((t) => ors.some((o: any) => (o.id && o.id === t.id) || (o.taskIdDisplay && o.taskIdDisplay === t.taskIdDisplay)));
      return Promise.resolve(found ? hydrate(found) : null);
    });
    mockPrisma.task.create.mockImplementation(({ data }: any) => {
      const created = makeTask({ ...data, dueDate: data.dueDate || null });
      tasks.push(created);
      return Promise.resolve(created);
    });
    mockPrisma.user.findFirst.mockImplementation(({ where }: any) => {
      const ors: any[] = where.OR || [{ id: where.id }];
      const found = Object.values(USERS).find(
        (u: any) => u.organizationId === where.organizationId && ors.some((o: any) => (o.id && o.id === u.id) || (o.email && o.email === u.email))
      );
      return Promise.resolve(found || null);
    });
    mockPrisma.user.update.mockImplementation(() => Promise.resolve({}));
    mockPrisma.auditEvent.create.mockImplementation(({ data }: any) => Promise.resolve({ id: `aud-${Date.now()}`, ...data, createdAt: new Date() }));
    mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));

    app = await buildApp();
    await app.ready();

    for (const [key, u] of Object.entries(USERS)) {
      tokens[key] = app.jwt.sign(u);
    }
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    tasks = [];
    fakeRedis = createFakeRedis();
    // Only re-point the Redis spy per test — restoreAllMocks() would also
    // wipe the vi.hoisted() Prisma mock implementations set up in beforeAll,
    // since those are plain vi.fn()s too, not vi.spyOn()s.
    vi.spyOn(redisModule, 'getRedisClient').mockReturnValue(fakeRedis as any);
  });

  it('a repeated request with the same Idempotency-Key creates exactly one task and replays the same response', async () => {
    const payload = { title: 'Draft the Q3 report', assigneeId: 'member-1', estimatedHours: 4 };

    const first = await supertest(app.server)
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${tokens['admin-1']}`)
      .set('Idempotency-Key', 'client-key-1')
      .send(payload);

    expect(first.status).toBe(201);
    expect(tasks).toHaveLength(1);

    const second = await supertest(app.server)
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${tokens['admin-1']}`)
      .set('Idempotency-Key', 'client-key-1')
      .send(payload);

    expect(second.status).toBe(201);
    expect(second.body.dbId).toBe(first.body.dbId);
    expect(tasks).toHaveLength(1); // still exactly one task row — no duplicate was created
  });

  it('two different Idempotency-Keys create two separate tasks', async () => {
    const payload = { title: 'Independent task', assigneeId: 'member-1', estimatedHours: 2 };

    const first = await supertest(app.server)
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${tokens['admin-1']}`)
      .set('Idempotency-Key', 'client-key-A')
      .send(payload);

    const second = await supertest(app.server)
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${tokens['admin-1']}`)
      .set('Idempotency-Key', 'client-key-B')
      .send(payload);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.body.dbId).not.toBe(second.body.dbId);
    expect(tasks).toHaveLength(2);
  });

  it('a request with no Idempotency-Key header is never deduplicated (existing behavior preserved)', async () => {
    const payload = { title: 'No key task', assigneeId: 'member-1', estimatedHours: 2 };

    const first = await supertest(app.server)
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${tokens['admin-1']}`)
      .send(payload);
    const second = await supertest(app.server)
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${tokens['admin-1']}`)
      .send(payload);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.body.dbId).not.toBe(second.body.dbId);
    expect(tasks).toHaveLength(2);
  });

  it('a validation error under an Idempotency-Key releases the lock so a corrected retry is not blocked', async () => {
    const badPayload = { title: 'Bad assignee', assigneeId: 'no-such-user', estimatedHours: 2 };
    const goodPayload = { title: 'Fixed assignee', assigneeId: 'member-1', estimatedHours: 2 };

    const failed = await supertest(app.server)
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${tokens['admin-1']}`)
      .set('Idempotency-Key', 'client-key-retry')
      .send(badPayload);
    expect(failed.status).toBe(400);
    expect(tasks).toHaveLength(0);

    const retried = await supertest(app.server)
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${tokens['admin-1']}`)
      .set('Idempotency-Key', 'client-key-retry')
      .send(goodPayload);
    expect(retried.status).toBe(201);
    expect(tasks).toHaveLength(1);
  });

  it('Redis being unreachable does not block task creation (fails open)', async () => {
    vi.spyOn(redisModule, 'getRedisClient').mockReturnValue(createFakeRedis({ throwOnSet: true }) as any);
    const payload = { title: 'Created despite Redis outage', assigneeId: 'member-1', estimatedHours: 2 };

    const res = await supertest(app.server)
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${tokens['admin-1']}`)
      .set('Idempotency-Key', 'client-key-outage')
      .send(payload);

    expect(res.status).toBe(201);
    expect(tasks).toHaveLength(1);
  });
});
