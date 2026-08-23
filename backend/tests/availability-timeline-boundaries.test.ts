import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import supertest from 'supertest';
import { UserRole } from '@prisma/client';

// Monday's slots deliberately span the whole spec-example day plus edges on
// both sides of the working window, so every boundary (including the final
// hour-24 end-of-day boundary that used to roll over to "05:30 AM") is
// exercised: 0-9 UNAVAILABLE (no rows) / 9-12 FREE / 12-15 BUSY /
// 15-18 UNAVAILABLE / 18-20 FREE / 20-24 UNAVAILABLE (no rows).
const mondaySlots = [
  { day: 'MONDAY', hour: 9, state: 'AVAILABLE' },
  { day: 'MONDAY', hour: 10, state: 'AVAILABLE' },
  { day: 'MONDAY', hour: 11, state: 'AVAILABLE' },
  { day: 'MONDAY', hour: 12, state: 'BUSY' },
  { day: 'MONDAY', hour: 13, state: 'BUSY' },
  { day: 'MONDAY', hour: 14, state: 'BUSY' },
  { day: 'MONDAY', hour: 15, state: 'UNAVAILABLE' },
  { day: 'MONDAY', hour: 16, state: 'UNAVAILABLE' },
  { day: 'MONDAY', hour: 17, state: 'UNAVAILABLE' },
  { day: 'MONDAY', hour: 18, state: 'AVAILABLE' },
  { day: 'MONDAY', hour: 19, state: 'AVAILABLE' },
];

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

vi.mock('../src/db/client.js', () => ({
  prisma: mockPrisma,
  checkDatabaseHealth: vi.fn().mockResolvedValue({ status: 'healthy', latencyMs: 1 }),
}));

