import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import supertest from 'supertest';
import { UserRole } from '@prisma/client';

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    announcement: {
      count: vi.fn().mockResolvedValue(3),
      findMany: vi.fn().mockResolvedValue([
        {
          id: 'ann-1-id',
          title: 'Scheduled System Maintenance',
          content: 'Database replica scaling',
          status: 'PUBLISHED',
          scope: 'GLOBAL',
          pinned: true,
          author: { name: 'Elena Vance', role: 'SUPER_ADMIN' },
          publishedAt: new Date(),
          createdAt: new Date(),
        },
      ]),
    },
  },
}));

vi.mock('../src/db/client.js', () => ({
  prisma: mockPrisma,
  checkDatabaseHealth: vi.fn().mockResolvedValue({ status: 'healthy', latencyMs: 1 }),
}));

describe('Announcement Endpoints (/api/v1/announcements)', () => {
  let app: FastifyInstance;
  let memberToken: string;

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
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/announcements should return list of announcements', async () => {
    const res = await supertest(app.server).get('/api/v1/announcements');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
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
