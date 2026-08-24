import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import supertest from 'supertest';
import { buildApp } from '../src/app.js';
import { AccountStatus, UserRole } from '@prisma/client';

// ---------------------------------------------------------------------------
// In-memory mock data: two organizations to verify isolation
// ---------------------------------------------------------------------------
const mockUsers: any[] = [
  { id: 'super-admin-1', email: 'elena@org1.corp', name: 'Elena Vance', role: UserRole.SUPER_ADMIN, accountStatus: AccountStatus.ACTIVE, organizationId: 'org-1', avatarUrl: null },
  { id: 'admin-1', email: 'marcus@org1.corp', name: 'Marcus Sterling', role: UserRole.ADMIN, accountStatus: AccountStatus.ACTIVE, organizationId: 'org-1', avatarUrl: null },
  { id: 'member-1', email: 'alex@org1.corp', name: 'Alex Rivera', role: UserRole.MEMBER, accountStatus: AccountStatus.ACTIVE, organizationId: 'org-1', avatarUrl: null },
  { id: 'member-2', email: 'komal@org1.corp', name: 'Komal Mehta', role: UserRole.MEMBER, accountStatus: AccountStatus.ACTIVE, organizationId: 'org-1', avatarUrl: null },
  { id: 'server-1', email: 'preeti@org1.corp', name: 'Preeti Mishra', role: UserRole.SERVER, accountStatus: AccountStatus.ACTIVE, organizationId: 'org-1', avatarUrl: null },
  { id: 'teamlead-1', email: 'amit@org1.corp', name: 'Amit Shah', role: UserRole.TEAM_LEAD, accountStatus: AccountStatus.ACTIVE, organizationId: 'org-1', avatarUrl: null },
  { id: 'pending-1', email: 'pending@org1.corp', name: 'Pending Person', role: UserRole.MEMBER, accountStatus: AccountStatus.PENDING, organizationId: 'org-1', avatarUrl: null },
  { id: 'suspended-1', email: 'suspended@org1.corp', name: 'Suspended Person', role: UserRole.MEMBER, accountStatus: AccountStatus.SUSPENDED, organizationId: 'org-1', avatarUrl: null },

  // Organization 2 — must never see org-1 events
  { id: 'super-admin-2', email: 'nina@org2.corp', name: 'Nina Frost', role: UserRole.SUPER_ADMIN, accountStatus: AccountStatus.ACTIVE, organizationId: 'org-2', avatarUrl: null },
  { id: 'member-org2', email: 'raj@org2.corp', name: 'Raj Kumar', role: UserRole.MEMBER, accountStatus: AccountStatus.ACTIVE, organizationId: 'org-2', avatarUrl: null },
];

let mockEvents: any[] = [];
let mockResponses: any[] = [];
let eventIdCounter = 0;
let responseIdCounter = 0;

function resetMockData() {
  mockEvents = [];
  mockResponses = [];
  eventIdCounter = 0;
  responseIdCounter = 0;
}

function findUser(id: string) {
  return mockUsers.find((u) => u.id === id) || null;
}

function attachIncludes(event: any, include: any, extraWhere?: any) {
  const result: any = { ...event };
  if (include?.createdBy) {
    result.createdBy = event.createdById ? findUser(event.createdById) : null;
  }
  if (include?.responses) {
    const userIdFilter = include.responses.where?.userId;
    result.responses = mockResponses.filter(
      (r) => r.eventId === event.id && (userIdFilter === undefined || r.userId === userIdFilter)
    );
  }
  return result;
}

const { mockPrisma, publishedEvents } = vi.hoisted(() => ({
  mockPrisma: {} as any,
  publishedEvents: [] as any[],
}));

