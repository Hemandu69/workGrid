import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import supertest from 'supertest';
import { UserRole, UserStatus } from '@prisma/client';
import { buildApp } from '../src/app.js';
import { domainEventBus, DomainEvent } from '../src/events/domain-events.js';

const userState: Record<string, { presenceState: 'IN' | 'OUT'; status: UserStatus; preMealStatus: UserStatus | null }> = {
  'usr-sarah': { presenceState: 'IN', status: UserStatus.ONLINE, preMealStatus: null },
  'usr-outside': { presenceState: 'OUT', status: UserStatus.OFFLINE, preMealStatus: null },
};

const updateCalls: Array<{ id: string; data: Record<string, unknown> }> = [];

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
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
    room: { id: 'room-b-id', letter: 'B' },
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
    room: { id: 'room-b-id', letter: 'B' },
    subroom: { id: 'subroom-b4-id', code: 'B4' },
  },
};

describe('Meal (Lunch/Dinner) endpoints (/api/v1/availability/meal/start, /end)', () => {
  let app: FastifyInstance;
  let sarahToken: string;
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
      if (userState[where.id]) {
        if (data.status !== undefined) userState[where.id].status = data.status;
        if (data.preMealStatus !== undefined) userState[where.id].preMealStatus = data.preMealStatus;
      }
      const base = USERS[where.id] || {};
      return Promise.resolve({ ...base, ...(userState[where.id] || {}), ...data });
    });

    app = await buildApp();
    await app.ready();

    sarahToken = app.jwt.sign({
      id: 'usr-sarah',
      email: 'sarah.connor@workgrid.corp',
      name: 'Sarah Connor',
      role: UserRole.MEMBER,
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
    userState['usr-sarah'] = { presenceState: 'IN', status: UserStatus.ONLINE, preMealStatus: null };
    userState['usr-outside'] = { presenceState: 'OUT', status: UserStatus.OFFLINE, preMealStatus: null };
    updateCalls.length = 0;
    unsubscribe?.();
    capturedEvents = [];
    unsubscribe = domainEventBus.subscribeAll((event) => capturedEvents.push(event));
  });

  it('starts a meal, saving the prior status', async () => {
    userState['usr-sarah'].status = UserStatus.BUSY;

    const res = await supertest(app.server)
      .post('/api/v1/availability/meal/start')
      .set('Authorization', `Bearer ${sarahToken}`);

    expect(res.status).toBe(200);
    expect(res.body.availabilityState).toBe('MEAL');
    expect(userState['usr-sarah'].status).toBe(UserStatus.MEAL);
    expect(userState['usr-sarah'].preMealStatus).toBe(UserStatus.BUSY);
  });

  it('rejects starting a meal while checked OUT', async () => {
    const res = await supertest(app.server)
      .post('/api/v1/availability/meal/start')
      .set('Authorization', `Bearer ${outsideToken}`);

    expect(res.status).toBe(409);
    expect(updateCalls.find((c) => c.id === 'usr-outside')).toBeUndefined();
  });

  it('never touches presenceState — attendance stays continuous through a meal', async () => {
    await supertest(app.server)
      .post('/api/v1/availability/meal/start')
      .set('Authorization', `Bearer ${sarahToken}`);

    const call = updateCalls.find((c) => c.id === 'usr-sarah')!;
    expect(call.data).not.toHaveProperty('presenceState');
    expect(call.data).not.toHaveProperty('arrivedAt');
    expect(call.data).not.toHaveProperty('leftAt');
    expect(userState['usr-sarah'].presenceState).toBe('IN');
  });

  it('ends a meal, restoring the exact prior status', async () => {
    await supertest(app.server).post('/api/v1/availability/meal/start').set('Authorization', `Bearer ${sarahToken}`).send();
    userState['usr-sarah'].status = UserStatus.MEAL; // ensure the mock reflects it before /end
    userState['usr-sarah'].preMealStatus = UserStatus.BUSY;

    const res = await supertest(app.server)
      .post('/api/v1/availability/meal/end')
      .set('Authorization', `Bearer ${sarahToken}`);

    expect(res.status).toBe(200);
    expect(res.body.availabilityState).toBe('BUSY');
    expect(userState['usr-sarah'].status).toBe(UserStatus.BUSY);
    expect(userState['usr-sarah'].preMealStatus).toBeNull();
  });

  it('ending a meal never touches presenceState either', async () => {
    userState['usr-sarah'].status = UserStatus.MEAL;
    userState['usr-sarah'].preMealStatus = UserStatus.ONLINE;

    await supertest(app.server).post('/api/v1/availability/meal/end').set('Authorization', `Bearer ${sarahToken}`);

    const call = updateCalls.find((c) => c.id === 'usr-sarah')!;
    expect(call.data).not.toHaveProperty('presenceState');
    expect(call.data).not.toHaveProperty('arrivedAt');
    expect(call.data).not.toHaveProperty('leftAt');
  });

  it('ending a meal when not currently in one is a safe no-op', async () => {
    const res = await supertest(app.server)
      .post('/api/v1/availability/meal/end')
      .set('Authorization', `Bearer ${sarahToken}`);

    expect(res.status).toBe(200);
    expect(updateCalls.find((c) => c.id === 'usr-sarah')).toBeUndefined();
  });

  it('an explicit FREE/BUSY/PARTIAL selection clears a stale preMealStatus', async () => {
    userState['usr-sarah'].status = UserStatus.MEAL;
    userState['usr-sarah'].preMealStatus = UserStatus.ONLINE;

    await supertest(app.server)
      .post('/api/v1/availability/status')
      .set('Authorization', `Bearer ${sarahToken}`)
      .send({ state: 'BUSY' });

    const call = updateCalls.find((c) => c.id === 'usr-sarah')!;
    expect(call.data.preMealStatus).toBeNull();
  });

  it('publishes AVAILABILITY_CHANGED on meal start and end', async () => {
    await supertest(app.server).post('/api/v1/availability/meal/start').set('Authorization', `Bearer ${sarahToken}`);
    userState['usr-sarah'].status = UserStatus.MEAL;
    await supertest(app.server).post('/api/v1/availability/meal/end').set('Authorization', `Bearer ${sarahToken}`);

    const events = capturedEvents.filter((e) => e.type === 'AVAILABILITY_CHANGED');
    expect(events).toHaveLength(2);
    expect(events.every((e) => e.targetUserId === 'usr-sarah')).toBe(true);
  });

  it('rejects an unauthenticated request to either endpoint', async () => {
    const startRes = await supertest(app.server).post('/api/v1/availability/meal/start');
    const endRes = await supertest(app.server).post('/api/v1/availability/meal/end');
    expect(startRes.status).toBe(401);
    expect(endRes.status).toBe(401);
  });
});
