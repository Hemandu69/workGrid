import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import supertest from 'supertest';
import { UserRole, EventScope, PresenceState } from '@prisma/client';
import { OperationsService } from '../src/services/operations.service.js';

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    room: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: 'room-b-id',
          letter: 'B',
          name: 'Sector B — Infrastructure & Security',
          members: [
            {
              id: 'server-1-id',
              name: 'David Chen',
              email: 'david.chen@workgrid.corp',
              role: 'SERVER',
              presenceState: 'IN',
              currentLocationName: 'B4',
              arrivedAt: new Date('2026-08-20T03:35:00.000Z'),
              lastSeenAt: new Date('2026-08-20T10:15:00.000Z'),
            },
            {
              id: 'server-2-id',
              name: 'Maya Lin',
              email: 'maya.lin@workgrid.corp',
              role: 'SERVER',
              presenceState: 'IN',
              currentLocationName: 'B3',
              arrivedAt: new Date('2026-08-20T04:00:00.000Z'),
              lastSeenAt: new Date('2026-08-20T10:20:00.000Z'),
            },
            {
              id: 'server-3-id',
              name: 'Alex Mercer',
              email: 'alex.mercer@workgrid.corp',
              role: 'SERVER',
              presenceState: 'OUT',
              currentLocationName: 'Outside',
              arrivedAt: null,
              leftAt: new Date('2026-08-20T09:00:00.000Z'),
              lastSeenAt: new Date('2026-08-20T09:00:00.000Z'),
            },
          ],
          subrooms: [
            {
              id: 'subroom-b3-id',
              code: 'B3',
              number: 3,
              memberCapacity: 2,
              serverSeatCount: 1,
              members: [
                {
                  id: 'member-1-id',
                  name: 'Sarah Connor',
                  role: 'MEMBER',
                  title: 'Senior Systems Engineer',
                  presenceState: 'IN',
                  currentLocationName: 'B3',
                  arrivedAt: new Date('2026-08-20T03:45:00.000Z'),
                  lastSeenAt: new Date('2026-08-20T10:25:00.000Z'),
                  assignedTasks: [],
                },
              ],
            },
            {
              id: 'subroom-b4-id',
              code: 'B4',
              number: 4,
              memberCapacity: 4,
              serverSeatCount: 1,
              members: [],
            },
          ],
        },
      ]),
    },
    event: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'event-company-1',
        title: 'Annual Company All-Hands',
        description: 'Quarterly organizational review and technical roadmap',
        scope: 'COMPANY',
        status: 'ACTIVE',
        startTime: new Date('2026-08-20T09:30:00.000Z'),
        endTime: new Date('2026-08-20T11:30:00.000Z'),
        requiredServersCount: 18,
        locations: [
          { id: 'loc-1', name: 'Main Auditorium' },
          { id: 'loc-2', name: 'Sector B' },
          { id: 'loc-3', name: 'Remote' },
        ],
        requiredServers: [
          {
            id: 'rs-1',
            serverId: 'server-1-id',
            server: {
              id: 'server-1-id',
              name: 'David Chen',
              presenceState: 'IN',
            },
          },
        ],
      }),
      findMany: vi.fn().mockResolvedValue([
        {
          id: 'event-room-1',
          title: 'AI Infrastructure Workshop',
          scope: 'ROOM',
          status: 'ACTIVE',
          roomId: 'room-b-id',
          subroomId: 'subroom-b4-id',
          startTime: new Date('2026-08-20T10:00:00.000Z'),
          endTime: new Date('2026-08-20T11:30:00.000Z'),
          locations: [{ id: 'loc-room-1', name: 'B4', subroomId: 'subroom-b4-id' }],
          requiredServers: [
            {
              id: 'rs-room-1',
              serverId: 'server-1-id',
              server: { id: 'server-1-id', presenceState: 'IN' },
            },
          ],
        },
      ]),
      findUnique: vi.fn().mockResolvedValue({
        id: 'event-room-1',
        title: 'AI Infrastructure Workshop',
        description: 'Deep dive into distributed model training infrastructure',
        scope: 'ROOM',
        status: 'ACTIVE',
        roomId: 'room-b-id',
        subroomId: 'subroom-b4-id',
        room: { id: 'room-b-id', letter: 'B', name: 'Infrastructure & Security' },
        subroom: { id: 'subroom-b4-id', code: 'B4' },
        startTime: new Date('2026-08-20T10:00:00.000Z'),
        endTime: new Date('2026-08-20T11:30:00.000Z'),
        locations: [{ id: 'loc-1', name: 'B4', subroomId: 'subroom-b4-id' }],
        requiredServers: [
          {
            id: 'rs-1',
            serverId: 'server-1-id',
            server: {
              id: 'server-1-id',
              name: 'David Chen',
              email: 'david.chen@workgrid.corp',
              roomId: 'room-b-id',
              currentLocationName: 'B4',
              presenceState: 'IN',
              lastSeenAt: new Date('2026-08-20T10:20:00.000Z'),
              room: { letter: 'B' },
            },
          },
        ],
        participants: [
          {
            id: 'part-1',
            user: {
              id: 'member-1-id',
              name: 'Sarah Connor',
              role: 'MEMBER',
              presenceState: 'IN',
              currentLocationName: 'B3',
              room: { letter: 'B' },
              subroom: { code: 'B3' },
            },
          },
        ],
      }),
    },
    user: {
      findUnique: vi.fn().mockImplementation(({ where }) => {
        if (where.id === 'server-1-id') {
          return Promise.resolve({
            id: 'server-1-id',
            name: 'David Chen',
            role: 'SERVER',
            roomId: 'room-b-id',
            room: { id: 'room-b-id', letter: 'B' },
          });
        }
        if (where.id === 'member-1-id') {
          return Promise.resolve({
            id: 'member-1-id',
            name: 'Sarah Connor',
            role: 'MEMBER',
            presenceState: 'OUT',
          });
        }
        return Promise.resolve(null);
      }),
      findMany: vi.fn().mockResolvedValue([
        {
          id: 'server-1-id',
          name: 'David Chen',
          email: 'david.chen@workgrid.corp',
          role: 'SERVER',
          roomId: 'room-b-id',
          currentLocationName: 'B4',
          presenceState: 'IN',
          lastSeenAt: new Date(),
          room: { letter: 'B' },
        },
        {
          id: 'server-2-id',
          name: 'Maya Lin',
          email: 'maya.lin@workgrid.corp',
          role: 'SERVER',
          roomId: 'room-b-id',
          currentLocationName: 'B3',
          presenceState: 'IN',
          lastSeenAt: new Date(),
          room: { letter: 'B' },
        },
        {
          id: 'server-3-id',
          name: 'Alex Mercer',
          email: 'alex.mercer@workgrid.corp',
          role: 'SERVER',
          roomId: 'room-b-id',
          currentLocationName: 'Outside',
          presenceState: 'OUT',
          lastSeenAt: new Date(),
          room: { letter: 'B' },
        },
      ]),
      update: vi.fn().mockResolvedValue({
        id: 'member-1-id',
        name: 'Sarah Connor',
        presenceState: 'IN',
        currentLocationName: 'B3',
        arrivedAt: new Date(),
        lastSeenAt: new Date(),
      }),
    },
  },
}));

