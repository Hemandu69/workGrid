import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import supertest from 'supertest';
import { UserRole } from '@prisma/client';

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    user: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: 'member-1-id',
          name: 'Sarah Connor',
          email: 'sarah.connor@workgrid.corp',
          role: 'MEMBER',
          status: 'ONLINE',
          title: 'Senior Systems Engineer',
          avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330',
          capacityLimitHours: 35,
          currentAllocatedHours: 28,
          room: { letter: 'B', name: 'Sector B — Infrastructure & Security' },
          subroom: { code: 'B3' },
          availabilitySlots: [
            { day: 'THURSDAY', hour: 10, state: 'AVAILABLE' },
            { day: 'THURSDAY', hour: 11, state: 'AVAILABLE' },
            { day: 'THURSDAY', hour: 12, state: 'BUSY' },
          ],
          assignedTasks: [
            {
              id: 'task-1-id',
              taskIdDisplay: 'TSK-8421',
              title: 'Design System Migration & Audit',
              status: 'IN_PROGRESS',
              priority: 'HIGH',
              estimatedHours: 12,
              allocatedHours: 8,
              dueDate: new Date('2026-08-21T00:00:00.000Z'),
            },
          ],
        },
        {
          id: 'member-2-id',
          name: 'Alex Rivera',
          email: 'alex.rivera@workgrid.corp',
          role: 'MEMBER',
          status: 'ONLINE',
          title: 'Infrastructure Specialist',
          avatarUrl: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61',
          capacityLimitHours: 40,
          currentAllocatedHours: 36,
          room: { letter: 'B', name: 'Sector B — Infrastructure & Security' },
          subroom: { code: 'B3' },
          availabilitySlots: [
            { day: 'THURSDAY', hour: 10, state: 'AVAILABLE' },
            { day: 'THURSDAY', hour: 11, state: 'AVAILABLE' },
          ],
          assignedTasks: [],
        },
      ]),
      findUnique: vi.fn().mockResolvedValue({
        id: 'member-1-id',
        name: 'Sarah Connor',
        email: 'sarah.connor@workgrid.corp',
        role: 'MEMBER',
        status: 'ONLINE',
        title: 'Senior Systems Engineer',
        avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330',
        capacityLimitHours: 35,
        currentAllocatedHours: 28,
        room: { letter: 'B', name: 'Sector B — Infrastructure & Security' },
        subroom: { code: 'B3' },
        availabilitySlots: [
          { day: 'MONDAY', hour: 10, state: 'AVAILABLE' },
          { day: 'MONDAY', hour: 11, state: 'AVAILABLE' },
          { day: 'MONDAY', hour: 12, state: 'BUSY' },
          { day: 'TUESDAY', hour: 9, state: 'AVAILABLE' },
          { day: 'WEDNESDAY', hour: 14, state: 'AVAILABLE' },
          { day: 'THURSDAY', hour: 10, state: 'AVAILABLE' },
          { day: 'FRIDAY', hour: 10, state: 'AVAILABLE' },
        ],
        assignedTasks: [
          {
            id: 'task-1-id',
            taskIdDisplay: 'TSK-8421',
            title: 'Design System Migration & Audit',
            description: 'Audit legacy color codes and update typography',
            status: 'IN_PROGRESS',
            priority: 'HIGH',
            estimatedHours: 12,
            allocatedHours: 8,
            dueDate: new Date('2026-08-21T00:00:00.000Z'),
          },
        ],
      }),
    },
  },
}));

vi.mock('../src/db/client.js', () => ({
  prisma: mockPrisma,
  checkDatabaseHealth: vi.fn().mockResolvedValue({ status: 'healthy', latencyMs: 1 }),
}));

describe('People Availability Endpoints (/api/v1/availability/people)', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let superAdminToken: string;
  let serverToken: string;
  let memberToken: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    adminToken = app.jwt.sign({
      id: 'admin-1-id',
      email: 'admin@workgrid.corp',
      name: 'Marcus Sterling',
      role: UserRole.ADMIN,
      organizationId: 'org-1',
    });

    superAdminToken = app.jwt.sign({
      id: 'superadmin-1-id',
      email: 'elena.vance@workgrid.corp',
      name: 'Elena Vance',
      role: UserRole.SUPER_ADMIN,
      organizationId: 'org-1',
    });

    serverToken = app.jwt.sign({
      id: 'server-1-id',
      email: 'david.chen@workgrid.corp',
      name: 'David Chen',
      role: UserRole.SERVER,
      organizationId: 'org-1',
    });

    memberToken = app.jwt.sign({
      id: 'member-1-id',
      email: 'sarah.connor@workgrid.corp',
      name: 'Sarah Connor',
      role: UserRole.MEMBER,
      organizationId: 'org-1',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/availability/people should allow ADMIN with 200 and summary statistics', async () => {
    const res = await supertest(app.server)
      .get('/api/v1/availability/people?date=2026-08-20&startHour=10&endHour=11')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('timeSlot');
    expect(res.body).toHaveProperty('summary');
    expect(res.body.summary).toHaveProperty('totalPeople');
    expect(res.body.summary).toHaveProperty('freeCount');
    expect(res.body.summary).toHaveProperty('busyCount');
    expect(Array.isArray(res.body.people)).toBe(true);
  });

  it('GET /api/v1/availability/people should allow SUPER_ADMIN with 200', async () => {
    const res = await supertest(app.server)
      .get('/api/v1/availability/people')
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.status).toBe(200);
  });

  it('GET /api/v1/availability/people should reject SERVER with 403 Forbidden', async () => {
    const res = await supertest(app.server)
      .get('/api/v1/availability/people')
      .set('Authorization', `Bearer ${serverToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Forbidden');
  });

  it('GET /api/v1/availability/people should reject MEMBER with 403 Forbidden', async () => {
    const res = await supertest(app.server)
      .get('/api/v1/availability/people')
      .set('Authorization', `Bearer ${memberToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Forbidden');
  });

  it('GET /api/v1/availability/people should reject unauthenticated requests with 401', async () => {
    const res = await supertest(app.server).get('/api/v1/availability/people');

    expect(res.status).toBe(401);
  });

  it('GET /api/v1/availability/people/:id should return detailed weekly timeline and next free for ADMIN', async () => {
    const res = await supertest(app.server)
      .get('/api/v1/availability/people/member-1-id')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('person');
    expect(res.body).toHaveProperty('currentStatus');
    expect(res.body).toHaveProperty('nextFree');
    expect(res.body).toHaveProperty('weeklyTimeline');
    expect(res.body).toHaveProperty('upcomingCommitments');
    expect(Array.isArray(res.body.weeklyTimeline)).toBe(true);
    expect(res.body.weeklyTimeline.length).toBe(7);
  });

  it('GET /api/v1/availability/people/:id should reject MEMBER with 403 Forbidden', async () => {
    const res = await supertest(app.server)
      .get('/api/v1/availability/people/member-1-id')
      .set('Authorization', `Bearer ${memberToken}`);

    expect(res.status).toBe(403);
  });
});
