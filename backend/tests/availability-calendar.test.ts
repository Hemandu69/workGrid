import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import supertest from 'supertest';
import { UserRole } from '@prisma/client';
import { buildApp } from '../src/app.js';

const USERS: Record<string, Record<string, unknown>> = {
  'usr-sarah': {
    id: 'usr-sarah',
    name: 'Sarah Connor',
    email: 'sarah.connor@workgrid.corp',
    role: 'MEMBER',
    organizationId: 'org-1',
    currentAllocatedHours: 0,
    capacityLimitHours: 40,
  },
  'usr-liam': {
    id: 'usr-liam',
    name: 'Liam Vance',
    email: 'liam.vance@workgrid.corp',
    role: 'MEMBER',
    organizationId: 'org-1',
    currentAllocatedHours: 0,
    capacityLimitHours: 40,
  },
};

// Sarah's recurring baseline: every Monday 09:00 is AVAILABLE.
const RECURRING_SLOTS = [{ userId: 'usr-sarah', day: 'MONDAY', hour: 9, state: 'AVAILABLE', taskId: null }];

// One persisted override: Monday September 14, 2026 09:00 is BUSY —
// deliberately different from the recurring Monday pattern above.
let persistedOverrides: Array<{ userId: string; date: string; hour: number; state: string; taskId: string | null }> = [
  { userId: 'usr-sarah', date: '2026-09-14', hour: 9, state: 'BUSY', taskId: null },
];

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    user: {
      findUnique: vi.fn(),
    },
    availabilitySlot: {
      findMany: vi.fn(),
    },
    availabilityOverride: {
      findMany: vi.fn(),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    $transaction: vi.fn().mockImplementation(async (cb: (tx: unknown) => unknown) => cb(mockPrisma)),
  },
}));

vi.mock('../src/db/client.js', () => ({
  prisma: mockPrisma,
  checkDatabaseHealth: vi.fn().mockResolvedValue({ status: 'healthy', latencyMs: 1 }),
}));

const publishedEvents: unknown[] = [];
vi.mock('../src/events/domain-events.js', () => ({
  publishDomainEvent: vi.fn().mockImplementation((event: unknown) => {
    publishedEvents.push(event);
    return event;
  }),
  domainEventBus: {
    publishDomainEvent: vi.fn(),
    subscribeOrganization: vi.fn(() => () => undefined),
    subscribeAll: vi.fn(() => () => undefined),
  },
}));

