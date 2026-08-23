import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import supertest from 'supertest';
import { UserRole, UserStatus } from '@prisma/client';
import { buildApp } from '../src/app.js';
import { domainEventBus, DomainEvent } from '../src/events/domain-events.js';

/**
 * Mutable presence/status for the real accounts under test, so a single mock
 * can model check-in, check-out and availability changes across cases.
 */
const userState: Record<string, { presenceState: 'IN' | 'OUT'; status: UserStatus }> = {
  'usr-sarah': { presenceState: 'IN', status: UserStatus.ONLINE },
  'usr-outside': { presenceState: 'OUT', status: UserStatus.OFFLINE },
  'usr-other-room': { presenceState: 'IN', status: UserStatus.ONLINE },
};

const updateCalls: Array<{ id: string; data: Record<string, unknown> }> = [];

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    task: {
      count: vi.fn().mockResolvedValue(0),
    },
    room: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

vi.mock('../src/db/client.js', () => ({
  prisma: mockPrisma,
  checkDatabaseHealth: vi.fn().mockResolvedValue({ status: 'healthy', latencyMs: 1 }),
}));

const USERS: Record<string, Record<string, unknown>> = {
  'usr-sarah': {
    id: 'usr-sarah',
    name: 'Sarah Connor',
    email: 'sarah.connor@workgrid.corp',
    role: 'MEMBER',
    organizationId: 'org-1',
    roomId: 'room-b-id',
    subroomId: 'subroom-b3-id',
    currentLocationName: 'B3',
    room: { id: 'room-b-id', letter: 'B', name: 'Sector B' },
    subroom: { id: 'subroom-b3-id', code: 'B3' },
  },
  'usr-outside': {
    id: 'usr-outside',
    name: 'Liam Vance',
    email: 'liam.vance@workgrid.corp',
    role: 'MEMBER',
    organizationId: 'org-1',
    roomId: 'room-b-id',
    subroomId: 'subroom-b4-id',
    currentLocationName: 'Outside',
    room: { id: 'room-b-id', letter: 'B', name: 'Sector B' },
    subroom: { id: 'subroom-b4-id', code: 'B4' },
  },
  'usr-other-room': {
    id: 'usr-other-room',
    name: 'External Person',
    email: 'ext@workgrid.corp',
    role: 'MEMBER',
    organizationId: 'org-1',
    roomId: 'room-a-id',
    subroomId: 'subroom-a1-id',
    currentLocationName: 'A1',
    room: { id: 'room-a-id', letter: 'A', name: 'Sector A' },
    subroom: { id: 'subroom-a1-id', code: 'A1' },
  },
  'server-david-id': {
    id: 'server-david-id',
    name: 'David Chen',
    email: 'david.chen@workgrid.corp',
    role: 'SERVER',
    organizationId: 'org-1',
    roomId: 'room-b-id',
    presenceState: 'IN',
    status: UserStatus.ONLINE,
    room: { id: 'room-b-id', letter: 'B', name: 'Sector B' },
  },
};