Object.assign(mockPrisma, {
  user: {
    findUnique: vi.fn().mockImplementation(async ({ where }: any) => {
      if (where?.id) return findUser(where.id);
      if (where?.email) return mockUsers.find((u) => u.email.toLowerCase() === where.email.toLowerCase()) || null;
      return null;
    }),
    findMany: vi.fn().mockImplementation(async ({ where }: any) => {
      let res = [...mockUsers];
      if (where?.organizationId) res = res.filter((u) => u.organizationId === where.organizationId);
      if (where?.accountStatus) res = res.filter((u) => u.accountStatus === where.accountStatus);
      return res;
    }),
  },
  organizationEvent: {
    findMany: vi.fn().mockImplementation(async ({ where, include, orderBy }: any) => {
      let res = mockEvents.filter((e) => !where?.organizationId || e.organizationId === where.organizationId);
      if (orderBy?.scheduledAt === 'asc') {
        res = [...res].sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
      }
      return res.map((e) => attachIncludes(e, include));
    }),
    findUnique: vi.fn().mockImplementation(async ({ where, include }: any) => {
      const event = mockEvents.find((e) => e.id === where.id);
      if (!event) return null;
      return include ? attachIncludes(event, include) : { ...event };
    }),
    create: vi.fn().mockImplementation(async ({ data, include }: any) => {
      const now = new Date();
      const event = {
        id: `org-evt-${++eventIdCounter}`,
        organizationId: data.organizationId,
        title: data.title,
        description: data.description,
        scheduledAt: data.scheduledAt,
        scheduledEndAt: data.scheduledEndAt,
        completedAt: null,
        status: 'UPCOMING',
        createdById: data.createdById ?? null,
        createdAt: now,
        updatedAt: now,
      };
      mockEvents.push(event);
      return attachIncludes(event, include);
    }),
    update: vi.fn().mockImplementation(async ({ where, data, include }: any) => {
      const idx = mockEvents.findIndex((e) => e.id === where.id);
      if (idx === -1) throw new Error('Event not found');
      const existing = mockEvents[idx];
      const updated = {
        ...existing,
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.scheduledAt !== undefined ? { scheduledAt: data.scheduledAt } : {}),
        ...(data.scheduledEndAt !== undefined ? { scheduledEndAt: data.scheduledEndAt } : {}),
        ...(data.completedAt !== undefined ? { completedAt: data.completedAt } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        updatedAt: new Date(),
      };
      mockEvents[idx] = updated;
      return attachIncludes(updated, include);
    }),
  },
  organizationEventResponse: {
    findUnique: vi.fn().mockImplementation(async ({ where }: any) => {
      const { eventId, userId } = where.eventId_userId;
      return mockResponses.find((r) => r.eventId === eventId && r.userId === userId) || null;
    }),
    findMany: vi.fn().mockImplementation(async ({ where }: any) => {
      let res = mockResponses.filter((r) => r.eventId === where.eventId);
      if (where.userId?.in) res = res.filter((r) => where.userId.in.includes(r.userId));
      return res;
    }),
    upsert: vi.fn().mockImplementation(async ({ where, create, update }: any) => {
      const { eventId, userId } = where.eventId_userId;
      const idx = mockResponses.findIndex((r) => r.eventId === eventId && r.userId === userId);
      if (idx === -1) {
        const record = { id: `resp-${++responseIdCounter}`, ...create };
        mockResponses.push(record);
        return record;
      }
      mockResponses[idx] = { ...mockResponses[idx], ...update };
      return mockResponses[idx];
    }),
  },
});

vi.mock('../src/db/client.js', () => ({
  prisma: mockPrisma,
  checkDatabaseHealth: vi.fn().mockResolvedValue({ status: 'healthy', latencyMs: 1 }),
}));

vi.mock('../src/events/domain-events.js', () => ({
  publishDomainEvent: vi.fn().mockImplementation((event: any) => {
    const full = { id: `evt_${publishedEvents.length}`, timestamp: new Date().toISOString(), ...event };
    publishedEvents.push(full);
    return full;
  }),
  domainEventBus: {
    publishDomainEvent: vi.fn(),
    subscribeOrganization: vi.fn(() => () => undefined),
    subscribeAll: vi.fn(() => () => undefined),
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    setMaxListeners: vi.fn(),
  },
}));

