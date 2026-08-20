import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import supertest from 'supertest';
import bcrypt from 'bcryptjs';
import { AccountStatus, PresenceState, UserRole } from '@prisma/client';
import { formatToISTTime, formatToISTDate, formatDuration } from '../src/utils/time.js';

const mockTestUsers: any[] = [];
const mockAttendanceRecords: any[] = [];
const mockAuditEvents: any[] = [];

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    user: {
      findUnique: vi.fn().mockImplementation(async ({ where }) => {
        if (where?.email) {
          return mockTestUsers.find((u) => u.email.toLowerCase() === where.email.toLowerCase()) || null;
        }
        if (where?.id) {
          return mockTestUsers.find((u) => u.id === where.id) || null;
        }
        return null;
      }),
      findFirst: vi.fn().mockImplementation(async ({ where }) => {
        return (
          mockTestUsers.find((u) => {
            if (where.id && u.id !== where.id) return false;
            if (where.email && u.email.toLowerCase() !== where.email.toLowerCase()) return false;
            if (where.organizationId && u.organizationId !== where.organizationId) return false;
            return true;
          }) || null
        );
      }),
      findMany: vi.fn().mockImplementation(async ({ where }) => {
        return mockTestUsers.filter((u) => {
          if (where?.organizationId && u.organizationId !== where.organizationId) return false;
          if (where?.role && u.role !== where.role) return false;
          if (where?.accountStatus && u.accountStatus !== where.accountStatus) return false;
          if (where?.presenceState && u.presenceState !== where.presenceState) return false;
          return true;
        }).map((u) => ({
          ...u,
          room: u.roomId ? { id: u.roomId, letter: 'B', name: 'Sector B' } : null,
          subroom: u.subroomId ? { id: u.subroomId, code: 'B3' } : null,
          attendanceRecords: mockAttendanceRecords.filter((r) => r.userId === u.id),
        }));
      }),
      update: vi.fn().mockImplementation(async ({ where, data }) => {
        const index = mockTestUsers.findIndex((u) => u.id === where.id);
        if (index === -1) throw new Error('User not found');
        mockTestUsers[index] = { ...mockTestUsers[index], ...data, updatedAt: new Date() };
        return mockTestUsers[index];
      }),
    },
    attendanceRecord: {
      findFirst: vi.fn().mockImplementation(async ({ where }) => {
        return (
          mockAttendanceRecords.find((r) => {
            if (where.userId && r.userId !== where.userId) return false;
            if (where.leftAt === null && r.leftAt !== null) return false;
            return true;
          }) || null
        );
      }),
      findMany: vi.fn().mockImplementation(async ({ where, take }) => {
        let results = mockAttendanceRecords.filter((r) => {
          if (where?.userId && r.userId !== where.userId) return false;
          if (where?.organizationId && r.organizationId !== where.organizationId) return false;
          if (where?.arrivedAt?.gte && r.arrivedAt < where.arrivedAt.gte) return false;
          if (where?.arrivedAt?.lte && r.arrivedAt > where.arrivedAt.lte) return false;
          return true;
        });
        if (take) results = results.slice(0, take);
        return results;
      }),
      create: vi.fn().mockImplementation(async ({ data }) => {
        const record = {
          id: `att-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        mockAttendanceRecords.push(record);
        return record;
      }),
      update: vi.fn().mockImplementation(async ({ where, data }) => {
        const index = mockAttendanceRecords.findIndex((r) => r.id === where.id);
        if (index === -1) throw new Error('Record not found');
        mockAttendanceRecords[index] = { ...mockAttendanceRecords[index], ...data, updatedAt: new Date() };
        return mockAttendanceRecords[index];
      }),
    },
    auditEvent: {
      create: vi.fn().mockImplementation(async ({ data }) => {
        const event = { id: `audit-${Date.now()}`, ...data, createdAt: new Date() };
        mockAuditEvents.push(event);
        return event;
      }),
    },
    $transaction: vi.fn().mockImplementation(async (callback) => {
      return callback(mockPrisma);
    }),
  },
}));

vi.mock('../src/db/client.js', () => ({
  prisma: mockPrisma,
  checkDatabaseHealth: vi.fn().mockResolvedValue({ status: 'healthy', latencyMs: 1 }),
}));

describe('WorkGrid Global Attendance & Presence System (/api/v1/attendance)', () => {
  let app: FastifyInstance;
  let activeMemberToken: string;
  let activeAdminToken: string;
  let pendingToken: string;
  let suspendedToken: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    const defaultHash = await bcrypt.hash('password123', 4);

    mockTestUsers.push(
      {
        id: 'usr-member-att-01',
        organizationId: 'org-test-1',
        email: 'sarah.member@workgrid.corp',
        passwordHash: defaultHash,
        name: 'Sarah Member',
        role: UserRole.MEMBER,
        accountStatus: AccountStatus.ACTIVE,
        presenceState: PresenceState.OUT,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'usr-admin-att-01',
        organizationId: 'org-test-1',
        email: 'marcus.admin@workgrid.corp',
        passwordHash: defaultHash,
        name: 'Marcus Admin',
        role: UserRole.ADMIN,
        accountStatus: AccountStatus.ACTIVE,
        presenceState: PresenceState.OUT,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'usr-pending-att-01',
        organizationId: 'org-test-1',
        email: 'john.pending@workgrid.corp',
        passwordHash: defaultHash,
        name: 'John Pending',
        role: null,
        accountStatus: AccountStatus.PENDING,
        presenceState: PresenceState.OUT,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'usr-suspended-att-01',
        organizationId: 'org-test-1',
        email: 'blocked.user@workgrid.corp',
        passwordHash: defaultHash,
        name: 'Blocked User',
        role: UserRole.MEMBER,
        accountStatus: AccountStatus.SUSPENDED,
        presenceState: PresenceState.OUT,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    );

    activeMemberToken = app.jwt.sign({
      id: 'usr-member-att-01',
      email: 'sarah.member@workgrid.corp',
      name: 'Sarah Member',
      role: UserRole.MEMBER,
      accountStatus: AccountStatus.ACTIVE,
      organizationId: 'org-test-1',
      version: 1,
    });

    activeAdminToken = app.jwt.sign({
      id: 'usr-admin-att-01',
      email: 'marcus.admin@workgrid.corp',
      name: 'Marcus Admin',
      role: UserRole.ADMIN,
      accountStatus: AccountStatus.ACTIVE,
      organizationId: 'org-test-1',
      version: 1,
    });

    pendingToken = app.jwt.sign({
      id: 'usr-pending-att-01',
      email: 'john.pending@workgrid.corp',
      name: 'John Pending',
      role: null,
      accountStatus: AccountStatus.PENDING,
      organizationId: 'org-test-1',
      version: 1,
    });

    suspendedToken = app.jwt.sign({
      id: 'usr-suspended-att-01',
      email: 'blocked.user@workgrid.corp',
      name: 'Blocked User',
      role: UserRole.MEMBER,
      accountStatus: AccountStatus.SUSPENDED,
      organizationId: 'org-test-1',
      version: 1,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  // ---------------------------------------------------------------------------
  // 1. Security & Authentication Guard Tests
  // ---------------------------------------------------------------------------
  describe('Security & Account Status Governance', () => {
    it('POST /in should reject unauthenticated requests with 401 Unauthorized', async () => {
      const res = await supertest(app.server).post('/api/v1/attendance/in');
      expect(res.status).toBe(401);
    });

    it('POST /in should reject PENDING user with 403 Forbidden', async () => {
      const res = await supertest(app.server)
        .post('/api/v1/attendance/in')
        .set('Authorization', `Bearer ${pendingToken}`);

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Only ACTIVE employees can check in');
    });

    it('POST /in should reject SUSPENDED user with 403 Forbidden', async () => {
      const res = await supertest(app.server)
        .post('/api/v1/attendance/in')
        .set('Authorization', `Bearer ${suspendedToken}`);

      expect(res.status).toBe(403);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Check IN / OUT Core Workflow & Idempotency
  // ---------------------------------------------------------------------------
  describe('Check IN & OUT Lifecycle', () => {
    it('POST /in should successfully check in active employee (200)', async () => {
      const res = await supertest(app.server)
        .post('/api/v1/attendance/in')
        .set('Authorization', `Bearer ${activeMemberToken}`);

      expect(res.status).toBe(200);
      expect(res.body.state).toBe('IN');
      expect(res.body.presenceState).toBe('IN');
      expect(res.body).toHaveProperty('arrivedAt');
      expect(res.body).toHaveProperty('arrivedAtIST');
      expect(res.body.isExistingSession).toBe(false);

      // Verify User presence was updated in database
      const user = mockTestUsers.find((u) => u.id === 'usr-member-att-01');
      expect(user.presenceState).toBe(PresenceState.IN);
    });

    it('POST /in called a second time should be idempotent and return existing open session', async () => {
      const res = await supertest(app.server)
        .post('/api/v1/attendance/in')
        .set('Authorization', `Bearer ${activeMemberToken}`);

      expect(res.status).toBe(200);
      expect(res.body.state).toBe('IN');
      expect(res.body.isExistingSession).toBe(true);

      // Verify only ONE record was created
      const userRecords = mockAttendanceRecords.filter((r) => r.userId === 'usr-member-att-01');
      expect(userRecords.length).toBe(1);
    });

    it('GET /me should return live attendance state, active session, and today summary (200)', async () => {
      const res = await supertest(app.server)
        .get('/api/v1/attendance/me')
        .set('Authorization', `Bearer ${activeMemberToken}`);

      expect(res.status).toBe(200);
      expect(res.body.state).toBe('IN');
      expect(res.body.currentSession).not.toBeNull();
      expect(res.body.currentSession).toHaveProperty('arrivedAt');
      expect(res.body.currentSession).toHaveProperty('arrivedAtIST');
      expect(res.body.todaySummary.sessionCount).toBe(1);
    });

    it('POST /out should successfully check out employee and compute duration (200)', async () => {
      const res = await supertest(app.server)
        .post('/api/v1/attendance/out')
        .set('Authorization', `Bearer ${activeMemberToken}`);

      expect(res.status).toBe(200);
      expect(res.body.state).toBe('OUT');
      expect(res.body.presenceState).toBe('OUT');
      expect(res.body).toHaveProperty('leftAt');
      expect(res.body).toHaveProperty('leftAtIST');
      expect(res.body).toHaveProperty('durationSeconds');

      // Verify User presence was updated to OUT
      const user = mockTestUsers.find((u) => u.id === 'usr-member-att-01');
      expect(user.presenceState).toBe(PresenceState.OUT);
    });

    it('POST /out called again when already OUT should be safe and return OUT without error', async () => {
      const res = await supertest(app.server)
        .post('/api/v1/attendance/out')
        .set('Authorization', `Bearer ${activeMemberToken}`);

      expect(res.status).toBe(200);
      expect(res.body.state).toBe('OUT');
      expect(res.body.isAlreadyOut).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Multiple Attendance Periods in a Single Day
  // ---------------------------------------------------------------------------
  describe('Multiple Attendance Periods', () => {
    it('Checking in and out multiple times should record distinct sessions and accumulate total duration', async () => {
      // Session 2 check in
      const inRes = await supertest(app.server)
        .post('/api/v1/attendance/in')
        .set('Authorization', `Bearer ${activeMemberToken}`);
      expect(inRes.status).toBe(200);

      // Session 2 check out
      const outRes = await supertest(app.server)
        .post('/api/v1/attendance/out')
        .set('Authorization', `Bearer ${activeMemberToken}`);
      expect(outRes.status).toBe(200);

      // Verify today summary has 2 sessions
      const meRes = await supertest(app.server)
        .get('/api/v1/attendance/me')
        .set('Authorization', `Bearer ${activeMemberToken}`);

      expect(meRes.status).toBe(200);
      expect(meRes.body.state).toBe('OUT');
      expect(meRes.body.todaySummary.sessionCount).toBe(2);
      expect(meRes.body.recentSessions.length).toBe(2);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Attendance History API
  // ---------------------------------------------------------------------------
  describe('GET /attendance/history', () => {
    it('should return user attendance history grouped by IST calendar date (200)', async () => {
      const res = await supertest(app.server)
        .get('/api/v1/attendance/history')
        .set('Authorization', `Bearer ${activeMemberToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('history');
      expect(Array.isArray(res.body.history)).toBe(true);
      expect(res.body.history.length).toBeGreaterThanOrEqual(1);

      const dayGroup = res.body.history[0];
      expect(dayGroup).toHaveProperty('dateFormatted');
      expect(dayGroup).toHaveProperty('totalFormatted');
      expect(dayGroup.sessions.length).toBe(2);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Admin & HR Attendance Overview API
  // ---------------------------------------------------------------------------
  describe('GET /attendance/overview (Privileged Oversight)', () => {
    it('should allow ADMIN to retrieve organization-wide attendance overview (200)', async () => {
      const res = await supertest(app.server)
        .get('/api/v1/attendance/overview')
        .set('Authorization', `Bearer ${activeAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('stats');
      expect(res.body.stats).toHaveProperty('totalActiveUsers');
      expect(res.body.stats).toHaveProperty('totalPresentIn');
      expect(res.body.stats).toHaveProperty('totalPresentOut');
      expect(res.body).toHaveProperty('people');
      expect(Array.isArray(res.body.people)).toBe(true);
    });

    it('should REJECT regular MEMBER attempting to access /overview with 403 Forbidden', async () => {
      const res = await supertest(app.server)
        .get('/api/v1/attendance/overview')
        .set('Authorization', `Bearer ${activeMemberToken}`);

      expect(res.status).toBe(403);
    });
  });
});
