import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import supertest from 'supertest';
import { UserRole } from '@prisma/client';

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    task: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: 'task-1-id',
          taskIdDisplay: 'TSK-8421',
          title: 'Design System Migration & Audit',
          description: 'Audit legacy color codes and update typography',
          status: 'IN_PROGRESS',
          priority: 'HIGH',
          assigneeId: 'member-1-id',
          creatorId: 'server-id',
          campaignId: 'camp-1-id',
          estimatedHours: 12,
          allocatedHours: 8,
          dueDate: new Date(),
          createdAt: new Date(),
          tags: ['Design System'],
          assignee: {
            name: 'Sarah Connor',
            avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330',
            room: { letter: 'B' },
            subroom: { code: 'B3' },
          },
          creator: { name: 'David Chen' },
          campaign: { title: 'Q3 Core UX' },
          _count: { comments: 2 },
        },
      ]),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    user: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    taskComment: {
      create: vi.fn(),
    },
  },
}));

vi.mock('../src/db/client.js', () => ({
  prisma: mockPrisma,
  checkDatabaseHealth: vi.fn().mockResolvedValue({ status: 'healthy', latencyMs: 1 }),
}));

describe('Task Endpoints (/api/v1/tasks)', () => {
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

  it('GET /api/v1/tasks should return list of tasks', async () => {
    const res = await supertest(app.server).get('/api/v1/tasks');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('POST /api/v1/tasks should reject member creation attempts with 403', async () => {
    const res = await supertest(app.server)
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        title: 'Unauthorized Task',
        assigneeId: 'some-assignee',
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Forbidden');
  });

  it('POST /api/v1/tasks should reject unauthenticated requests with 401', async () => {
    const res = await supertest(app.server)
      .post('/api/v1/tasks')
      .send({
        title: 'No Auth Task',
        assigneeId: 'some-assignee',
      });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Unauthorized');
  });
});
