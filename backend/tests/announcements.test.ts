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
      findUnique: vi.fn(),
      update: vi.fn(),
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
  let adminToken: string;
  let superAdminToken: string;
  let otherOrgAdminToken: string;

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

    adminToken = app.jwt.sign({
      id: 'test-admin-id',
      email: 'admin@workgrid.corp',
      name: 'Test Admin',
      role: UserRole.ADMIN,
      organizationId: 'test-org-id',
    });

    superAdminToken = app.jwt.sign({
      id: 'test-superadmin-id',
      email: 'superadmin@workgrid.corp',
      name: 'Test Super Admin',
      role: UserRole.SUPER_ADMIN,
      organizationId: 'test-org-id',
    });

    otherOrgAdminToken = app.jwt.sign({
      id: 'other-org-admin-id',
      email: 'admin@other-org.corp',
      name: 'Other Org Admin',
      role: UserRole.ADMIN,
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
  mockPrisma.announcement.findUnique.mockImplementation(async (args: any) => {
    return FIXTURE_ANNOUNCEMENTS.find((a) => a.id === args?.where?.id) || null;
  });
  mockPrisma.announcement.update.mockImplementation(async (args: any) => {
    const existing = FIXTURE_ANNOUNCEMENTS.find((a) => a.id === args?.where?.id);
    return { ...existing, ...args.data };
  });

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

  describe('PATCH /api/v1/announcements/:id (edit)', () => {
    it('ADMIN can edit an announcement', async () => {
      const res = await supertest(app.server)
        .patch('/api/v1/announcements/ann-1-id')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Updated Title' });

      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Updated Title');
    });

    it('SUPER_ADMIN can edit an announcement', async () => {
      const res = await supertest(app.server)
        .patch('/api/v1/announcements/ann-1-id')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ content: 'Updated content' });

      expect(res.status).toBe(200);
      expect(res.body.content).toBe('Updated content');
    });

    it('unauthorized MEMBER cannot edit', async () => {
      const res = await supertest(app.server)
        .patch('/api/v1/announcements/ann-1-id')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ title: 'Should not work' });

      expect(res.status).toBe(403);
    });

    it('returns 404 for an announcement in another organization', async () => {
      const res = await supertest(app.server)
        .patch('/api/v1/announcements/ann-2-id')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Cross-org edit attempt' });

      expect(res.status).toBe(404);
    });

    it('an ADMIN from another organization cannot edit this organization\'s announcement', async () => {
      const res = await supertest(app.server)
        .patch('/api/v1/announcements/ann-1-id')
        .set('Authorization', `Bearer ${otherOrgAdminToken}`)
        .send({ title: 'Cross-org edit attempt' });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/v1/announcements/:id', () => {
    it('an authorized ADMIN can delete (soft-delete) an announcement', async () => {
      const res = await supertest(app.server)
        .delete('/api/v1/announcements/ann-1-id')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(204);
      expect(mockPrisma.announcement.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'ann-1-id' },
          data: { status: 'ARCHIVED' },
        })
      );
    });

    it('unauthorized MEMBER cannot delete', async () => {
      const res = await supertest(app.server)
        .delete('/api/v1/announcements/ann-1-id')
        .set('Authorization', `Bearer ${memberToken}`);

      expect(res.status).toBe(403);
    });

    it('returns 404 for an announcement in another organization', async () => {
      const res = await supertest(app.server)
        .delete('/api/v1/announcements/ann-2-id')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/v1/announcements/:id/pin and /unpin', () => {
    it('pin persists pinned:true', async () => {
      const res = await supertest(app.server)
        .post('/api/v1/announcements/ann-1-id/pin')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.pinned).toBe(true);
      expect(mockPrisma.announcement.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'ann-1-id' }, data: { pinned: true } })
      );
    });

    it('unpin persists pinned:false', async () => {
      const res = await supertest(app.server)
        .post('/api/v1/announcements/ann-1-id/unpin')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.pinned).toBe(false);
      expect(mockPrisma.announcement.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'ann-1-id' }, data: { pinned: false } })
      );
    });

    it('unauthorized MEMBER cannot pin', async () => {
      const res = await supertest(app.server)
        .post('/api/v1/announcements/ann-1-id/pin')
        .set('Authorization', `Bearer ${memberToken}`);

      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/v1/announcements default status filtering', () => {
    it('excludes ARCHIVED announcements by default', async () => {
      const res = await supertest(app.server)
        .get('/api/v1/announcements')
        .set('Authorization', `Bearer ${memberToken}`);

      expect(res.status).toBe(200);
      const calledWhere = mockPrisma.announcement.findMany.mock.calls.at(-1)?.[0]?.where;
      expect(calledWhere.status).toEqual({ not: 'ARCHIVED' });
    });

    it('explicit ?status=ARCHIVED overrides the default exclusion', async () => {
      const res = await supertest(app.server)
        .get('/api/v1/announcements?status=ARCHIVED')
        .set('Authorization', `Bearer ${memberToken}`);

      expect(res.status).toBe(200);
      const calledWhere = mockPrisma.announcement.findMany.mock.calls.at(-1)?.[0]?.where;
      expect(calledWhere.status).toBe('ARCHIVED');
    });
  });
});
