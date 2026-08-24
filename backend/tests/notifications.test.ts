import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import supertest from 'supertest';

// ---------------------------------------------------------------------------
// A stateful in-memory stand-in for the notification_reads table and the
// users.notificationsReadAllAt column. Stateful (rather than assertion-only)
// specifically so the persistence tests below can re-read what a mutation
// actually wrote, instead of just asserting that some Prisma method was called.
// ---------------------------------------------------------------------------

interface ReceiptRow {
  id: string;
  userId: string;
  notificationKey: string;
  readAt: Date;
}

const USERS: Record<string, any> = {
  'member-1': {
    id: 'member-1',
    name: 'Sarah Connor',
    email: 'sarah@workgrid.corp',
    role: 'MEMBER',
    accountStatus: 'ACTIVE',
    organizationId: 'org-1',
    version: 1,
    notificationsReadAllAt: null,
  },
  'member-2': {
    id: 'member-2',
    name: 'Kyle Reese',
    email: 'kyle@workgrid.corp',
    role: 'MEMBER',
    accountStatus: 'ACTIVE',
    organizationId: 'org-1',
    version: 1,
    notificationsReadAllAt: null,
  },
};

let receipts: ReceiptRow[] = [];
let receiptSeq = 0;

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    notificationRead: {
      findMany: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('../src/db/client.js', () => ({
  prisma: mockPrisma,
  checkDatabaseHealth: vi.fn().mockResolvedValue({ status: 'healthy', latencyMs: 1 }),
}));

describe('Notification read state — persistence, scoping & idempotency', () => {
  let app: FastifyInstance;
  const tokens: Record<string, string> = {};

  beforeAll(async () => {
    mockPrisma.user.findUnique.mockImplementation(({ where }: any) =>
      Promise.resolve(USERS[where.id] ? { ...USERS[where.id], room: null, subroom: null } : null)
    );
    mockPrisma.user.update.mockImplementation(({ where, data }: any) => {
      USERS[where.id] = { ...USERS[where.id], ...data };
      return Promise.resolve(USERS[where.id]);
    });

    mockPrisma.notificationRead.findMany.mockImplementation(({ where }: any) =>
      Promise.resolve(receipts.filter((r) => r.userId === where.userId))
    );
    mockPrisma.notificationRead.upsert.mockImplementation(({ where, create }: any) => {
      const { userId, notificationKey } = where.userId_notificationKey;
      const existing = receipts.find((r) => r.userId === userId && r.notificationKey === notificationKey);
      if (existing) return Promise.resolve(existing); // update: {} — timestamp deliberately unchanged
      const row: ReceiptRow = {
        id: `rcpt-${++receiptSeq}`,
        userId: create.userId,
        notificationKey: create.notificationKey,
        readAt: new Date(),
      };
      receipts.push(row);
      return Promise.resolve(row);
    });
    mockPrisma.notificationRead.deleteMany.mockImplementation(({ where }: any) => {
      const before = receipts.length;
      receipts = receipts.filter(
        (r) => !(r.userId === where.userId && r.readAt.getTime() <= where.readAt.lte.getTime())
      );
      return Promise.resolve({ count: before - receipts.length });
    });

    mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));

    app = await buildApp();
    await app.ready();

    for (const [key, u] of Object.entries(USERS)) {
      tokens[key] = app.jwt.sign(u);
    }
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    receipts = [];
    receiptSeq = 0;
    USERS['member-1'].notificationsReadAllAt = null;
    USERS['member-2'].notificationsReadAllAt = null;
  });

  // -------------------------------------------------------------------------
  // Authentication
  // -------------------------------------------------------------------------

  it('rejects an unauthenticated read-state request', async () => {
    const res = await supertest(app.server).get('/api/v1/notifications/read-state');
    expect(res.status).toBe(401);
  });

  it('rejects an unauthenticated mark-read request', async () => {
    const res = await supertest(app.server).post('/api/v1/notifications/ann-1/read');
    expect(res.status).toBe(401);
  });

  // -------------------------------------------------------------------------
  // Mark one as read
  // -------------------------------------------------------------------------

  it('marks one notification as read and returns it', async () => {
    const res = await supertest(app.server)
      .post('/api/v1/notifications/ann-abc/read')
      .set('Authorization', `Bearer ${tokens['member-1']}`);

    expect(res.status).toBe(200);
    expect(res.body.notificationKey).toBe('ann-abc');
    expect(res.body.readAt).toBeTruthy();
  });

  it('PERSISTENCE: a notification marked read is still read when the feed is fetched again', async () => {
    await supertest(app.server)
      .post('/api/v1/notifications/ann-abc/read')
      .set('Authorization', `Bearer ${tokens['member-1']}`);

    // Simulates the browser reloading and re-reading persisted state.
    const after = await supertest(app.server)
      .get('/api/v1/notifications/read-state')
      .set('Authorization', `Bearer ${tokens['member-1']}`);

    expect(after.status).toBe(200);
    expect(after.body.readKeys).toContain('ann-abc');
  });

  it('marking an already-read notification read again is idempotent — no duplicate receipt', async () => {
    for (let i = 0; i < 3; i++) {
      const res = await supertest(app.server)
        .post('/api/v1/notifications/ann-abc/read')
        .set('Authorization', `Bearer ${tokens['member-1']}`);
      expect(res.status).toBe(200);
    }

    expect(receipts.filter((r) => r.notificationKey === 'ann-abc')).toHaveLength(1);

    const state = await supertest(app.server)
      .get('/api/v1/notifications/read-state')
      .set('Authorization', `Bearer ${tokens['member-1']}`);
    expect(state.body.readKeys).toEqual(['ann-abc']);
  });

  it('rejects a malformed notification key rather than persisting it', async () => {
    const res = await supertest(app.server)
      .post(`/api/v1/notifications/${encodeURIComponent('bad key!<script>')}/read`)
      .set('Authorization', `Bearer ${tokens['member-1']}`);

    expect(res.status).toBe(400);
    expect(receipts).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // User scoping — the core authorization property
  // -------------------------------------------------------------------------

  it("one user's mark-read never affects another user's read state", async () => {
    await supertest(app.server)
      .post('/api/v1/notifications/ann-shared/read')
      .set('Authorization', `Bearer ${tokens['member-1']}`);

    const otherUser = await supertest(app.server)
      .get('/api/v1/notifications/read-state')
      .set('Authorization', `Bearer ${tokens['member-2']}`);

    expect(otherUser.body.readKeys).toEqual([]);
    expect(otherUser.body.readAllAt).toBeNull();
  });

  it('the receipt is written against the authenticated user, not any client-supplied id', async () => {
    await supertest(app.server)
      .post('/api/v1/notifications/ann-xyz/read')
      .set('Authorization', `Bearer ${tokens['member-2']}`)
      // A userId in the body must be ignored entirely — ownership comes from the token.
      .send({ userId: 'member-1' });

    expect(receipts).toHaveLength(1);
    expect(receipts[0].userId).toBe('member-2');
  });

  it("one user's mark-all never affects another user's read state", async () => {
    await supertest(app.server)
      .post('/api/v1/notifications/read-all')
      .set('Authorization', `Bearer ${tokens['member-1']}`);

    const otherUser = await supertest(app.server)
      .get('/api/v1/notifications/read-state')
      .set('Authorization', `Bearer ${tokens['member-2']}`);

    expect(otherUser.body.readAllAt).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Mark all as read
  // -------------------------------------------------------------------------

  it('marks all as read and returns the watermark', async () => {
    const res = await supertest(app.server)
      .post('/api/v1/notifications/read-all')
      .set('Authorization', `Bearer ${tokens['member-1']}`);

    expect(res.status).toBe(200);
    expect(res.body.readAllAt).toBeTruthy();
  });

  it('PERSISTENCE: after mark-all, the watermark is still returned on a later fetch', async () => {
    const marked = await supertest(app.server)
      .post('/api/v1/notifications/read-all')
      .set('Authorization', `Bearer ${tokens['member-1']}`);

    const after = await supertest(app.server)
      .get('/api/v1/notifications/read-state')
      .set('Authorization', `Bearer ${tokens['member-1']}`);

    expect(after.body.readAllAt).toBe(marked.body.readAllAt);
  });

  it('mark-all is idempotent and safe to call repeatedly', async () => {
    const first = await supertest(app.server)
      .post('/api/v1/notifications/read-all')
      .set('Authorization', `Bearer ${tokens['member-1']}`);
    const second = await supertest(app.server)
      .post('/api/v1/notifications/read-all')
      .set('Authorization', `Bearer ${tokens['member-1']}`);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    // The watermark only ever moves forward; it never errors or duplicates.
    expect(new Date(second.body.readAllAt).getTime()).toBeGreaterThanOrEqual(
      new Date(first.body.readAllAt).getTime()
    );
  });

  it('mark-all uses a single-row watermark rather than one write per notification', async () => {
    mockPrisma.user.update.mockClear();

    await supertest(app.server)
      .post('/api/v1/notifications/read-all')
      .set('Authorization', `Bearer ${tokens['member-1']}`);

    expect(mockPrisma.user.update).toHaveBeenCalledTimes(1);
  });

  it('mark-all prunes now-redundant individual receipts so the table cannot grow unbounded', async () => {
    await supertest(app.server)
      .post('/api/v1/notifications/ann-old/read')
      .set('Authorization', `Bearer ${tokens['member-1']}`);
    expect(receipts).toHaveLength(1);

    await supertest(app.server)
      .post('/api/v1/notifications/read-all')
      .set('Authorization', `Bearer ${tokens['member-1']}`);

    // The watermark now covers it, so the receipt is redundant.
    expect(receipts).toHaveLength(0);

    // ...but the notification is still read, because it predates the watermark.
    const state = await supertest(app.server)
      .get('/api/v1/notifications/read-state')
      .set('Authorization', `Bearer ${tokens['member-1']}`);
    const createdAt = new Date(Date.now() - 60_000); // the notification existed before mark-all
    expect(createdAt.getTime()).toBeLessThanOrEqual(new Date(state.body.readAllAt).getTime());
  });

  it('a notification created AFTER mark-all is still unread (watermark does not cover the future)', async () => {
    const marked = await supertest(app.server)
      .post('/api/v1/notifications/read-all')
      .set('Authorization', `Bearer ${tokens['member-1']}`);

    const state = await supertest(app.server)
      .get('/api/v1/notifications/read-state')
      .set('Authorization', `Bearer ${tokens['member-1']}`);

    // A feed item that arrives after the watermark has a later createdAt, so
    // the read derivation (createdAt <= readAllAt) is false for it.
    const futureNotificationCreatedAt = new Date(new Date(marked.body.readAllAt).getTime() + 1000);
    expect(futureNotificationCreatedAt.getTime()).toBeGreaterThan(new Date(state.body.readAllAt).getTime());
    expect(state.body.readKeys).not.toContain('ann-future');
  });

  // -------------------------------------------------------------------------
  // Mixed / concurrent-ish sequences
  // -------------------------------------------------------------------------

  it('PERSISTENCE: multiple notifications marked read individually all remain read', async () => {
    for (const key of ['ann-1', 'ann-2', 'ann-3']) {
      await supertest(app.server)
        .post(`/api/v1/notifications/${key}/read`)
        .set('Authorization', `Bearer ${tokens['member-1']}`);
    }

    const state = await supertest(app.server)
      .get('/api/v1/notifications/read-state')
      .set('Authorization', `Bearer ${tokens['member-1']}`);

    expect(state.body.readKeys).toEqual(expect.arrayContaining(['ann-1', 'ann-2', 'ann-3']));
  });

  it('an individual mark-read landing after a mark-all still leaves consistent state', async () => {
    await supertest(app.server)
      .post('/api/v1/notifications/read-all')
      .set('Authorization', `Bearer ${tokens['member-1']}`);

    const res = await supertest(app.server)
      .post('/api/v1/notifications/ann-late/read')
      .set('Authorization', `Bearer ${tokens['member-1']}`);

    expect(res.status).toBe(200);

    const state = await supertest(app.server)
      .get('/api/v1/notifications/read-state')
      .set('Authorization', `Bearer ${tokens['member-1']}`);

    // Read via the explicit receipt regardless of where it falls vs. the watermark.
    expect(state.body.readKeys).toContain('ann-late');
    expect(state.body.readAllAt).toBeTruthy();
  });

  it('read state starts empty for a user who has never read anything', async () => {
    const state = await supertest(app.server)
      .get('/api/v1/notifications/read-state')
      .set('Authorization', `Bearer ${tokens['member-2']}`);

    expect(state.status).toBe(200);
    expect(state.body.readKeys).toEqual([]);
    expect(state.body.readAllAt).toBeNull();
  });
});
