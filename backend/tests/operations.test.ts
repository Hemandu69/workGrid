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
      count: vi.fn().mockResolvedValue(20),
    },
    organizationEvent: {
      findMany: vi.fn().mockImplementation(() => {
        const now = Date.now();
        return Promise.resolve([
          {
            id: 'event-live-id',
            organizationId: 'org-1',
            title: 'Live Workshop',
            description: 'Ongoing technical workshop',
            scheduledAt: new Date(now - 30 * 60 * 1000),
            scheduledEndAt: new Date(now + 60 * 60 * 1000),
            completedAt: null,
            status: 'UPCOMING',
          },
          {
            id: 'event-a-id',
            organizationId: 'org-1',
            title: 'Annual Technology Conference',
            description: 'Company-wide technical presentations and workshops',
            scheduledAt: new Date(now + 24 * 60 * 60 * 1000),
            scheduledEndAt: new Date(now + 30 * 60 * 60 * 1000),
            completedAt: null,
            status: 'UPCOMING',
          },
          {
            id: 'event-b-id',
            organizationId: 'org-1',
            title: 'Developer Summit',
            description: 'Developer focus group and hackathon',
            scheduledAt: new Date(now + 7 * 24 * 60 * 60 * 1000),
            scheduledEndAt: new Date(now + 8 * 24 * 60 * 60 * 1000),
            completedAt: null,
            status: 'UPCOMING',
          },
          {
            id: 'event-completed-id',
            organizationId: 'org-1',
            title: 'Past Product Launch',
            description: 'Completed launch event',
            scheduledAt: new Date(now - 7 * 24 * 60 * 60 * 1000),
            scheduledEndAt: new Date(now - 6 * 24 * 60 * 60 * 1000),
            completedAt: new Date(now - 6 * 24 * 60 * 60 * 1000),
            status: 'UPCOMING',
          },
          {
            id: 'event-cancelled-id',
            organizationId: 'org-1',
            title: 'Cancelled Offsite',
            description: 'Cancelled executive offsite',
            scheduledAt: new Date(now + 14 * 24 * 60 * 60 * 1000),
            scheduledEndAt: new Date(now + 15 * 24 * 60 * 60 * 1000),
            completedAt: null,
            status: 'CANCELLED',
          },
        ]);
      }),
      findUnique: vi.fn().mockImplementation(({ where }) => {
        const now = Date.now();
        if (where.id === 'event-live-id') {
          return Promise.resolve({
            id: 'event-live-id',
            organizationId: 'org-1',
            title: 'Live Workshop',
            description: 'Ongoing technical workshop',
            scheduledAt: new Date(now - 30 * 60 * 1000),
            scheduledEndAt: new Date(now + 60 * 60 * 1000),
            completedAt: null,
            status: 'UPCOMING',
          });
        }
        if (where.id === 'event-a-id') {
          return Promise.resolve({
            id: 'event-a-id',
            organizationId: 'org-1',
            title: 'Annual Technology Conference',
            description: 'Company-wide technical presentations and workshops',
            scheduledAt: new Date(now + 24 * 60 * 60 * 1000),
            scheduledEndAt: new Date(now + 30 * 60 * 60 * 1000),
            completedAt: null,
            status: 'UPCOMING',
          });
        }
        if (where.id === 'event-b-id') {
          return Promise.resolve({
            id: 'event-b-id',
            organizationId: 'org-1',
            title: 'Developer Summit',
            description: 'Developer focus group and hackathon',
            scheduledAt: new Date(now + 7 * 24 * 60 * 60 * 1000),
            scheduledEndAt: new Date(now + 8 * 24 * 60 * 60 * 1000),
            completedAt: null,
            status: 'UPCOMING',
          });
        }
        if (where.id === 'event-completed-id') {
          return Promise.resolve({
            id: 'event-completed-id',
            organizationId: 'org-1',
            title: 'Past Product Launch',
            description: 'Completed launch event',
            scheduledAt: new Date(now - 7 * 24 * 60 * 60 * 1000),
            scheduledEndAt: new Date(now - 6 * 24 * 60 * 60 * 1000),
            completedAt: new Date(now - 6 * 24 * 60 * 60 * 1000),
            status: 'UPCOMING',
          });
        }
        if (where.id === 'event-cancelled-id') {
          return Promise.resolve({
            id: 'event-cancelled-id',
            organizationId: 'org-1',
            title: 'Cancelled Offsite',
            description: 'Cancelled executive offsite',
            scheduledAt: new Date(now + 14 * 24 * 60 * 60 * 1000),
            scheduledEndAt: new Date(now + 15 * 24 * 60 * 60 * 1000),
            completedAt: null,
            status: 'CANCELLED',
          });
        }
        return Promise.resolve(null);
      }),
    },
    organizationEventResponse: {
      findMany: vi.fn().mockImplementation(({ where }) => {
        if (where.eventId === 'event-live-id') {
          return Promise.resolve([
            { userId: 'member-1-id', response: 'ATTENDING' },
          ]);
        }
        if (where.eventId === 'event-a-id') {
          return Promise.resolve([
            { userId: 'member-1-id', response: 'ATTENDING' },
            { userId: 'server-1-id', response: 'ATTENDING' },
          ]);
        }
        if (where.eventId === 'event-b-id') {
          return Promise.resolve([
            { userId: 'member-1-id', response: 'MAYBE' },
            { userId: 'server-1-id', response: 'NOT_ATTENDING' },
          ]);
        }
        return Promise.resolve([]);
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

  describe('Event-Aware Operations Grid', () => {
    it('GET /grid without eventId returns availableEvents containing ONLY LIVE and UPCOMING events (excludes COMPLETED & CANCELLED)', async () => {
      const res = await supertest(app.server)
        .get('/api/v1/operations/grid')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.selectedEvent).toBeNull();
      expect(Array.isArray(res.body.availableEvents)).toBe(true);

      const eventIds = res.body.availableEvents.map((e: any) => e.id);
      expect(eventIds).toContain('event-live-id');
      expect(eventIds).toContain('event-a-id');
      expect(eventIds).toContain('event-b-id');

      // Crucial: Exclude completed and cancelled events from Operations Grid selector
      expect(eventIds).not.toContain('event-completed-id');
      expect(eventIds).not.toContain('event-cancelled-id');

      // Verify statuses
      const liveEvt = res.body.availableEvents.find((e: any) => e.id === 'event-live-id');
      expect(liveEvt.status).toBe('LIVE');
      const upcomingEvt = res.body.availableEvents.find((e: any) => e.id === 'event-a-id');
      expect(upcomingEvt.status).toBe('UPCOMING');
    });

    it('GET /grid with eventId=event-live-id returns LIVE event context', async () => {
      const res = await supertest(app.server)
        .get('/api/v1/operations/grid?eventId=event-live-id')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.selectedEvent).not.toBeNull();
      expect(res.body.selectedEvent.id).toBe('event-live-id');
      expect(res.body.selectedEvent.status).toBe('LIVE');
      expect(res.body.selectedEvent.attendingCount).toBe(1);
    });

    it('GET /grid with eventId=event-a-id returns Event A context and Sarah Connor as ATTENDING', async () => {
      const res = await supertest(app.server)
        .get('/api/v1/operations/grid?eventId=event-a-id')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.selectedEvent).not.toBeNull();
      expect(res.body.selectedEvent.id).toBe('event-a-id');
      expect(res.body.selectedEvent.title).toBe('Annual Technology Conference');
      expect(res.body.selectedEvent.status).toBe('UPCOMING');
      expect(res.body.selectedEvent.attendingCount).toBe(2);
      expect(res.body.selectedEvent.maybeCount).toBe(0);
      expect(res.body.selectedEvent.notAttendingCount).toBe(0);

      // Verify member eventResponse is ATTENDING
      const sectionB = res.body.rooms.find((r: any) => r.letter === 'B');
      expect(sectionB).toBeDefined();
      const subroomB3 = sectionB.subrooms.find((s: any) => s.code === 'B3');
      expect(subroomB3).toBeDefined();
      const sarah = subroomB3.members.find((m: any) => m.name === 'Sarah Connor');
      expect(sarah).toBeDefined();
      expect(sarah.eventResponse).toBe('ATTENDING');
      // Presence remains physical (IN)
      expect(sarah.presenceState).toBe('IN');
    });

    it('GET /grid with eventId=event-b-id returns Event B context and Sarah Connor as MAYBE (Cross-Event Isolation)', async () => {
      const res = await supertest(app.server)
        .get('/api/v1/operations/grid?eventId=event-b-id')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.selectedEvent).not.toBeNull();
      expect(res.body.selectedEvent.id).toBe('event-b-id');
      expect(res.body.selectedEvent.title).toBe('Developer Summit');
      expect(res.body.selectedEvent.status).toBe('UPCOMING');
      expect(res.body.selectedEvent.attendingCount).toBe(0);
      expect(res.body.selectedEvent.maybeCount).toBe(1);
      expect(res.body.selectedEvent.notAttendingCount).toBe(1);

      // Verify member eventResponse is MAYBE for Event B
      const sectionB = res.body.rooms.find((r: any) => r.letter === 'B');
      const subroomB3 = sectionB.subrooms.find((s: any) => s.code === 'B3');
      const sarah = subroomB3.members.find((m: any) => m.name === 'Sarah Connor');
      expect(sarah).toBeDefined();
      expect(sarah.eventResponse).toBe('MAYBE');

      // Server David Chen has NOT_ATTENDING for Event B
      const david = sectionB.assignedServers.find((s: any) => s.name === 'David Chen');
      expect(david).toBeDefined();
      expect(david.eventResponse).toBe('NOT_ATTENDING');
    });

    it('GET /grid with a COMPLETED eventId returns selectedEvent: null (safely deactivates non-operational selection)', async () => {
      const res = await supertest(app.server)
        .get('/api/v1/operations/grid?eventId=event-completed-id')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.selectedEvent).toBeNull();
    });

    it('GET /grid with a CANCELLED eventId returns selectedEvent: null (safely deactivates non-operational selection)', async () => {
      const res = await supertest(app.server)
        .get('/api/v1/operations/grid?eventId=event-cancelled-id')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.selectedEvent).toBeNull();
    });

    it('GET /grid with non-existent eventId returns 404', async () => {
      const res = await supertest(app.server)
        .get('/api/v1/operations/grid?eventId=non-existent-event')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Not Found');
    });
  });
});
