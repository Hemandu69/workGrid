import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import supertest from 'supertest';
import { UserRole } from '@prisma/client';
import { buildApp } from '../src/app.js';

const USERS: Record<string, Record<string, unknown>> = {
  'usr-sarah': {
    id: 'usr-sarah',
    name: 'Sarah Connor',
    email: 'sarah.connor@workgrid.corp',
    role: 'MEMBER',
    organizationId: 'org-1',
    currentAllocatedHours: 0,
    capacityLimitHours: 40,
  },
  'usr-liam': {
    id: 'usr-liam',
    name: 'Liam Vance',
    email: 'liam.vance@workgrid.corp',
    role: 'MEMBER',
    organizationId: 'org-1',
    currentAllocatedHours: 0,
    capacityLimitHours: 40,
  },
};

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    user: {
      findUnique: vi.fn(),
    },
    availabilitySlot: {
      findMany: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    $transaction: vi.fn().mockImplementation(async (cb: (tx: unknown) => unknown) => cb(mockPrisma)),
  },
}));

vi.mock('../src/db/client.js', () => ({
  prisma: mockPrisma,
  checkDatabaseHealth: vi.fn().mockResolvedValue({ status: 'healthy', latencyMs: 1 }),
}));

describe('Weekly availability schedule endpoints (/api/v1/users/:id/availability)', () => {
  let app: FastifyInstance;
  let sarahToken: string;
  let liamToken: string;
  let adminToken: string;

  beforeAll(async () => {
    mockPrisma.user.findUnique.mockImplementation(({ where }: { where: { id: string } }) => {
      return Promise.resolve(USERS[where.id] || null);
    });

    app = await buildApp();
    await app.ready();

    sarahToken = app.jwt.sign({
      id: 'usr-sarah',
      email: 'sarah.connor@workgrid.corp',
      name: 'Sarah Connor',
      role: UserRole.MEMBER,
      organizationId: 'org-1',
    });

    liamToken = app.jwt.sign({
      id: 'usr-liam',
      email: 'liam.vance@workgrid.corp',
      name: 'Liam Vance',
      role: UserRole.MEMBER,
      organizationId: 'org-1',
    });

    adminToken = app.jwt.sign({
      id: 'admin-1-id',
      email: 'admin@workgrid.corp',
      name: 'Marcus Sterling',
      role: UserRole.ADMIN,
      organizationId: 'org-1',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects an unauthenticated GET with 401', async () => {
    const res = await supertest(app.server).get('/api/v1/users/usr-sarah/availability');
    expect(res.status).toBe(401);
  });

  it('forbids a MEMBER from reading another user\'s schedule', async () => {
    const res = await supertest(app.server)
      .get('/api/v1/users/usr-liam/availability')
      .set('Authorization', `Bearer ${sarahToken}`);
    expect(res.status).toBe(403);
  });

  it('lets a MEMBER read their own schedule', async () => {
    const res = await supertest(app.server)
      .get('/api/v1/users/usr-sarah/availability')
      .set('Authorization', `Bearer ${sarahToken}`);
    expect(res.status).toBe(200);
    expect(res.body.userId).toBe('usr-sarah');
  });

  it('lets an ADMIN read any user\'s schedule', async () => {
    const res = await supertest(app.server)
      .get('/api/v1/users/usr-liam/availability')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });

  it('lets a MEMBER save their own schedule and returns the fresh schedule', async () => {
    const res = await supertest(app.server)
      .put('/api/v1/users/usr-sarah/availability')
      .set('Authorization', `Bearer ${sarahToken}`)
      .send({ slots: [{ day: 'MONDAY', hour: 9, state: 'AVAILABLE' }] });

    expect(res.status).toBe(200);
    expect(mockPrisma.availabilitySlot.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'usr-sarah', OR: [{ day: 'MONDAY', hour: 9 }] },
      })
    );
    expect(mockPrisma.availabilitySlot.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [{ userId: 'usr-sarah', day: 'MONDAY', hour: 9, state: 'AVAILABLE', taskId: undefined }],
      })
    );
  });

  it('sends one bulk delete+createMany pair even for a large multi-slot save (not N sequential upserts)', async () => {
    const slots = Array.from({ length: 90 }, (_, i) => ({
      day: 'MONDAY' as const,
      hour: i % 24,
      state: 'AVAILABLE' as const,
    }));

    const deleteManyCallsBefore = mockPrisma.availabilitySlot.deleteMany.mock.calls.length;
    const createManyCallsBefore = mockPrisma.availabilitySlot.createMany.mock.calls.length;

    const res = await supertest(app.server)
      .put('/api/v1/users/usr-sarah/availability')
      .set('Authorization', `Bearer ${sarahToken}`)
      .send({ slots });

    expect(res.status).toBe(200);
    // Exactly one delete + one createMany for this request, regardless of
    // slot count — never N sequential round trips.
    expect(mockPrisma.availabilitySlot.deleteMany.mock.calls.length).toBe(deleteManyCallsBefore + 1);
    expect(mockPrisma.availabilitySlot.createMany.mock.calls.length).toBe(createManyCallsBefore + 1);
    expect(mockPrisma.availabilitySlot.createMany.mock.calls.at(-1)?.[0]?.data).toHaveLength(90);
  });

  it('rejects a MEMBER saving another user\'s schedule', async () => {
    const res = await supertest(app.server)
      .put('/api/v1/users/usr-liam/availability')
      .set('Authorization', `Bearer ${sarahToken}`)
      .send({ slots: [] });
    expect(res.status).toBe(403);
  });

  it('rejects an ADMIN saving another user\'s schedule — recurring availability is self-owned', async () => {
    const res = await supertest(app.server)
      .put('/api/v1/users/usr-liam/availability')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ slots: [{ day: 'MONDAY', hour: 9, state: 'AVAILABLE' }] });
    expect(res.status).toBe(403);
  });

  it('lets a MEMBER paint a recurring Busy slot with no taskId', async () => {
    const res = await supertest(app.server)
      .put('/api/v1/users/usr-sarah/availability')
      .set('Authorization', `Bearer ${sarahToken}`)
      .send({ slots: [{ day: 'TUESDAY', hour: 14, state: 'BUSY' }] });

    expect(res.status).toBe(200);
    expect(mockPrisma.availabilitySlot.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [{ userId: 'usr-sarah', day: 'TUESDAY', hour: 14, state: 'BUSY', taskId: undefined }],
      })
    );
  });

  it('rejects a legacy PREFERRED state — the value no longer exists', async () => {
    const res = await supertest(app.server)
      .put('/api/v1/users/usr-sarah/availability')
      .set('Authorization', `Bearer ${sarahToken}`)
      .send({ slots: [{ day: 'MONDAY', hour: 9, state: 'PREFERRED' }] });
    expect(res.status).toBe(400);
  });

  it('rejects an update body with a null taskId (must be omitted, not null)', async () => {
    const res = await supertest(app.server)
      .put('/api/v1/users/usr-sarah/availability')
      .set('Authorization', `Bearer ${sarahToken}`)
      .send({ slots: [{ day: 'MONDAY', hour: 9, state: 'AVAILABLE', taskId: null }] });
    expect(res.status).toBe(400);
  });
});