describe('Availability status endpoint (/api/v1/availability/status)', () => {
  let app: FastifyInstance;
  let memberToken: string;
  let adminToken: string;
  let serverToken: string;
  let outsideToken: string;
  let capturedEvents: DomainEvent[] = [];
  let unsubscribe: () => void;

  beforeAll(async () => {
    mockPrisma.user.findUnique.mockImplementation(({ where }: { where: { id: string } }) => {
      const base = USERS[where.id];
      if (!base) return Promise.resolve(null);
      const live = userState[where.id];
      return Promise.resolve(live ? { ...base, ...live } : base);
    });

    mockPrisma.user.update.mockImplementation(({ where, data }: { where: { id: string }; data: any }) => {
      updateCalls.push({ id: where.id, data });
      if (userState[where.id] && data.status) {
        userState[where.id].status = data.status;
      }
      const base = USERS[where.id] || {};
      return Promise.resolve({ ...base, ...(userState[where.id] || {}), ...data });
    });

    app = await buildApp();
    await app.ready();

    memberToken = app.jwt.sign({
      id: 'usr-sarah',
      email: 'sarah.connor@workgrid.corp',
      name: 'Sarah Connor',
      role: UserRole.MEMBER,
      organizationId: 'org-1',
    });

    adminToken = app.jwt.sign({
      id: 'admin-1-id',
      email: 'admin@workgrid.corp',
      name: 'Marcus Sterling',
      role: UserRole.ADMIN,
      organizationId: 'org-1',
    });

    serverToken = app.jwt.sign({
      id: 'server-david-id',
      email: 'david.chen@workgrid.corp',
      name: 'David Chen',
      role: UserRole.SERVER,
      roomId: 'room-b-id',
      organizationId: 'org-1',
    });

    outsideToken = app.jwt.sign({
      id: 'usr-outside',
      email: 'liam.vance@workgrid.corp',
      name: 'Liam Vance',
      role: UserRole.MEMBER,
      organizationId: 'org-1',
    });
  });

  afterAll(async () => {
    unsubscribe?.();
    await app.close();
  });

  beforeEach(() => {
    userState['usr-sarah'] = { presenceState: 'IN', status: UserStatus.ONLINE };
    userState['usr-outside'] = { presenceState: 'OUT', status: UserStatus.OFFLINE };
    userState['usr-other-room'] = { presenceState: 'IN', status: UserStatus.ONLINE };
    updateCalls.length = 0;

    unsubscribe?.();
    capturedEvents = [];
    unsubscribe = domainEventBus.subscribeAll((event) => capturedEvents.push(event));
  });

  // --- Real accounts -------------------------------------------------------

  it('1. lets an authenticated user move their own availability FREE → BUSY', async () => {
    const res = await supertest(app.server)
      .post('/api/v1/availability/status')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ state: 'BUSY' });

    expect(res.status).toBe(200);
    expect(res.body.availabilityState).toBe('BUSY');
    expect(res.body.availabilityLabel).toBe('Busy');
  });

  it('2. persists the change as the authoritative stored UserStatus', async () => {
    await supertest(app.server)
      .post('/api/v1/availability/status')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ state: 'BUSY' });

    const call = updateCalls.find((c) => c.id === 'usr-sarah');
    expect(call).toBeDefined();
    expect(call!.data.status).toBe(UserStatus.BUSY);
  });

  it('3. never touches room assignment when availability changes', async () => {
    await supertest(app.server)
      .post('/api/v1/availability/status')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ state: 'PARTIALLY_AVAILABLE' });

    const call = updateCalls.find((c) => c.id === 'usr-sarah')!;
    expect(call.data).not.toHaveProperty('roomId');
    expect(call.data).not.toHaveProperty('subroomId');
    expect(call.data).not.toHaveProperty('currentLocationSubroomId');
  });

  it('4. emits AVAILABILITY_CHANGED identifying the target person, with no private detail in the payload', async () => {
    await supertest(app.server)
      .post('/api/v1/availability/status')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ state: 'BUSY' });

    const event = capturedEvents.find((e) => e.type === 'AVAILABILITY_CHANGED');
    expect(event).toBeDefined();
    expect(event!.targetUserId).toBe('usr-sarah');
    expect(event!.payload.userId).toBe('usr-sarah');
    expect(event!.payload.personId).toBe('usr-sarah');
    // The wire payload is intentionally minimal — authorized clients refetch
    // the role-scoped REST endpoints rather than trusting socket data.
    expect(event!.payload).not.toHaveProperty('availabilityState');
    expect(event!.payload).not.toHaveProperty('previousAvailabilityState');
    expect(event!.payload).not.toHaveProperty('name');
    expect(event!.payload).not.toHaveProperty('status');
    expect(event!.payload).not.toHaveProperty('presenceState');
    expect(event!.payload).not.toHaveProperty('currentLocation');
  });

  it('5. scopes the broadcast to the actor’s organization only', async () => {
    await supertest(app.server)
      .post('/api/v1/availability/status')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ state: 'BUSY' });

    const event = capturedEvents.find((e) => e.type === 'AVAILABILITY_CHANGED')!;
    expect(event.organizationId).toBe('org-1');
    // Nothing may be published to any other organization.
    expect(capturedEvents.every((e) => e.organizationId === 'org-1')).toBe(true);
  });

  it('6. reports the live location alongside the new availability', async () => {
    const res = await supertest(app.server)
      .post('/api/v1/availability/status')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ state: 'BUSY' });

    expect(res.body.currentLocation).toBe('B3');
  });

  it('7. refuses to mark a checked-OUT person BUSY, because presence dominates', async () => {
    const res = await supertest(app.server)
      .post('/api/v1/availability/status')
      .set('Authorization', `Bearer ${outsideToken}`)
      .send({ state: 'BUSY' });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/checked OUT/i);
    expect(updateCalls.find((c) => c.id === 'usr-outside')).toBeUndefined();
  });

  it('8. still allows explicitly marking a checked-OUT person UNAVAILABLE', async () => {
    const res = await supertest(app.server)
      .post('/api/v1/availability/status')
      .set('Authorization', `Bearer ${outsideToken}`)
      .send({ state: 'UNAVAILABLE' });

    expect(res.status).toBe(200);
    expect(res.body.availabilityState).toBe('UNAVAILABLE');
    expect(res.body.currentLocation).toBe('Outside');
  });

  // --- Authorization -------------------------------------------------------

  it('9. rejects an unauthenticated request', async () => {
    const res = await supertest(app.server)
      .post('/api/v1/availability/status')
      .send({ state: 'BUSY' });

    expect(res.status).toBe(401);
  });

  it('10. forbids a MEMBER from changing somebody else’s availability', async () => {
    const res = await supertest(app.server)
      .post('/api/v1/availability/status')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ personId: 'usr-other-room', state: 'BUSY' });

    expect(res.status).toBe(403);
    expect(updateCalls.find((c) => c.id === 'usr-other-room')).toBeUndefined();
  });

  it('11. forbids an ADMIN from changing somebody else’s availability — a person owns their own status', async () => {
    const res = await supertest(app.server)
      .post('/api/v1/availability/status')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ personId: 'usr-sarah', state: 'BUSY' });

    expect(res.status).toBe(403);
    expect(updateCalls.find((c) => c.id === 'usr-sarah')).toBeUndefined();
  });

  it('12. forbids a SERVER from changing a room member’s availability — the former room-scoped bypass is gone', async () => {
    const res = await supertest(app.server)
      .post('/api/v1/availability/status')
      .set('Authorization', `Bearer ${serverToken}`)
      .send({ personId: 'usr-sarah', state: 'BUSY' });

    expect(res.status).toBe(403);
    expect(updateCalls.find((c) => c.id === 'usr-sarah')).toBeUndefined();
  });

  it('13. forbids a SERVER from acting outside their own room too', async () => {
    const res = await supertest(app.server)
      .post('/api/v1/availability/status')
      .set('Authorization', `Bearer ${serverToken}`)
      .send({ personId: 'usr-other-room', state: 'BUSY' });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/only authorized to change your own/i);
  });

  it('14. rejects an unrecognised availability state', async () => {
    const res = await supertest(app.server)
      .post('/api/v1/availability/status')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ state: 'ON_HOLIDAY' });

    expect(res.status).toBe(400);
  });

  it('15. rejects a non-self personId with 403 before ever looking the person up — never leaks whether the id exists', async () => {
    const res = await supertest(app.server)
      .post('/api/v1/availability/status')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ personId: 'usr-nobody', state: 'BUSY' });

    expect(res.status).toBe(403);
  });

  // --- Rapid consecutive changes ------------------------------------------

  it('16. converges on the last state after rapid FREE→BUSY→FREE→BUSY changes', async () => {
    for (const state of ['BUSY', 'FREE', 'BUSY'] as const) {
      await supertest(app.server)
        .post('/api/v1/availability/status')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ state });
    }

    expect(userState['usr-sarah'].status).toBe(UserStatus.BUSY);

    const availabilityEvents = capturedEvents.filter((e) => e.type === 'AVAILABILITY_CHANGED');
    expect(availabilityEvents).toHaveLength(3);
    expect(availabilityEvents[availabilityEvents.length - 1].payload.userId).toBe('usr-sarah');
  });

  it('17. emits one AVAILABILITY_CHANGED per accepted change, each with a unique id', async () => {
    for (const state of ['BUSY', 'FREE'] as const) {
      await supertest(app.server)
        .post('/api/v1/availability/status')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ state });
    }

    const availabilityEvents = capturedEvents.filter((e) => e.type === 'AVAILABILITY_CHANGED');
    expect(availabilityEvents).toHaveLength(2);
    expect(new Set(availabilityEvents.map((e) => e.id)).size).toBe(2);
  });
});
