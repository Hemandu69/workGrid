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
          roomId: 'room-b-id',
          room: { id: 'room-b-id', letter: 'B', name: 'Sector B — Infrastructure & Security' },
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
          roomId: 'room-b-id',
          room: { id: 'room-b-id', letter: 'B', name: 'Sector B — Infrastructure & Security' },
          subroom: { code: 'B3' },
          availabilitySlots: [
            { day: 'THURSDAY', hour: 10, state: 'AVAILABLE' },
            { day: 'THURSDAY', hour: 11, state: 'AVAILABLE' },
          ],
          assignedTasks: [],
        },
      ]),
      findUnique: vi.fn().mockImplementation(({ where }) => {
        if (where.id === 'server-1-id') {
          return Promise.resolve({
            id: 'server-1-id',
            name: 'David Chen',
            email: 'david.chen@workgrid.corp',
            role: 'SERVER',
            roomId: 'room-b-id',
            room: { id: 'room-b-id', letter: 'B', name: 'Sector B — Infrastructure & Security' },
          });
        }
        if (where.id === 'member-1-id') {
          return Promise.resolve({
            id: 'member-1-id',
            name: 'Sarah Connor',
            email: 'sarah.connor@workgrid.corp',
            role: 'MEMBER',
            status: 'ONLINE',
            title: 'Senior Systems Engineer',
            avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330',
            capacityLimitHours: 35,
            currentAllocatedHours: 28,
            roomId: 'room-b-id',
            room: { id: 'room-b-id', letter: 'B', name: 'Sector B — Infrastructure & Security' },
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
          });
        }
        if (where.id === 'member-other-room-id') {
          return Promise.resolve({
            id: 'member-other-room-id',
            name: 'External Person',
            email: 'ext@workgrid.corp',
            role: 'MEMBER',
            roomId: 'room-a-id',
            room: { id: 'room-a-id', letter: 'A', name: 'Sector A' },
          });
        }
        return Promise.resolve(null);
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
      roomId: 'room-b-id',
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

    const firstPerson = res.body.people[0];
    expect(firstPerson).toHaveProperty('attendanceState');
    expect(firstPerson).toHaveProperty('presenceState');
    expect(firstPerson).toHaveProperty('currentLocation');
  });

  it('GET /api/v1/availability/people should allow SUPER_ADMIN with 200', async () => {
    const res = await supertest(app.server)
      .get('/api/v1/availability/people')
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.status).toBe(200);
  });

  it('GET /api/v1/availability/people should allow SERVER for their assigned room (Room B)', async () => {
    const res = await supertest(app.server)
      .get('/api/v1/availability/people')
      .set('Authorization', `Bearer ${serverToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('people');
  });

  it('GET /api/v1/availability/people should reject SERVER attempting to access another room (Room A) with 403', async () => {
    const res = await supertest(app.server)
      .get('/api/v1/availability/people?room=A')
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
    expect(res.body.person).toHaveProperty('attendanceState');
    expect(res.body.person).toHaveProperty('presenceState');
    expect(res.body.person).toHaveProperty('currentLocation');
    expect(res.body).toHaveProperty('currentStatus');
    expect(res.body).toHaveProperty('nextFree');
    expect(res.body).toHaveProperty('weeklyTimeline');
    expect(res.body).toHaveProperty('upcomingCommitments');
    expect(Array.isArray(res.body.weeklyTimeline)).toBe(true);
    expect(res.body.weeklyTimeline.length).toBe(7);
  });

  it('GET /api/v1/availability/people/:id reads the same persisted slots the member\'s own grid would show — no fabricated 9-17 default, no dropped Unavailable ranges', async () => {
    const res = await supertest(app.server)
      .get('/api/v1/availability/people/member-1-id?startDate=2026-08-24')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const monday = res.body.weeklyTimeline.find((d: { dayOfWeek: string }) => d.dayOfWeek === 'MONDAY');
    expect(monday).toBeDefined();

    // The mocked member-1-id row only sets hours 10 (AVAILABLE), 11 (AVAILABLE),
    // 12 (BUSY) on Monday — every other hour has no saved row.
    const windows = monday.windows as Array<{ startHour: number; endHour: number; state: string }>;
    // Hours before 10 must show as UNAVAILABLE (not a fabricated 9-17 FREE
    // default), and that range must actually be present, not silently dropped.
    const beforeAvailable = windows.find((w) => w.startHour === 0);
    expect(beforeAvailable).toBeDefined();
    expect(beforeAvailable!.state).toBe('UNAVAILABLE');
    expect(beforeAvailable!.endHour).toBe(10);

    // 10-11 merges into one FREE window (consecutive identical AVAILABLE hours).
    const freeWindow = windows.find((w) => w.state === 'FREE' && w.startHour === 10);
    expect(freeWindow).toBeDefined();
    expect(freeWindow!.endHour).toBe(12);

    const busyWindow = windows.find((w) => w.state === 'BUSY');
    expect(busyWindow).toBeDefined();
    expect(busyWindow!.startHour).toBe(12);
    expect(busyWindow!.endHour).toBe(13);

    // Everything after hour 13 is UNAVAILABLE and must still be represented,
    // not dropped by the old 8-18 suppression window.
    const afterBusy = windows.find((w) => w.startHour === 13);
    expect(afterBusy).toBeDefined();
    expect(afterBusy!.state).toBe('UNAVAILABLE');
    expect(afterBusy!.endHour).toBe(24);
  });

  it('GET /api/v1/availability/people/:id should allow SERVER to access person in their own room', async () => {
    const res = await supertest(app.server)
      .get('/api/v1/availability/people/member-1-id')
      .set('Authorization', `Bearer ${serverToken}`);

    expect(res.status).toBe(200);
    expect(res.body.person.id).toBe('member-1-id');
  });

  it('GET /api/v1/availability/people/:id should reject SERVER accessing person in another room with 403', async () => {
    const res = await supertest(app.server)
      .get('/api/v1/availability/people/member-other-room-id')
      .set('Authorization', `Bearer ${serverToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Forbidden');
  });

  it('GET /api/v1/availability/people/:id should reject MEMBER with 403 Forbidden', async () => {
    const res = await supertest(app.server)
      .get('/api/v1/availability/people/member-1-id')
      .set('Authorization', `Bearer ${memberToken}`);

    expect(res.status).toBe(403);
  });
});