describe('Calendar-aware availability (/api/v1/users/:id/availability/calendar)', () => {
  let app: FastifyInstance;
  let sarahToken: string;
  let liamToken: string;
  let adminToken: string;

  beforeAll(async () => {
    mockPrisma.user.findUnique.mockImplementation(({ where }: { where: { id: string } }) => {
      return Promise.resolve(USERS[where.id] || null);
    });
    mockPrisma.availabilitySlot.findMany.mockImplementation(({ where }: { where: { userId: string } }) => {
      return Promise.resolve(where.userId === 'usr-sarah' ? RECURRING_SLOTS : []);
    });
    mockPrisma.availabilityOverride.findMany.mockImplementation(
      ({ where }: { where: { userId: string; date: { in: string[] } } }) => {
        return Promise.resolve(
          persistedOverrides.filter((o) => o.userId === where.userId && where.date.in.includes(o.date))
        );
      }
    );

    app = await buildApp();
    await app.ready();

    sarahToken = app.jwt.sign({
      id: 'usr-sarah',
      email: 'sarah.connor@workgrid.corp',
      name: 'Sarah Connor',
      role: UserRole.MEMBER,
      organizationId: 'org-1',
    });

    liamToken = app.jwt.sign({
      id: 'usr-liam',
      email: 'liam.vance@workgrid.corp',
      name: 'Liam Vance',
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
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects an unauthenticated GET with 401', async () => {
    const res = await supertest(app.server).get('/api/v1/users/usr-sarah/availability/calendar?weekStart=2026-09-14');
    expect(res.status).toBe(401);
  });

  it('rejects a GET with a missing/invalid weekStart with 400', async () => {
    const res = await supertest(app.server)
      .get('/api/v1/users/usr-sarah/availability/calendar')
      .set('Authorization', `Bearer ${sarahToken}`);
    expect(res.status).toBe(400);
  });

  it('forbids a MEMBER from reading another user\'s calendar week', async () => {
    const res = await supertest(app.server)
      .get('/api/v1/users/usr-liam/availability/calendar?weekStart=2026-09-14')
      .set('Authorization', `Bearer ${sarahToken}`);
    expect(res.status).toBe(403);
  });

  it('lets an ADMIN read any user\'s calendar week', async () => {
    const res = await supertest(app.server)
      .get('/api/v1/users/usr-sarah/availability/calendar?weekStart=2026-09-14')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });

  it('an override for one date wins over the recurring pattern for that exact date only', async () => {
    // Week of 2026-09-14 (a Monday) — Sarah's override makes 09:00 BUSY
    // there, while the recurring pattern (09:00 AVAILABLE every Monday)
    // still governs every OTHER Monday.
    const overriddenWeek = await supertest(app.server)
      .get('/api/v1/users/usr-sarah/availability/calendar?weekStart=2026-09-14')
      .set('Authorization', `Bearer ${sarahToken}`);
    expect(overriddenWeek.status).toBe(200);
    const mon14 = overriddenWeek.body.days.find((d: { date: string }) => d.date === '2026-09-14');
    expect(mon14.slots.find((s: { hour: number }) => s.hour === 9).state).toBe('BUSY');

    // A different week (2026-09-07, also a Monday) has no override — it
    // must still show the plain recurring AVAILABLE state.
    const plainWeek = await supertest(app.server)
      .get('/api/v1/users/usr-sarah/availability/calendar?weekStart=2026-09-07')
      .set('Authorization', `Bearer ${sarahToken}`);
    expect(plainWeek.status).toBe(200);
    const mon07 = plainWeek.body.days.find((d: { date: string }) => d.date === '2026-09-07');
    expect(mon07.slots.find((s: { hour: number }) => s.hour === 9).state).toBe('AVAILABLE');
  });

  it('totals only count dates inside the requested month when month/year are given', async () => {
    // Week of 2026-08-31 (Mon) spans August 31 and September 1-6 — asking
    // for September totals must exclude August 31 entirely.
    const res = await supertest(app.server)
      .get('/api/v1/users/usr-sarah/availability/calendar?weekStart=2026-08-31&month=9&year=2026')
      .set('Authorization', `Bearer ${sarahToken}`);
    expect(res.status).toBe(200);
    // Only 6 in-month dates (Sep 1-6) can contribute — Aug 31's AVAILABLE
    // hours (if any) must not inflate the total.
    expect(res.body.days).toHaveLength(7);
  });

  it('rejects a MEMBER saving another user\'s calendar week', async () => {
    const res = await supertest(app.server)
      .put('/api/v1/users/usr-liam/availability/calendar')
      .set('Authorization', `Bearer ${sarahToken}`)
      .send({ weekStart: '2026-09-14', days: [] });
    expect(res.status).toBe(403);
  });

  it('rejects an ADMIN saving another user\'s calendar week', async () => {
    const res = await supertest(app.server)
      .put('/api/v1/users/usr-liam/availability/calendar')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ weekStart: '2026-09-14', days: [{ date: '2026-09-14', slots: [{ hour: 9, state: 'BUSY' }] }] });
    expect(res.status).toBe(403);
  });

  it('rejects a legacy PREFERRED state on a calendar-week save', async () => {
    const res = await supertest(app.server)
      .put('/api/v1/users/usr-sarah/availability/calendar')
      .set('Authorization', `Bearer ${sarahToken}`)
      .send({ weekStart: '2026-09-14', days: [{ date: '2026-09-14', slots: [{ hour: 9, state: 'PREFERRED' }] }] });
    expect(res.status).toBe(400);
  });

  it('rejects a date outside the given weekStart..weekStart+6 range', async () => {
    const res = await supertest(app.server)
      .put('/api/v1/users/usr-sarah/availability/calendar')
      .set('Authorization', `Bearer ${sarahToken}`)
      .send({
        weekStart: '2026-09-14',
        days: [{ date: '2026-10-01', slots: [{ hour: 9, state: 'BUSY' }] }], // not in this week
      });

    expect(res.status).toBe(200);
    // The out-of-range date is silently dropped, not written.
    expect(mockPrisma.availabilityOverride.deleteMany).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ OR: expect.arrayContaining([{ date: '2026-10-01', hour: 9 }]) }) })
    );
  });

  it('lets a MEMBER save a date-specific override and publishes exactly one AVAILABILITY_CHANGED event for the whole week', async () => {
    const eventsBefore = publishedEvents.length;

    const res = await supertest(app.server)
      .put('/api/v1/users/usr-sarah/availability/calendar')
      .set('Authorization', `Bearer ${sarahToken}`)
      .send({
        weekStart: '2026-09-14',
        days: [
          { date: '2026-09-14', slots: [{ hour: 9, state: 'BUSY' }] },
          { date: '2026-09-15', slots: [{ hour: 10, state: 'UNAVAILABLE' }] },
        ],
      });

    expect(res.status).toBe(200);
    expect(mockPrisma.availabilityOverride.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 'usr-sarah',
          OR: [
            { date: '2026-09-14', hour: 9 },
            { date: '2026-09-15', hour: 10 },
          ],
        },
      })
    );
    expect(mockPrisma.availabilityOverride.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          { userId: 'usr-sarah', date: '2026-09-14', hour: 9, state: 'BUSY', taskId: undefined },
          { userId: 'usr-sarah', date: '2026-09-15', hour: 10, state: 'UNAVAILABLE', taskId: undefined },
        ],
      })
    );
    // One event for the whole week-save, not one per day.
    expect(publishedEvents.length).toBe(eventsBefore + 1);
  });
});