describe('Admin timeline time boundaries match the member grid exactly (no :30, no cross-midnight wrap)', () => {
  let app: FastifyInstance;
  let adminToken: string;

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
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('produces exactly the merged windows from the spec walkthrough, with clean hour labels and no :30 anywhere', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockPrisma.user.findUnique as any).mockImplementation(({ where }: { where: { id: string } }) => {
      if (where.id !== 'member-1-id') return Promise.resolve(null); // falls back to JWT payload for auth
      return Promise.resolve({
        id: 'member-1-id',
        name: 'Sarah Connor',
        email: 'sarah.connor@workgrid.corp',
        role: 'MEMBER',
        status: 'ONLINE',
        capacityLimitHours: 40,
        currentAllocatedHours: 10,
        availabilitySlots: mondaySlots,
        availabilityOverrides: [],
        assignedTasks: [],
      });
    });

    // 2026-08-24 is a Monday.
    const res = await supertest(app.server)
      .get('/api/v1/availability/people/member-1-id?startDate=2026-08-24')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const monday = res.body.weeklyTimeline.find((d: { dayOfWeek: string }) => d.dayOfWeek === 'MONDAY');
    expect(monday).toBeDefined();

    const windows = monday.windows as Array<{
      startHour: number;
      endHour: number;
      state: string;
      startFormatted: string;
      endFormatted: string;
    }>;

    // No :30 boundary anywhere in the whole day's timeline.
    for (const w of windows) {
      expect(w.startFormatted).not.toContain(':30');
      expect(w.endFormatted).not.toContain(':30');
    }

    expect(windows).toEqual([
      expect.objectContaining({ startHour: 0, endHour: 9, state: 'UNAVAILABLE', startFormatted: '12:00 AM', endFormatted: '09:00 AM' }),
      expect.objectContaining({ startHour: 9, endHour: 12, state: 'FREE', startFormatted: '09:00 AM', endFormatted: '12:00 PM' }),
      expect.objectContaining({ startHour: 12, endHour: 15, state: 'BUSY', startFormatted: '12:00 PM', endFormatted: '03:00 PM' }),
      expect.objectContaining({ startHour: 15, endHour: 18, state: 'UNAVAILABLE', startFormatted: '03:00 PM', endFormatted: '06:00 PM' }),
      expect.objectContaining({ startHour: 18, endHour: 20, state: 'FREE', startFormatted: '06:00 PM', endFormatted: '08:00 PM' }),
      // The final window's end boundary (hour 24) must render as midnight —
      // never roll over into an early-morning-next-day timestamp like "05:30 AM".
      expect.objectContaining({ startHour: 20, endHour: 24, state: 'UNAVAILABLE', startFormatted: '08:00 PM', endFormatted: '12:00 AM' }),
    ]);
  });

  it('never merges the last window of the day with the first window of the next day across midnight', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockPrisma.user.findUnique as any).mockImplementation(({ where }: { where: { id: string } }) => {
      if (where.id !== 'member-1-id') return Promise.resolve(null);
      return Promise.resolve({
        id: 'member-1-id',
        name: 'Sarah Connor',
        email: 'sarah.connor@workgrid.corp',
        role: 'MEMBER',
        status: 'ONLINE',
        capacityLimitHours: 40,
        currentAllocatedHours: 0,
        // Every day fully UNAVAILABLE (no rows at all) — if a cross-midnight
        // merge bug existed, this would collapse into one giant multi-day range.
        availabilitySlots: [],
        availabilityOverrides: [],
        assignedTasks: [],
      });
    });

    const res = await supertest(app.server)
      .get('/api/v1/availability/people/member-1-id?startDate=2026-08-24')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.weeklyTimeline).toHaveLength(7);
    for (const day of res.body.weeklyTimeline) {
      // Each day still yields exactly one self-contained 00:00-24:00 window —
      // never spilling into a neighboring day's date.
      expect(day.windows).toHaveLength(1);
      expect(day.windows[0]).toMatchObject({
        startHour: 0,
        endHour: 24,
        state: 'UNAVAILABLE',
        startFormatted: '12:00 AM',
        endFormatted: '12:00 AM',
      });
    }
  });

  it('findActiveWindow/computeNextFree compare against the current LOCAL (IST) hour, not the UTC hour', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockPrisma.user.findUnique as any).mockImplementation(({ where }: { where: { id: string } }) => {
      if (where.id !== 'member-1-id') return Promise.resolve(null);
      return Promise.resolve({
        id: 'member-1-id',
        name: 'Sarah Connor',
        email: 'sarah.connor@workgrid.corp',
        role: 'MEMBER',
        status: 'ONLINE',
        presenceState: 'IN',
        capacityLimitHours: 40,
        currentAllocatedHours: 10,
        availabilitySlots: mondaySlots,
        availabilityOverrides: [],
        assignedTasks: [],
      });
    });

    // 13:00 IST on 2026-08-24 == 07:30 UTC same day. A UTC-hour comparison
    // (07) would miss the 09-12 FREE window entirely; the correct IST-hour
    // comparison (13) must land inside the 12-15 BUSY window and report
    // "Until 03:00 PM".
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-24T07:30:00.000Z'));

    const res = await supertest(app.server)
      .get('/api/v1/availability/people/member-1-id?startDate=2026-08-24')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.currentStatus.until).toBe('03:00 PM');
    expect(res.body.currentStatus.until).not.toContain(':30');
  });

  it('GET /api/v1/availability/people (overview list) also formats until/freeWindow without :30', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockPrisma.user.findMany as any).mockResolvedValueOnce([
      {
        id: 'member-1-id',
        name: 'Sarah Connor',
        email: 'sarah.connor@workgrid.corp',
        role: 'MEMBER',
        status: 'ONLINE',
        capacityLimitHours: 40,
        currentAllocatedHours: 10,
        room: null,
        subroom: null,
        availabilitySlots: [
          { hour: 9, state: 'AVAILABLE' },
          { hour: 10, state: 'BUSY' },
        ],
        availabilityOverrides: [],
        assignedTasks: [],
      },
    ]);

    const res = await supertest(app.server)
      .get('/api/v1/availability/people?date=2026-08-24&startHour=9&endHour=11')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.timeSlot.startFormatted).toBe('09:00 AM');
    expect(res.body.timeSlot.endFormatted).toBe('11:00 AM');
    expect(res.body.timeSlot.activeWindow).toBe('09:00 AM – 11:00 AM');
    const person = res.body.people[0];
    if (person.until) expect(person.until).not.toContain(':30');
    if (person.freeWindow) expect(person.freeWindow).not.toContain(':30');
  });
});
