import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import supertest from 'supertest';
import { UserRole } from '@prisma/client';

const FIXTURE_ANNOUNCEMENTS = [
  {
    id: 'ann-1-id',
    organizationId: 'test-org-id',
    title: 'Scheduled System Maintenance',
    content: 'Database replica scaling',
    status: 'PUBLISHED',
    scope: 'GLOBAL',
    targetRoom: null,
    pinned: true,
    author: { name: 'Elena Vance', role: 'SUPER_ADMIN' },
    publishedAt: new Date(),
    createdAt: new Date(),
  },
  {
    id: 'ann-2-id',
    organizationId: 'other-org-id',
    title: 'Other Org Announcement',
    content: 'Should never be visible to test-org-id callers',
    status: 'PUBLISHED',
    scope: 'GLOBAL',
    targetRoom: null,
    pinned: false,
    author: { name: 'Other Admin', role: 'SUPER_ADMIN' },
    publishedAt: new Date(),
    createdAt: new Date(),
  },
];

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    announcement: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('../src/db/client.js', () => ({
  prisma: mockPrisma,
  checkDatabaseHealth: vi.fn().mockResolvedValue({ status: 'healthy', latencyMs: 1 }),
}));

describe('Announcement Endpoints (/api/v1/announcements)', () => {
  let app: FastifyInstance;
  let memberToken: string;
  let otherOrgMemberToken: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    memberToken = app.jwt.sign({
      id: 'test-member-id',
      email: 'member@workgrid.corp',
      name: 'Test Member',
      role: UserRole.MEMBER,
      organizationId: 'test-org-id',
    });

    otherOrgMemberToken = app.jwt.sign({
      id: 'other-member-id',
      email: 'member@other-org.corp',
      name: 'Other Org Member',
      role: UserRole.MEMBER,
      organizationId: 'other-org-id',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  // Wire the mock to actually filter by the where.organizationId the
  // service/route is expected to pass — a static fixed-list mock would
  // silently hide an org-isolation regression.
  mockPrisma.announcement.findMany.mockImplementation(async (args: any) => {
    const orgId = args?.where?.organizationId;
    return FIXTURE_ANNOUNCEMENTS.filter((a) => !orgId || a.organizationId === orgId);
  });
  mockPrisma.announcement.count.mockImplementation(async (args: any) => {
    const orgId = args?.where?.organizationId;
    return FIXTURE_ANNOUNCEMENTS.filter((a) => !orgId || a.organizationId === orgId).length;
  });
  mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));

  it('GET /api/v1/announcements requires authentication (401 without a token)', async () => {
    const res = await supertest(app.server).get('/api/v1/announcements');
    expect(res.status).toBe(401);
  });

  it('GET /api/v1/announcements returns the caller organization announcements when authenticated', async () => {
    const res = await supertest(app.server)
      .get('/api/v1/announcements')
      .set('Authorization', `Bearer ${memberToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].id).toBe('ann-1-id');
  });

  it('GET /api/v1/announcements never returns another organization announcements', async () => {
    const res = await supertest(app.server)
      .get('/api/v1/announcements')
      .set('Authorization', `Bearer ${otherOrgMemberToken}`);

    expect(res.status).toBe(200);
    expect(res.body.items.every((a: { id: string }) => a.id !== 'ann-1-id')).toBe(true);
  });

  it('POST /api/v1/announcements should reject unauthorized member role with 403', async () => {
    const res = await supertest(app.server)
      .post('/api/v1/announcements')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        title: 'Member Announcement',
        content: 'This should be rejected',
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Forbidden');
  });
});
