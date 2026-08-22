import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import supertest from 'supertest';
import { UserRole } from '@prisma/client';

const FIXTURE_USERS = [
  {
    id: 'user-org1-id',
    organizationId: 'test-org-id',
    name: 'Org 1 Member',
    email: 'org1.member@workgrid.corp',
    role: 'MEMBER',
    accountStatus: 'ACTIVE',
    status: 'ONLINE',
    presenceState: 'IN',
    title: 'Engineer',
    avatarUrl: null,
    capacityLimitHours: 40,
    currentAllocatedHours: 10,
    room: null,
    subroom: null,
    createdAt: new Date(),
  },
  {
    id: 'user-org2-id',
    organizationId: 'other-org-id',
    name: 'Org 2 Member',
    email: 'org2.member@other-org.corp',
    role: 'MEMBER',
    accountStatus: 'ACTIVE',
    status: 'ONLINE',
    presenceState: 'IN',
    title: 'Engineer',
    avatarUrl: null,
    capacityLimitHours: 40,
    currentAllocatedHours: 10,
    room: null,
    subroom: null,
    createdAt: new Date(),
  },
];

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    user: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('../src/db/client.js', () => ({
  prisma: mockPrisma,
  checkDatabaseHealth: vi.fn().mockResolvedValue({ status: 'healthy', latencyMs: 1 }),
}));

describe('User Directory Endpoints (/api/v1/users)', () => {
  let app: FastifyInstance;
  let org1Token: string;
  let org2Token: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    org1Token = app.jwt.sign({
      id: 'org1-caller-id',
      email: 'caller@workgrid.corp',
      name: 'Org 1 Caller',
      role: UserRole.MEMBER,
      organizationId: 'test-org-id',
    });

    org2Token = app.jwt.sign({
      id: 'org2-caller-id',
      email: 'caller@other-org.corp',
      name: 'Org 2 Caller',
      role: UserRole.MEMBER,
      organizationId: 'other-org-id',
    });

    // Wire the mock to actually filter by the where.organizationId the
    // route is expected to pass — a static fixed-list mock would silently
    // hide an org-isolation regression.
    mockPrisma.user.findMany.mockImplementation(async (args: any) => {
      const orgId = args?.where?.organizationId;
      return FIXTURE_USERS.filter((u) => !orgId || u.organizationId === orgId);
    });
    mockPrisma.user.count.mockImplementation(async (args: any) => {
      const orgId = args?.where?.organizationId;
      return FIXTURE_USERS.filter((u) => !orgId || u.organizationId === orgId).length;
    });
    mockPrisma.user.findFirst.mockImplementation(async (args: any) => {
      const where = args?.where || {};
      return FIXTURE_USERS.find((u) => u.id === where.id && (!where.organizationId || u.organizationId === where.organizationId)) || null;
    });
    mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/users requires authentication (401 without a token)', async () => {
    const res = await supertest(app.server).get('/api/v1/users');
    expect(res.status).toBe(401);
  });

  it('GET /api/v1/users returns only the caller organization users', async () => {
    const res = await supertest(app.server).get('/api/v1/users').set('Authorization', `Bearer ${org1Token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].id).toBe('user-org1-id');
  });

  it('GET /api/v1/users never returns another organization users', async () => {
    const res = await supertest(app.server).get('/api/v1/users').set('Authorization', `Bearer ${org2Token}`);

    expect(res.status).toBe(200);
    expect(res.body.items.every((u: { id: string }) => u.id !== 'user-org1-id')).toBe(true);
  });

  it('GET /api/v1/users rejects a limit above the server maximum (200) with 400', async () => {
    const res = await supertest(app.server)
      .get('/api/v1/users?limit=9999')
      .set('Authorization', `Bearer ${org1Token}`);

    expect(res.status).toBe(400);
  });

  it('GET /api/v1/users honors a valid limit within range', async () => {
    const res = await supertest(app.server)
      .get('/api/v1/users?limit=1&offset=0')
      .set('Authorization', `Bearer ${org1Token}`);

    expect(res.status).toBe(200);
    expect(res.body.limit).toBe(1);
    expect(res.body.offset).toBe(0);
  });

  it('GET /api/v1/users/:id requires authentication (401 without a token)', async () => {
    const res = await supertest(app.server).get('/api/v1/users/user-org1-id');
    expect(res.status).toBe(401);
  });

  it('GET /api/v1/users/:id 404s for a user in another organization', async () => {
    const res = await supertest(app.server)
      .get('/api/v1/users/user-org1-id')
      .set('Authorization', `Bearer ${org2Token}`);

    expect(res.status).toBe(404);
  });

  it('GET /api/v1/users/:id succeeds for a user in the caller own organization', async () => {
    const res = await supertest(app.server)
      .get('/api/v1/users/user-org1-id')
      .set('Authorization', `Bearer ${org1Token}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe('user-org1-id');
  });
});
