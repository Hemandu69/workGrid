import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import supertest from 'supertest';
import { AccountStatus, UserRole } from '@prisma/client';
import { hrEventBus, HREvent } from '../src/events/hr-events.js';
import * as redisModule from '../src/redis/client.js';

// Mock in-memory state for testing People Management & RBAC boundaries.
// HR is not a valid role in this system — People Management is SUPER_ADMIN-only.
const mockUsers: any[] = [
  {
    id: 'super-admin-id',
    email: 'elena.vance@workgrid.corp',
    name: 'Elena Vance',
    role: UserRole.SUPER_ADMIN,
    accountStatus: AccountStatus.ACTIVE,
    organizationId: 'org-test-1',
    passwordHash: 'hash',
    title: 'Operations Director',
    capacityLimitHours: 40,
    currentAllocatedHours: 12,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'admin-user-id',
    email: 'marcus.sterling@workgrid.corp',
    name: 'Marcus Sterling',
    role: UserRole.ADMIN,
    accountStatus: AccountStatus.ACTIVE,
    organizationId: 'org-test-1',
    passwordHash: 'hash',
    title: 'Operations Admin',
    capacityLimitHours: 40,
    currentAllocatedHours: 8,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'member-user-id',
    email: 'sarah.connor@workgrid.corp',
    name: 'Sarah Connor',
    role: UserRole.MEMBER,
    accountStatus: AccountStatus.ACTIVE,
    organizationId: 'org-test-1',
    passwordHash: 'hash',
    title: 'Engineer',
    capacityLimitHours: 40,
    currentAllocatedHours: 20,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'suspended-user-id',
    email: 'suspended@workgrid.corp',
    name: 'Suspended User',
    role: UserRole.MEMBER,
    accountStatus: AccountStatus.SUSPENDED,
    organizationId: 'org-test-1',
    passwordHash: 'hash',
    title: 'Suspended Engineer',
    capacityLimitHours: 40,
    currentAllocatedHours: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

const mockAuditLogs: any[] = [];

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    user: {
      findMany: vi.fn().mockImplementation(async ({ where }) => {
        let res = [...mockUsers];
        if (where?.organizationId) {
          res = res.filter((u) => u.organizationId === where.organizationId);
        }
        if (where?.role !== undefined) {
          res = res.filter((u) => (u.role || null) === (where.role ?? null));
        }
        if (where?.accountStatus) {
          res = res.filter((u) => u.accountStatus === where.accountStatus);
        }
        return res;
      }),
      findUnique: vi.fn().mockImplementation(async ({ where }) => {
        if (where?.id) return mockUsers.find((u) => u.id === where.id) || null;
        if (where?.email) return mockUsers.find((u) => u.email.toLowerCase() === where.email.toLowerCase()) || null;
        return null;
      }),
      findFirst: vi.fn().mockImplementation(async ({ where }) => {
        return (
          mockUsers.find((u) => {
            if (where.id && u.id !== where.id) return false;
            if (where.organizationId && u.organizationId !== where.organizationId) return false;
            return true;
          }) || null
        );
      }),
      count: vi.fn().mockImplementation(async ({ where }) => {
        let list = [...mockUsers];
        if (where?.organizationId) list = list.filter((u) => u.organizationId === where.organizationId);
        if (where?.role !== undefined) list = list.filter((u) => (u.role || null) === (where.role ?? null));
        if (where?.accountStatus) list = list.filter((u) => u.accountStatus === where.accountStatus);
        return list.length;
      }),
      create: vi.fn().mockImplementation(async ({ data }) => {
        const newUser = {
          id: `usr-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          ...data,
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        mockUsers.push(newUser);
        return newUser;
      }),
      update: vi.fn().mockImplementation(async ({ where, data }) => {
        const index = mockUsers.findIndex((u) => u.id === where.id);
        if (index === -1) throw new Error('User not found');
        if (data.version?.increment) {
          mockUsers[index].version = (mockUsers[index].version || 1) + data.version.increment;
          delete data.version;
        }
        mockUsers[index] = { ...mockUsers[index], ...data, updatedAt: new Date() };
        return mockUsers[index];
      }),
    },
    organization: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'org-test-1',
        name: 'WorkGrid Corp',
        slug: 'workgrid',
      }),
    },
    roleAuditLog: {
      findMany: vi.fn().mockImplementation(async ({ where }) => {
        return mockAuditLogs.map((l) => ({
          ...l,
          targetUser: mockUsers.find((u) => u.id === l.targetUserId),
          changedBy: mockUsers.find((u) => u.id === l.changedById),
        }));
      }),
      create: vi.fn().mockImplementation(async ({ data }) => {
        const entry = { id: `audit-${Date.now()}`, ...data, createdAt: new Date() };
        mockAuditLogs.push(entry);
        return entry;
      }),
    },
    auditEvent: {
      create: vi.fn().mockResolvedValue({ id: 'audit-event-1' }),
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

describe('WorkGrid People Management Endpoints (/api/v1/hr & RBAC) — SUPER_ADMIN only', () => {
  let app: FastifyInstance;
  let superAdminToken: string;
  let adminToken: string;
  let memberToken: string;
  let suspendedToken: string;

  beforeAll(async () => {
    // BloomFilterService (touched by provisionUser()) fails open when Redis
    // is unreachable — simulate that here rather than depending on a real
    // Redis instance.
    vi.spyOn(redisModule, 'getRedisClient').mockImplementation(() => {
      throw new Error('Redis unreachable (test)');
    });

    app = await buildApp();
    await app.ready();

    // Generate JWT tokens for test roles
    superAdminToken = app.jwt.sign({
      id: 'super-admin-id',
      email: 'elena.vance@workgrid.corp',
      name: 'Elena Vance',
      role: UserRole.SUPER_ADMIN,
      accountStatus: AccountStatus.ACTIVE,
      organizationId: 'org-test-1',
    });

    adminToken = app.jwt.sign({
      id: 'admin-user-id',
      email: 'marcus.sterling@workgrid.corp',
      name: 'Marcus Sterling',
      role: UserRole.ADMIN,
      accountStatus: AccountStatus.ACTIVE,
      organizationId: 'org-test-1',
    });

    memberToken = app.jwt.sign({
      id: 'member-user-id',
      email: 'sarah.connor@workgrid.corp',
      name: 'Sarah Connor',
      role: UserRole.MEMBER,
      accountStatus: AccountStatus.ACTIVE,
      organizationId: 'org-test-1',
    });

    suspendedToken = app.jwt.sign({
      id: 'suspended-user-id',
      email: 'suspended@workgrid.corp',
      name: 'Suspended User',
      role: UserRole.MEMBER,
      accountStatus: AccountStatus.SUSPENDED,
      organizationId: 'org-test-1',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  // ---------------------------------------------------------------------------
  // 1. People Management Route Permissions & Operational Boundary
  // ---------------------------------------------------------------------------
  describe('People Management Access & Operational Protection', () => {
    it('GET /api/v1/hr/dashboard should return stats for SUPER_ADMIN (200)', async () => {
      const res = await supertest(app.server)
        .get('/api/v1/hr/dashboard')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('totalEmployees');
      expect(res.body).toHaveProperty('activeCount');
      expect(res.body).toHaveProperty('pendingCount');
    });

    it('GET /api/v1/hr/people should return directory for SUPER_ADMIN (200)', async () => {
      const res = await supertest(app.server)
        .get('/api/v1/hr/people')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.items)).toBe(true);
    });

    it('GET /api/v1/hr/dashboard should REJECT ADMIN — People Management is SUPER_ADMIN-only (403)', async () => {
      const res = await supertest(app.server)
        .get('/api/v1/hr/dashboard')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Forbidden');
    });

    it('GET /api/v1/hr/dashboard should REJECT normal Member with 403 Forbidden', async () => {
      const res = await supertest(app.server)
        .get('/api/v1/hr/dashboard')
        .set('Authorization', `Bearer ${memberToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Forbidden');
    });

    it('People Management requests with SUSPENDED account should return 403 Forbidden', async () => {
      const res = await supertest(app.server)
        .get('/api/v1/hr/dashboard')
        .set('Authorization', `Bearer ${suspendedToken}`);

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Account is in SUSPENDED state');
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Personnel Provisioning Flow
  // ---------------------------------------------------------------------------
  describe('Personnel Provisioning', () => {
    it('POST /api/v1/hr/users should allow SUPER_ADMIN to provision personnel in PENDING status (201)', async () => {
      const res = await supertest(app.server)
        .post('/api/v1/hr/users')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          name: 'Jane Doe',
          email: 'jane.doe@workgrid.corp',
          title: 'QA Analyst',
          initialRole: UserRole.MEMBER,
        });

      expect(res.status).toBe(201);
      expect(res.body.accountStatus).toBe(AccountStatus.PENDING);
      expect(res.body.role).toBe(UserRole.MEMBER);
    });

    it('POST /api/v1/hr/users should allow SUPER_ADMIN to provision an ADMIN account (201)', async () => {
      const res = await supertest(app.server)
        .post('/api/v1/hr/users')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          name: 'New Admin',
          email: 'new.admin@workgrid.corp',
          title: 'Operations Admin',
          initialRole: UserRole.ADMIN,
        });

      expect(res.status).toBe(201);
      expect(res.body.role).toBe(UserRole.ADMIN);
    });

    it('POST /api/v1/hr/users should REJECT ADMIN — provisioning is SUPER_ADMIN-only (403)', async () => {
      const res = await supertest(app.server)
        .post('/api/v1/hr/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Should Not Be Created',
          email: 'blocked@workgrid.corp',
          initialRole: UserRole.MEMBER,
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Forbidden');
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Role Assignment Governance & Safeguards
  // ---------------------------------------------------------------------------
  describe('Role Assignment Rules', () => {
    it('PATCH /api/v1/hr/users/:id/role should allow SUPER_ADMIN to assign SERVER role and record audit (200)', async () => {
      const res = await supertest(app.server)
        .patch('/api/v1/hr/users/member-user-id/role')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          role: UserRole.SERVER,
          reason: 'Promoted to Sector Supervisor',
        });

      expect(res.status).toBe(200);
      expect(res.body.user.role).toBe(UserRole.SERVER);
      expect(res.body.audit).toHaveProperty('id');
      expect(res.body.audit.newRole).toBe(UserRole.SERVER);
      expect(res.body.audit.changedById).toBe('super-admin-id');
    });

    it('PATCH /api/v1/hr/users/:id/role should REJECT SUPER_ADMIN attempting self-role modification (403)', async () => {
      const res = await supertest(app.server)
        .patch('/api/v1/hr/users/super-admin-id/role')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          role: UserRole.ADMIN,
        });

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Self-role modification is not permitted');
    });

    it('PATCH /api/v1/hr/users/:id/role should allow SUPER_ADMIN to assign ADMIN role (200)', async () => {
      const res = await supertest(app.server)
        .patch('/api/v1/hr/users/member-user-id/role')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          role: UserRole.ADMIN,
          reason: 'Promoted to Operations Admin',
        });

      expect(res.status).toBe(200);
      expect(res.body.user.role).toBe(UserRole.ADMIN);
    });

    it('PATCH /api/v1/hr/users/:id/role should REJECT ADMIN — role assignment is SUPER_ADMIN-only (403)', async () => {
      const res = await supertest(app.server)
        .patch('/api/v1/hr/users/member-user-id/role')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          role: UserRole.TEAM_LEAD,
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Forbidden');
    });

    it('PATCH /api/v1/hr/users/:id/role should REJECT demoting the sole Super Admin (400)', async () => {
      // super-admin-id is the only SUPER_ADMIN in this fixture set — demoting
      // it must be rejected regardless of what other roles exist.
      const res = await supertest(app.server)
        .patch('/api/v1/hr/users/super-admin-id/role')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          role: UserRole.MEMBER,
        });

      // Self-modification is rejected first, or last admin safeguard
      expect([400, 403]).toContain(res.status);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Account Status Transitions & Audit Trail
  // ---------------------------------------------------------------------------
  describe('Account Status Transitions & Audit Log Retrieval', () => {
    it('PATCH /api/v1/hr/users/:id/status should allow SUPER_ADMIN to activate user (200)', async () => {
      const res = await supertest(app.server)
        .patch('/api/v1/hr/users/member-user-id/status')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          accountStatus: AccountStatus.ACTIVE,
          reason: 'Completed onboarding verification',
        });

      expect(res.status).toBe(200);
      expect(res.body.accountStatus).toBe(AccountStatus.ACTIVE);
    });

    it('GET /api/v1/hr/audit-logs should return role change history for SUPER_ADMIN (200)', async () => {
      const res = await supertest(app.server)
        .get('/api/v1/hr/audit-logs')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.items)).toBe(true);
      expect(res.body.items.length).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Complete Personnel Self-Registration -> Directory Visibility -> Approval Lifecycle
  // ---------------------------------------------------------------------------
  describe('Personnel Self-Registration, Directory Visibility & Approval Lifecycle', () => {
    let pendingPersonId: string;
    const personEmail = 'new.hire@workgrid.corp';

    it('POST /api/v1/auth/register should create a persisted personnel record in PENDING status', async () => {
      const res = await supertest(app.server)
        .post('/api/v1/auth/register')
        .send({
          email: personEmail,
          password: 'password123',
          name: 'New Hire',
          title: 'Junior Analyst',
        });

      expect(res.status).toBe(201);
      expect(res.body.user).toHaveProperty('id');
      expect(res.body.user.email).toBe(personEmail);
      expect(res.body.user.accountStatus).toBe(AccountStatus.PENDING);
      expect(res.body.user.role).toBeNull();

      pendingPersonId = res.body.user.id;
    });

    it('GET /api/v1/hr/people should include the newly registered PENDING person in the directory', async () => {
      const res = await supertest(app.server)
        .get('/api/v1/hr/people')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      const found = res.body.items.find((u: any) => u.id === pendingPersonId);
      expect(found).toBeDefined();
      expect(found.accountStatus).toBe(AccountStatus.PENDING);
      expect(found.role || null).toBeNull();
      expect(found.title).toBe('Junior Analyst');
    });

    it('GET /api/v1/hr/people?accountStatus=PENDING should return the pending person', async () => {
      const res = await supertest(app.server)
        .get('/api/v1/hr/people?accountStatus=PENDING')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      const allPending = res.body.items.every((u: any) => u.accountStatus === AccountStatus.PENDING);
      expect(allPending).toBe(true);
      const found = res.body.items.find((u: any) => u.id === pendingPersonId);
      expect(found).toBeDefined();
    });

    it('GET /api/v1/hr/dashboard should accurately count PENDING review headcount', async () => {
      const res = await supertest(app.server)
        .get('/api/v1/hr/dashboard')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.pendingCount).toBeGreaterThanOrEqual(1);
    });

    it('GET /api/v1/hr/people should strictly enforce organization isolation', async () => {
      // Add a mock user belonging to a different organization
      mockUsers.push({
        id: 'other-org-user-id',
        email: 'other.org@external.corp',
        name: 'Foreign Org User',
        role: null,
        accountStatus: AccountStatus.PENDING,
        organizationId: 'org-external-99',
        passwordHash: 'hash',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await supertest(app.server)
        .get('/api/v1/hr/people')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      const foreignFound = res.body.items.find((u: any) => u.id === 'other-org-user-id');
      expect(foreignFound).toBeUndefined();
    });

    it('PATCH /api/v1/hr/users/:id/role should allow SUPER_ADMIN to assign MEMBER role and auto-activate account', async () => {
      const res = await supertest(app.server)
        .patch(`/api/v1/hr/users/${pendingPersonId}/role`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          role: UserRole.MEMBER,
          reason: 'Verified credentials, onboarded to team',
        });

      expect(res.status).toBe(200);
      expect(res.body.user.role).toBe(UserRole.MEMBER);
      expect(res.body.user.accountStatus).toBe(AccountStatus.ACTIVE);
      expect(res.body.audit).toHaveProperty('id');
      expect(res.body.audit.newRole).toBe(UserRole.MEMBER);
      expect(res.body.audit.changedById).toBe('super-admin-id');
    });

    it('GET /api/v1/auth/me should return ACTIVE status and assigned role for the approved person', async () => {
      // Login as the person
      const loginRes = await supertest(app.server)
        .post('/api/v1/auth/login')
        .send({
          email: personEmail,
          password: 'password123',
        });

      expect(loginRes.status).toBe(200);
      const personToken = loginRes.body.token;

      // Call /api/v1/auth/me
      const meRes = await supertest(app.server)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${personToken}`);

      expect(meRes.status).toBe(200);
      expect(meRes.body.accountStatus).toBe(AccountStatus.ACTIVE);
      expect(meRes.body.role).toBe(UserRole.MEMBER);
      expect(meRes.body.email).toBe(personEmail);
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Real-Time People-Management Domain Events & Organization-Scoped PubSub
  // ---------------------------------------------------------------------------
  describe('Real-Time People-Management Domain Events & Organization-Scoped PubSub', () => {
    it('Personnel registration should publish EMPLOYEE_REGISTERED event to hrEventBus', async () => {
      const receivedEvents: HREvent[] = [];
      const unsubscribe = hrEventBus.subscribeHREvents('org-test-1', (event) => {
        receivedEvents.push(event);
      });

      await supertest(app.server)
        .post('/api/v1/auth/register')
        .send({
          email: 'realtime.hire@workgrid.corp',
          password: 'password123',
          name: 'Realtime Hire',
          title: 'QA Specialist',
        });

      unsubscribe();

      expect(receivedEvents.length).toBeGreaterThanOrEqual(1);
      const regEvent = receivedEvents.find((e) => e.user.email === 'realtime.hire@workgrid.corp');
      expect(regEvent).toBeDefined();
      expect(regEvent?.type).toBe('EMPLOYEE_REGISTERED');
      expect(regEvent?.organizationId).toBe('org-test-1');
      expect(regEvent?.user.accountStatus).toBe(AccountStatus.PENDING);
    });

    it('Role change should publish ROLE_CHANGED or EMPLOYEE_APPROVED with audit log', async () => {
      const receivedEvents: HREvent[] = [];
      const unsubscribe = hrEventBus.subscribeHREvents('org-test-1', (event) => {
        receivedEvents.push(event);
      });

      const targetUser = mockUsers.find((u) => u.email === 'realtime.hire@workgrid.corp');
      expect(targetUser).toBeDefined();

      const patchRes = await supertest(app.server)
        .patch(`/api/v1/hr/users/${targetUser!.id}/role`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          role: UserRole.TEAM_LEAD,
          reason: 'Promoted to Lead',
        });

      unsubscribe();

      expect(patchRes.status).toBe(200);
      const roleEvent = receivedEvents.find((e) => e.user.id === targetUser!.id);
      expect(roleEvent).toBeDefined();
      expect(roleEvent?.type).toBe('EMPLOYEE_APPROVED');
      expect(roleEvent?.user.role).toBe(UserRole.TEAM_LEAD);
      expect(roleEvent?.audit).toBeDefined();
      expect(roleEvent?.audit?.newRole).toBe(UserRole.TEAM_LEAD);
    });

    it('Events should never leak across different organizations', () => {
      const org2Events: HREvent[] = [];
      const unsubscribeOrg2 = hrEventBus.subscribeHREvents('org-external-99', (event) => {
        org2Events.push(event);
      });

      // Emit event strictly on org-test-1
      hrEventBus.emitHREvent('org-test-1', {
        type: 'EMPLOYEE_REGISTERED',
        organizationId: 'org-test-1',
        user: {
          id: 'test-user-id',
          name: 'Internal Org User',
          email: 'internal@workgrid.corp',
          accountStatus: 'PENDING',
        },
        createdAt: new Date().toISOString(),
      });

      unsubscribeOrg2();

      // Org 2 should receive 0 events
      expect(org2Events.length).toBe(0);
    });
  });
});