describe('Organization Events — API, authorization, analytics & realtime events', () => {
  let app: FastifyInstance;
  const tokens: Record<string, string> = {};

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    for (const u of mockUsers) {
      tokens[u.id] = app.jwt.sign({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        accountStatus: u.accountStatus,
        organizationId: u.organizationId,
      });
    }
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    resetMockData();
    publishedEvents.length = 0;
  });

  function futureDateParts(hoursFromNow: number) {
    const d = new Date(Date.now() + hoursFromNow * 3600000);
    const dateStr = d.toISOString().split('T')[0];
    // Fixed, safe time-of-day — keeps this independent of when the suite runs
    // and avoids any midnight-rollover edge case with the endTime below.
    return { date: dateStr, time: '10:00' };
  }

  const validPayload = () => ({
    title: 'Company Town Hall',
    description: 'Quarterly all-hands sync for every section.',
    ...futureDateParts(48),
    endTime: '11:00',
  });

  /** Directly rewrites an already-created mock event's start/end window in real JS Date terms, bypassing the IST string round-trip for precise LIVE/AWAITING_COMPLETION boundary tests. */
  function setEventWindow(eventId: string, startOffsetMs: number, endOffsetMs: number) {
    const idx = mockEvents.findIndex((e) => e.id === eventId);
    expect(idx).toBeGreaterThanOrEqual(0);
    mockEvents[idx].scheduledAt = new Date(Date.now() + startOffsetMs);
    mockEvents[idx].scheduledEndAt = new Date(Date.now() + endOffsetMs);
  }

  // ---------------------------------------------------------------------------
  // 1. Creation authorization
  // ---------------------------------------------------------------------------
  describe('Event creation authorization', () => {
    it('ADMIN can create an event (201)', async () => {
      const res = await supertest(app.server)
        .post('/api/v1/events')
        .set('Authorization', `Bearer ${tokens['admin-1']}`)
        .send(validPayload());

      expect(res.status).toBe(201);
      expect(res.body.title).toBe('Company Town Hall');
      expect(res.body.status).toBe('UPCOMING');
      expect(res.body.organizationId).toBe('org-1');
    });

    it('SUPER_ADMIN can create an event (201)', async () => {
      const res = await supertest(app.server)
        .post('/api/v1/events')
        .set('Authorization', `Bearer ${tokens['super-admin-1']}`)
        .send(validPayload());

      expect(res.status).toBe(201);
      expect(res.body.createdByName).toBe('Elena Vance');
    });

    it('MEMBER cannot create an event (403)', async () => {
      const res = await supertest(app.server)
        .post('/api/v1/events')
        .set('Authorization', `Bearer ${tokens['member-1']}`)
        .send(validPayload());

      expect(res.status).toBe(403);
    });

    it('SERVER and TEAM_LEAD cannot create an event (403)', async () => {
      const resServer = await supertest(app.server)
        .post('/api/v1/events')
        .set('Authorization', `Bearer ${tokens['server-1']}`)
        .send(validPayload());
      const resLead = await supertest(app.server)
        .post('/api/v1/events')
        .set('Authorization', `Bearer ${tokens['teamlead-1']}`)
        .send(validPayload());

      expect(resServer.status).toBe(403);
      expect(resLead.status).toBe(403);
    });

    it('rejects invalid payloads with 400', async () => {
      const res = await supertest(app.server)
        .post('/api/v1/events')
        .set('Authorization', `Bearer ${tokens['admin-1']}`)
        .send({ title: 'x', description: '', date: 'not-a-date', time: '99:99' });

      expect(res.status).toBe(400);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Organization isolation
  // ---------------------------------------------------------------------------
  describe('Organization isolation', () => {
    it('a user from another organization never sees the event in the list or by id', async () => {
      const created = await supertest(app.server)
        .post('/api/v1/events')
        .set('Authorization', `Bearer ${tokens['admin-1']}`)
        .send(validPayload());
      const eventId = created.body.id;

      const listOtherOrg = await supertest(app.server)
        .get('/api/v1/events')
        .set('Authorization', `Bearer ${tokens['member-org2']}`);
      expect(listOtherOrg.status).toBe(200);
      expect(listOtherOrg.body.find((e: any) => e.id === eventId)).toBeUndefined();

      const detailOtherOrg = await supertest(app.server)
        .get(`/api/v1/events/${eventId}`)
        .set('Authorization', `Bearer ${tokens['super-admin-2']}`);
      expect(detailOtherOrg.status).toBe(404);

      const analyticsOtherOrg = await supertest(app.server)
        .get(`/api/v1/events/${eventId}/analytics`)
        .set('Authorization', `Bearer ${tokens['super-admin-2']}`);
      expect(analyticsOtherOrg.status).toBe(404);
    });

    it('own-organization users see the event', async () => {
      const created = await supertest(app.server)
        .post('/api/v1/events')
        .set('Authorization', `Bearer ${tokens['admin-1']}`)
        .send(validPayload());

      const list = await supertest(app.server)
        .get('/api/v1/events')
        .set('Authorization', `Bearer ${tokens['member-1']}`);
      expect(list.body.some((e: any) => e.id === created.body.id)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Retrieval, editing, cancellation
  // ---------------------------------------------------------------------------
  describe('Event retrieval, editing & cancellation', () => {
    async function createEvent() {
      const res = await supertest(app.server)
        .post('/api/v1/events')
        .set('Authorization', `Bearer ${tokens['admin-1']}`)
        .send(validPayload());
      return res.body;
    }

    it('GET /:id returns full event detail with the current user response', async () => {
      const event = await createEvent();
      const res = await supertest(app.server)
        .get(`/api/v1/events/${event.id}`)
        .set('Authorization', `Bearer ${tokens['member-1']}`);

      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Company Town Hall');
      expect(res.body.currentUserResponse).toBeNull();
    });

    it('PATCH /:id updates the event and emits ORG_EVENT_UPDATED', async () => {
      const event = await createEvent();
      const res = await supertest(app.server)
        .patch(`/api/v1/events/${event.id}`)
        .set('Authorization', `Bearer ${tokens['admin-1']}`)
        .send({ title: 'Updated Town Hall Title' });

      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Updated Town Hall Title');
      expect(publishedEvents.some((e) => e.type === 'ORG_EVENT_UPDATED' && e.entityId === event.id)).toBe(true);
    });

    it('MEMBER cannot edit or cancel an event (403)', async () => {
      const event = await createEvent();
      const editRes = await supertest(app.server)
        .patch(`/api/v1/events/${event.id}`)
        .set('Authorization', `Bearer ${tokens['member-1']}`)
        .send({ title: 'Hijacked' });
      const cancelRes = await supertest(app.server)
        .post(`/api/v1/events/${event.id}/cancel`)
        .set('Authorization', `Bearer ${tokens['member-1']}`);

      expect(editRes.status).toBe(403);
      expect(cancelRes.status).toBe(403);
    });

    it('POST /:id/cancel sets status to CANCELLED, preserves the record, and emits ORG_EVENT_CANCELLED', async () => {
      const event = await createEvent();
      // Give it at least one response before cancelling, to prove responses are preserved
      await supertest(app.server)
        .put(`/api/v1/events/${event.id}/response`)
        .set('Authorization', `Bearer ${tokens['member-1']}`)
        .send({ response: 'ATTENDING' });

      const res = await supertest(app.server)
        .post(`/api/v1/events/${event.id}/cancel`)
        .set('Authorization', `Bearer ${tokens['super-admin-1']}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('CANCELLED');
      expect(publishedEvents.some((e) => e.type === 'ORG_EVENT_CANCELLED' && e.entityId === event.id)).toBe(true);

      // Record + historical response still exist
      expect(mockEvents.find((e) => e.id === event.id)).toBeDefined();
      expect(mockResponses.find((r) => r.eventId === event.id && r.userId === 'member-1')).toBeDefined();

      const analytics = await supertest(app.server)
        .get(`/api/v1/events/${event.id}/analytics`)
        .set('Authorization', `Bearer ${tokens['super-admin-1']}`);
      expect(analytics.body.attending).toBe(1);
    });

    it('cannot respond to a cancelled event (400)', async () => {
      const event = await createEvent();
      await supertest(app.server)
        .post(`/api/v1/events/${event.id}/cancel`)
        .set('Authorization', `Bearer ${tokens['admin-1']}`);

      const res = await supertest(app.server)
        .put(`/api/v1/events/${event.id}/response`)
        .set('Authorization', `Bearer ${tokens['member-1']}`)
        .send({ response: 'ATTENDING' });

      expect(res.status).toBe(400);
    });

    it('a completed event cannot be edited or cancelled', async () => {
      // Time passing alone can only ever bring an event to AWAITING_COMPLETION —
      // it must be explicitly marked done to become COMPLETED.
      const created = await createEvent();
      setEventWindow(created.id, -3 * 3600000, -2 * 3600000);
      const completed = await supertest(app.server)
        .post(`/api/v1/events/${created.id}/complete`)
        .set('Authorization', `Bearer ${tokens['admin-1']}`);
      expect(completed.body.status).toBe('COMPLETED');

      const editRes = await supertest(app.server)
        .patch(`/api/v1/events/${created.id}`)
        .set('Authorization', `Bearer ${tokens['admin-1']}`)
        .send({ title: 'Rewriting history' });
      const cancelRes = await supertest(app.server)
        .post(`/api/v1/events/${created.id}/cancel`)
        .set('Authorization', `Bearer ${tokens['admin-1']}`);

      expect(editRes.status).toBe(400);
      expect(cancelRes.status).toBe(400);
    });
  });

  // ---------------------------------------------------------------------------
  // 3b. Explicit completion & AWAITING_COMPLETION
  // ---------------------------------------------------------------------------
  describe('Event completion & AWAITING_COMPLETION', () => {
    async function createEvent() {
      const res = await supertest(app.server)
        .post('/api/v1/events')
        .set('Authorization', `Bearer ${tokens['admin-1']}`)
        .send(validPayload());
      return res.body;
    }

    it('status derivation: before the start time, status is UPCOMING', async () => {
      const event = await createEvent();
      setEventWindow(event.id, 2 * 3600000, 3 * 3600000);
      const res = await supertest(app.server).get(`/api/v1/events/${event.id}`).set('Authorization', `Bearer ${tokens['member-1']}`);
      expect(res.body.status).toBe('UPCOMING');
    });

    it('status derivation: between start and end, status is LIVE', async () => {
      const event = await createEvent();
      setEventWindow(event.id, -5 * 60000, 30 * 60000);
      const res = await supertest(app.server).get(`/api/v1/events/${event.id}`).set('Authorization', `Bearer ${tokens['member-1']}`);
      expect(res.body.status).toBe('LIVE');
    });

    it('status derivation: after the end time passes, status is AWAITING_COMPLETION, never auto-COMPLETED', async () => {
      const event = await createEvent();
      setEventWindow(event.id, -3 * 3600000, -2 * 3600000);
      const res = await supertest(app.server).get(`/api/v1/events/${event.id}`).set('Authorization', `Bearer ${tokens['member-1']}`);
      expect(res.body.status).toBe('AWAITING_COMPLETION');
    });

    it('an event does not automatically become COMPLETED no matter how long past its end time', async () => {
      const event = await createEvent();
      setEventWindow(event.id, -30 * 24 * 3600000, -29 * 24 * 3600000); // ended a month ago
      const res = await supertest(app.server).get(`/api/v1/events/${event.id}`).set('Authorization', `Bearer ${tokens['member-1']}`);
      expect(res.body.status).toBe('AWAITING_COMPLETION');
      expect(res.body.status).not.toBe('COMPLETED');
    });

    it('ADMIN can mark an event as done', async () => {
      const event = await createEvent();
      setEventWindow(event.id, -2 * 3600000, -1 * 3600000);
      const res = await supertest(app.server)
        .post(`/api/v1/events/${event.id}/complete`)
        .set('Authorization', `Bearer ${tokens['admin-1']}`);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('COMPLETED');
      expect(res.body.completedAt).toBeDefined();
      expect(res.body.completedAt).not.toBeNull();
    });

    it('SUPER_ADMIN can mark an event as done', async () => {
      const event = await createEvent();
      setEventWindow(event.id, -2 * 3600000, -1 * 3600000);
      const res = await supertest(app.server)
        .post(`/api/v1/events/${event.id}/complete`)
        .set('Authorization', `Bearer ${tokens['super-admin-1']}`);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('COMPLETED');
    });

    it('MEMBER, SERVER, and TEAM_LEAD cannot mark an event as done (403)', async () => {
      const event = await createEvent();
      setEventWindow(event.id, -2 * 3600000, -1 * 3600000);
      for (const userId of ['member-1', 'server-1', 'teamlead-1']) {
        const res = await supertest(app.server)
          .post(`/api/v1/events/${event.id}/complete`)
          .set('Authorization', `Bearer ${tokens[userId]}`);
        expect(res.status).toBe(403);
      }
    });

    it('an event can also be marked done while still LIVE (before its scheduled end time)', async () => {
      const event = await createEvent();
      setEventWindow(event.id, -5 * 60000, 30 * 60000);
      const res = await supertest(app.server)
        .post(`/api/v1/events/${event.id}/complete`)
        .set('Authorization', `Bearer ${tokens['admin-1']}`);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('COMPLETED');
    });

    it('a completed event cannot be completed twice (400)', async () => {
      const event = await createEvent();
      setEventWindow(event.id, -2 * 3600000, -1 * 3600000);
      await supertest(app.server).post(`/api/v1/events/${event.id}/complete`).set('Authorization', `Bearer ${tokens['admin-1']}`);
      const res = await supertest(app.server)
        .post(`/api/v1/events/${event.id}/complete`)
        .set('Authorization', `Bearer ${tokens['admin-1']}`);
      expect(res.status).toBe(400);
    });

    it('a cancelled event cannot be marked as done (400)', async () => {
      const event = await createEvent();
      await supertest(app.server).post(`/api/v1/events/${event.id}/cancel`).set('Authorization', `Bearer ${tokens['admin-1']}`);
      const res = await supertest(app.server)
        .post(`/api/v1/events/${event.id}/complete`)
        .set('Authorization', `Bearer ${tokens['admin-1']}`);
      expect(res.status).toBe(400);
    });

    it('publishes ORG_EVENT_COMPLETED with the eventId and organizationId', async () => {
      const event = await createEvent();
      setEventWindow(event.id, -2 * 3600000, -1 * 3600000);
      publishedEvents.length = 0;

      await supertest(app.server).post(`/api/v1/events/${event.id}/complete`).set('Authorization', `Bearer ${tokens['admin-1']}`);

      const completedEvent = publishedEvents.find((e) => e.type === 'ORG_EVENT_COMPLETED');
      expect(completedEvent).toBeDefined();
      expect(completedEvent.payload.eventId).toBe(event.id);
      expect(completedEvent.payload.organizationId).toBe('org-1');
    });

    it('a user from another organization cannot mark the event as done (404)', async () => {
      const event = await createEvent();
      setEventWindow(event.id, -2 * 3600000, -1 * 3600000);
      const res = await supertest(app.server)
        .post(`/api/v1/events/${event.id}/complete`)
        .set('Authorization', `Bearer ${tokens['super-admin-2']}`);
      expect(res.status).toBe(404);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Responses
  // ---------------------------------------------------------------------------
  describe('Event responses', () => {
    async function createEvent() {
      const res = await supertest(app.server)
        .post('/api/v1/events')
        .set('Authorization', `Bearer ${tokens['admin-1']}`)
        .send(validPayload());
      return res.body;
    }

    it('ATTENDING response persists and reflects in GET /:id', async () => {
      const event = await createEvent();
      const res = await supertest(app.server)
        .put(`/api/v1/events/${event.id}/response`)
        .set('Authorization', `Bearer ${tokens['member-1']}`)
        .send({ response: 'ATTENDING' });
      expect(res.status).toBe(200);
      expect(res.body.response).toBe('ATTENDING');

      const detail = await supertest(app.server)
        .get(`/api/v1/events/${event.id}`)
        .set('Authorization', `Bearer ${tokens['member-1']}`);
      expect(detail.body.currentUserResponse).toBe('ATTENDING');
    });

    it('MAYBE response persists', async () => {
      const event = await createEvent();
      const res = await supertest(app.server)
        .put(`/api/v1/events/${event.id}/response`)
        .set('Authorization', `Bearer ${tokens['member-1']}`)
        .send({ response: 'MAYBE' });
      expect(res.body.response).toBe('MAYBE');
    });

    it('NOT_ATTENDING response persists', async () => {
      const event = await createEvent();
      const res = await supertest(app.server)
        .put(`/api/v1/events/${event.id}/response`)
        .set('Authorization', `Bearer ${tokens['member-1']}`)
        .send({ response: 'NOT_ATTENDING' });
      expect(res.body.response).toBe('NOT_ATTENDING');
    });

    it('changing a response updates the stored value and reports the previous response in the domain event', async () => {
      const event = await createEvent();
      await supertest(app.server)
        .put(`/api/v1/events/${event.id}/response`)
        .set('Authorization', `Bearer ${tokens['member-1']}`)
        .send({ response: 'ATTENDING' });

      publishedEvents.length = 0;

      const res = await supertest(app.server)
        .put(`/api/v1/events/${event.id}/response`)
        .set('Authorization', `Bearer ${tokens['member-1']}`)
        .send({ response: 'MAYBE' });

      expect(res.status).toBe(200);
      expect(res.body.response).toBe('MAYBE');

      const changeEvent = publishedEvents.find((e) => e.type === 'ORG_EVENT_RESPONSE_CHANGED');
      expect(changeEvent).toBeDefined();
      expect(changeEvent.payload.previousResponse).toBe('ATTENDING');
      expect(changeEvent.payload.response).toBe('MAYBE');
      expect(changeEvent.payload.userId).toBe('member-1');
      expect(changeEvent.payload.organizationId).toBe('org-1');
    });

    it('duplicate responses do not create duplicate records (unique per user+event)', async () => {
      const event = await createEvent();
      await supertest(app.server)
        .put(`/api/v1/events/${event.id}/response`)
        .set('Authorization', `Bearer ${tokens['member-1']}`)
        .send({ response: 'ATTENDING' });
      await supertest(app.server)
        .put(`/api/v1/events/${event.id}/response`)
        .set('Authorization', `Bearer ${tokens['member-1']}`)
        .send({ response: 'NOT_ATTENDING' });

      const recordsForUser = mockResponses.filter((r) => r.eventId === event.id && r.userId === 'member-1');
      expect(recordsForUser).toHaveLength(1);
      expect(recordsForUser[0].response).toBe('NOT_ATTENDING');
    });

    it('a response can be changed in any direction — ATTENDING -> MAYBE -> NOT_ATTENDING -> ATTENDING — while the event is open', async () => {
      const event = await createEvent();
      const sequence: Array<'ATTENDING' | 'MAYBE' | 'NOT_ATTENDING' | 'ATTENDING'> = [
        'ATTENDING',
        'MAYBE',
        'NOT_ATTENDING',
        'ATTENDING',
      ];
      for (const response of sequence) {
        const res = await supertest(app.server)
          .put(`/api/v1/events/${event.id}/response`)
          .set('Authorization', `Bearer ${tokens['member-1']}`)
          .send({ response });
        expect(res.status).toBe(200);
        expect(res.body.response).toBe(response);
      }
    });

    it('cannot respond to a completed event (400), and the final response is preserved', async () => {
      const event = await createEvent();
      await supertest(app.server)
        .put(`/api/v1/events/${event.id}/response`)
        .set('Authorization', `Bearer ${tokens['member-1']}`)
        .send({ response: 'ATTENDING' });

      setEventWindow(event.id, -2 * 3600000, -1 * 3600000);
      await supertest(app.server).post(`/api/v1/events/${event.id}/complete`).set('Authorization', `Bearer ${tokens['admin-1']}`);

      const res = await supertest(app.server)
        .put(`/api/v1/events/${event.id}/response`)
        .set('Authorization', `Bearer ${tokens['member-1']}`)
        .send({ response: 'NOT_ATTENDING' });
      expect(res.status).toBe(400);

      const detail = await supertest(app.server).get(`/api/v1/events/${event.id}`).set('Authorization', `Bearer ${tokens['member-1']}`);
      expect(detail.body.currentUserResponse).toBe('ATTENDING');
    });

    it('analytics remain correct after the event is completed', async () => {
      const event = await createEvent();
      await supertest(app.server).put(`/api/v1/events/${event.id}/response`).set('Authorization', `Bearer ${tokens['member-1']}`).send({ response: 'ATTENDING' });
      await supertest(app.server).put(`/api/v1/events/${event.id}/response`).set('Authorization', `Bearer ${tokens['member-2']}`).send({ response: 'MAYBE' });

      setEventWindow(event.id, -2 * 3600000, -1 * 3600000);
      await supertest(app.server).post(`/api/v1/events/${event.id}/complete`).set('Authorization', `Bearer ${tokens['admin-1']}`);

      const analytics = await supertest(app.server)
        .get(`/api/v1/events/${event.id}/analytics`)
        .set('Authorization', `Bearer ${tokens['admin-1']}`);
      expect(analytics.body.attending).toBe(1);
      expect(analytics.body.maybe).toBe(1);
    });

    it('SUPER_ADMIN and ADMIN are forbidden (403) from submitting event attendance responses', async () => {
      const event = await createEvent();
      const superAdminRes = await supertest(app.server)
        .put(`/api/v1/events/${event.id}/response`)
        .set('Authorization', `Bearer ${tokens['super-admin-1']}`)
        .send({ response: 'ATTENDING' });
      expect(superAdminRes.status).toBe(403);

      const adminRes = await supertest(app.server)
        .put(`/api/v1/events/${event.id}/response`)
        .set('Authorization', `Bearer ${tokens['admin-1']}`)
        .send({ response: 'ATTENDING' });
      expect(adminRes.status).toBe(403);
    });

    it('SERVER and TEAM_LEAD participant roles can submit event attendance responses', async () => {
      const event = await createEvent();
      const serverRes = await supertest(app.server)
        .put(`/api/v1/events/${event.id}/response`)
        .set('Authorization', `Bearer ${tokens['server-1']}`)
        .send({ response: 'ATTENDING' });
      expect(serverRes.status).toBe(200);
      expect(serverRes.body.response).toBe('ATTENDING');

      const teamLeadRes = await supertest(app.server)
        .put(`/api/v1/events/${event.id}/response`)
        .set('Authorization', `Bearer ${tokens['teamlead-1']}`)
        .send({ response: 'MAYBE' });
      expect(teamLeadRes.status).toBe(200);
      expect(teamLeadRes.body.response).toBe('MAYBE');
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Analytics
  // ---------------------------------------------------------------------------
  describe('Event analytics & eligible-user calculation', () => {
    async function createEvent() {
      const res = await supertest(app.server)
        .post('/api/v1/events')
        .set('Authorization', `Bearer ${tokens['admin-1']}`)
        .send(validPayload());
      return res.body;
    }

    it('no-response calculation: analytics show 0 responses and full no-response count when nobody has responded', async () => {
      const event = await createEvent();
      const res = await supertest(app.server)
        .get(`/api/v1/events/${event.id}/analytics`)
        .set('Authorization', `Bearer ${tokens['admin-1']}`);

      expect(res.status).toBe(200);
      expect(res.body.attending).toBe(0);
      expect(res.body.maybe).toBe(0);
      expect(res.body.notAttending).toBe(0);
      expect(res.body.attendanceRate).toBe(0);
      // ACTIVE users in org-1: super-admin-1, admin-1, member-1, member-2, server-1, teamlead-1 = 6
      expect(res.body.totalEligible).toBe(6);
      expect(res.body.noResponse).toBe(6);
    });

    it('calculates attending/maybe/notAttending/noResponse and attendance rate from live responses', async () => {
      const event = await createEvent();

      await supertest(app.server).put(`/api/v1/events/${event.id}/response`).set('Authorization', `Bearer ${tokens['member-1']}`).send({ response: 'ATTENDING' });
      await supertest(app.server).put(`/api/v1/events/${event.id}/response`).set('Authorization', `Bearer ${tokens['member-2']}`).send({ response: 'ATTENDING' });
      await supertest(app.server).put(`/api/v1/events/${event.id}/response`).set('Authorization', `Bearer ${tokens['server-1']}`).send({ response: 'MAYBE' });
      await supertest(app.server).put(`/api/v1/events/${event.id}/response`).set('Authorization', `Bearer ${tokens['teamlead-1']}`).send({ response: 'NOT_ATTENDING' });

      const res = await supertest(app.server)
        .get(`/api/v1/events/${event.id}/analytics`)
        .set('Authorization', `Bearer ${tokens['admin-1']}`);

      expect(res.body.totalEligible).toBe(6);
      expect(res.body.attending).toBe(2);
      expect(res.body.maybe).toBe(1);
      expect(res.body.notAttending).toBe(1);
      expect(res.body.noResponse).toBe(2); // super-admin-1, admin-1
      expect(res.body.attendanceRate).toBe(Math.round((2 / 6) * 100));
    });

    it('eligible-user calculation excludes other organizations, PENDING and SUSPENDED accounts', async () => {
      const event = await createEvent();
      const res = await supertest(app.server)
        .get(`/api/v1/events/${event.id}/analytics`)
        .set('Authorization', `Bearer ${tokens['admin-1']}`);

      // org-1 has 8 total users but only 6 are ACTIVE (pending-1 and suspended-1 excluded);
      // org-2 users must never be counted.
      expect(res.body.totalEligible).toBe(6);
    });

    it('attendance updates live as responses change (ATTENDING -> MAYBE -> NOT_ATTENDING)', async () => {
      const event = await createEvent();

      await supertest(app.server).put(`/api/v1/events/${event.id}/response`).set('Authorization', `Bearer ${tokens['member-1']}`).send({ response: 'ATTENDING' });
      let analytics = await supertest(app.server).get(`/api/v1/events/${event.id}/analytics`).set('Authorization', `Bearer ${tokens['admin-1']}`);
      expect(analytics.body.attending).toBe(1);
      expect(analytics.body.maybe).toBe(0);

      await supertest(app.server).put(`/api/v1/events/${event.id}/response`).set('Authorization', `Bearer ${tokens['member-1']}`).send({ response: 'MAYBE' });
      analytics = await supertest(app.server).get(`/api/v1/events/${event.id}/analytics`).set('Authorization', `Bearer ${tokens['admin-1']}`);
      expect(analytics.body.attending).toBe(0);
      expect(analytics.body.maybe).toBe(1);

      await supertest(app.server).put(`/api/v1/events/${event.id}/response`).set('Authorization', `Bearer ${tokens['member-1']}`).send({ response: 'NOT_ATTENDING' });
      analytics = await supertest(app.server).get(`/api/v1/events/${event.id}/analytics`).set('Authorization', `Bearer ${tokens['admin-1']}`);
      expect(analytics.body.maybe).toBe(0);
      expect(analytics.body.notAttending).toBe(1);
    });

    it('response breakdown lists organization-scoped users under the correct bucket', async () => {
      const event = await createEvent();
      await supertest(app.server).put(`/api/v1/events/${event.id}/response`).set('Authorization', `Bearer ${tokens['member-1']}`).send({ response: 'ATTENDING' });

      const res = await supertest(app.server)
        .get(`/api/v1/events/${event.id}/responses`)
        .set('Authorization', `Bearer ${tokens['admin-1']}`);

      expect(res.status).toBe(200);
      expect(res.body.ATTENDING.map((u: any) => u.id)).toContain('member-1');
      expect(res.body.NO_RESPONSE.map((u: any) => u.id)).toContain('admin-1');
      // Never expose org-2 users
      const allListed = [...res.body.ATTENDING, ...res.body.MAYBE, ...res.body.NOT_ATTENDING, ...res.body.NO_RESPONSE];
      expect(allListed.some((u: any) => u.id === 'member-org2')).toBe(false);
    });

    it('MEMBER cannot view analytics or response breakdown (403)', async () => {
      const event = await createEvent();
      const analyticsRes = await supertest(app.server)
        .get(`/api/v1/events/${event.id}/analytics`)
        .set('Authorization', `Bearer ${tokens['member-1']}`);
      const responsesRes = await supertest(app.server)
        .get(`/api/v1/events/${event.id}/responses`)
        .set('Authorization', `Bearer ${tokens['member-1']}`);

      expect(analyticsRes.status).toBe(403);
      expect(responsesRes.status).toBe(403);
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Socket.IO domain events
  // ---------------------------------------------------------------------------
  describe('Socket.IO domain event propagation', () => {
    it('publishes ORG_EVENT_CREATED with eventId + organizationId after creation', async () => {
      const res = await supertest(app.server)
        .post('/api/v1/events')
        .set('Authorization', `Bearer ${tokens['admin-1']}`)
        .send(validPayload());

      const created = publishedEvents.find((e) => e.type === 'ORG_EVENT_CREATED');
      expect(created).toBeDefined();
      expect(created.organizationId).toBe('org-1');
      expect(created.payload.eventId).toBe(res.body.id);
      expect(created.payload.organizationId).toBe('org-1');
    });

    it('publishes ORG_EVENT_UPDATED after an edit', async () => {
      const created = await supertest(app.server)
        .post('/api/v1/events')
        .set('Authorization', `Bearer ${tokens['admin-1']}`)
        .send(validPayload());
      publishedEvents.length = 0;

      await supertest(app.server)
        .patch(`/api/v1/events/${created.body.id}`)
        .set('Authorization', `Bearer ${tokens['admin-1']}`)
        .send({ description: 'Updated description' });

      const updated = publishedEvents.find((e) => e.type === 'ORG_EVENT_UPDATED');
      expect(updated).toBeDefined();
      expect(updated.payload.eventId).toBe(created.body.id);
    });

    it('publishes ORG_EVENT_CANCELLED after cancellation', async () => {
      const created = await supertest(app.server)
        .post('/api/v1/events')
        .set('Authorization', `Bearer ${tokens['admin-1']}`)
        .send(validPayload());
      publishedEvents.length = 0;

      await supertest(app.server)
        .post(`/api/v1/events/${created.body.id}/cancel`)
        .set('Authorization', `Bearer ${tokens['admin-1']}`);

      const cancelled = publishedEvents.find((e) => e.type === 'ORG_EVENT_CANCELLED');
      expect(cancelled).toBeDefined();
      expect(cancelled.payload.eventId).toBe(created.body.id);
    });

    it('publishes ORG_EVENT_RESPONSE_CHANGED with full payload after a response', async () => {
      const created = await supertest(app.server)
        .post('/api/v1/events')
        .set('Authorization', `Bearer ${tokens['admin-1']}`)
        .send(validPayload());
      publishedEvents.length = 0;

      await supertest(app.server)
        .put(`/api/v1/events/${created.body.id}/response`)
        .set('Authorization', `Bearer ${tokens['member-1']}`)
        .send({ response: 'ATTENDING' });

      const changed = publishedEvents.find((e) => e.type === 'ORG_EVENT_RESPONSE_CHANGED');
      expect(changed).toBeDefined();
      expect(changed.payload).toMatchObject({
        eventId: created.body.id,
        organizationId: 'org-1',
        userId: 'member-1',
        response: 'ATTENDING',
        previousResponse: null,
      });
      expect(changed.payload.respondedAt).toBeDefined();
    });
  });
});