vi.mock('../src/db/client.js', () => ({
  prisma: mockPrisma,
  checkDatabaseHealth: vi.fn().mockResolvedValue({ status: 'healthy', latencyMs: 1 }),
}));

describe('Operational Room Grid & Server Supervision Endpoints', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let serverToken: string;
  let memberToken: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    adminToken = app.jwt.sign({
      id: 'admin-id',
      email: 'admin@workgrid.corp',
      name: 'Admin User',
      role: UserRole.ADMIN,
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

  it('GET /api/v1/operations/grid should allow ADMIN with 200 and dynamic room topology', async () => {
    const res = await supertest(app.server)
      .get('/api/v1/operations/grid')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('currentTimeIST');
    expect(res.body).toHaveProperty('rooms');
    expect(res.body).toHaveProperty('totalRooms');
    expect(res.body).toHaveProperty('totalPeoplePresent');
    expect(res.body).toHaveProperty('totalServersPresent');
    expect(Array.isArray(res.body.rooms)).toBe(true);
  });

  it('GET /api/v1/operations/grid should allow SERVER for their assigned room', async () => {
    const res = await supertest(app.server)
      .get('/api/v1/operations/grid')
      .set('Authorization', `Bearer ${serverToken}`);

    expect(res.status).toBe(200);
    expect(res.body.rooms[0].letter).toBe('B');
  });

  it('GET /api/v1/operations/grid?room=A should reject SERVER assigned to Room B with 403', async () => {
    const res = await supertest(app.server)
      .get('/api/v1/operations/grid?room=A')
      .set('Authorization', `Bearer ${serverToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Forbidden');
  });

  it('GET /api/v1/operations/grid should reject MEMBER with 403 Forbidden', async () => {
    const res = await supertest(app.server)
      .get('/api/v1/operations/grid')
      .set('Authorization', `Bearer ${memberToken}`);

    expect(res.status).toBe(403);
  });

  it('Dynamic Server Supervision states should be accurately evaluated', () => {
    const event = {
      scope: EventScope.ROOM,
      roomId: 'room-b-id',
      subroomId: 'subroom-b4-id',
      locations: [{ name: 'B4', subroomId: 'subroom-b4-id' }],
      requiredServers: [
        { serverId: 'server-1-id' },
        { serverId: 'server-2-id' },
        { serverId: 'server-3-id' },
      ],
    };

    // Server 1 in B4 -> PRESENT_IN_EVENT
    const status1 = OperationsService.evaluateServerSupervisionStatus(
      {
        id: 'server-1-id',
        roomId: 'room-b-id',
        currentLocationName: 'B4',
        currentLocationSubroomId: 'subroom-b4-id',
        presenceState: PresenceState.IN,
      },
      event
    );
    expect(status1).toBe('PRESENT_IN_EVENT');

    // Server 2 in B3 -> IN_ROOM_DIFFERENT_SUBROOM
    const status2 = OperationsService.evaluateServerSupervisionStatus(
      {
        id: 'server-2-id',
        roomId: 'room-b-id',
        currentLocationName: 'B3',
        presenceState: PresenceState.IN,
      },
      event
    );
    expect(status2).toBe('IN_ROOM_DIFFERENT_SUBROOM');

    // Server 3 outside -> OUTSIDE_ROOM
    const status3 = OperationsService.evaluateServerSupervisionStatus(
      {
        id: 'server-3-id',
        roomId: 'room-b-id',
        currentLocationName: 'Outside',
        presenceState: PresenceState.OUT,
      },
      event
    );
    expect(status3).toBe('OUTSIDE_ROOM');

    // Server not assigned to supervise -> NOT_REQUIRED
    const status4 = OperationsService.evaluateServerSupervisionStatus(
      {
        id: 'server-unassigned-id',
        roomId: 'room-b-id',
        currentLocationName: 'B4',
        presenceState: PresenceState.IN,
      },
      event
    );
    expect(status4).toBe('NOT_REQUIRED');
  });

  it('POST /api/v1/operations/presence lets a user update their own presence', async () => {
    const res = await supertest(app.server)
      .post('/api/v1/operations/presence')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ presenceState: 'IN' });

    expect(res.status).toBe(200);
  });

  it('POST /api/v1/operations/presence forbids an ADMIN from updating another user’s presence', async () => {
    const res = await supertest(app.server)
      .post('/api/v1/operations/presence')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: 'member-1-id', presenceState: 'IN' });

    expect(res.status).toBe(403);
  });

  it('POST /api/v1/operations/presence forbids a SERVER from updating another user’s presence', async () => {
    const res = await supertest(app.server)
      .post('/api/v1/operations/presence')
      .set('Authorization', `Bearer ${serverToken}`)
      .send({ userId: 'member-1-id', presenceState: 'IN' });

    expect(res.status).toBe(403);
  });

  it('GET /api/v1/operations/events/:id should return event detail with server coverage', async () => {
    const res = await supertest(app.server)
      .get('/api/v1/operations/events/event-room-1')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('title');
    expect(res.body).toHaveProperty('serverCoverage');
    expect(res.body.serverCoverage).toHaveProperty('present');
    expect(res.body.serverCoverage).toHaveProperty('inDifferentSubroom');
    expect(res.body.serverCoverage).toHaveProperty('notRequired');
  });
});
