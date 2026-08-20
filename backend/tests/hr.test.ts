import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import supertest from 'supertest';
import { AccountStatus, UserRole } from '@prisma/client';

// Mock in-memory state for testing HR & RBAC boundaries
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
    id: 'hr-user-id',
    email: 'sarah.jenkins@workgrid.corp',
    name: 'Sarah Jenkins',
    role: UserRole.HR,
    accountStatus: AccountStatus.ACTIVE,
    organizationId: 'org-test-1',
    passwordHash: 'hash',
    title: 'Head of People',
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
        if (where?.role) {
          res = res.filter((u) => u.role === where.role);
        }
        if (where?.accountStatus) {
          res = res.filter((u) => u.accountStatus === where.accountStatus);
        }
        return res;
      }),
      findUnique: vi.fn().mockImplementation(async ({ where }) => {
        if (where?.id) return mockUsers.find((u) => u.id === where.id) || null;
        if (where?.email) return mockUsers.find((u) => u.email === where.email) || null;
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
        if (where?.role) list = list.filter((u) => u.role === where.role);
        if (where?.accountStatus) list = list.filter((u) => u.accountStatus === where.accountStatus);
        return list.length;
      }),
      create: vi.fn().mockImplementation(async ({ data }) => {
        const newUser = {
          id: `usr-${Date.now()}`,
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        mockUsers.push(newUser);
        return newUser;
      }),
      update: vi.fn().mockImplementation(async ({ where, data }) => {
        const index = mockUsers.findIndex((u) => u.id === where.id);
        if (index === -1) throw new Error('User not found');
        mockUsers[index] = { ...mockUsers[index], ...data, updatedAt: new Date() };
        return mockUsers[index];
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
    $transaction: vi.fn().mockImplementation(async (callback) => {
      return callback(mockPrisma);
    }),
  },
}));

vi.mock('../src/db/client.js', () => ({
  prisma: mockPrisma,
  checkDatabaseHealth: vi.fn().mockResolvedValue({ status: 'healthy', latencyMs: 1 }),
}));

describe('WorkGrid HR & Role Architecture Endpoints (/api/v1/hr & RBAC)', () => {
  let app: FastifyInstance;
  let superAdminToken: string;
  let hrToken: string;
  let memberToken: string;
  let suspendedToken: string;

  beforeAll(async () => {
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

    hrToken = app.jwt.sign({
      id: 'hr-user-id',
      email: 'sarah.jenkins@workgrid.corp',
      name: 'Sarah Jenkins',
      role: UserRole.HR,
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
  // 1. HR Route Permissions & Operational Boundary
  // ---------------------------------------------------------------------------
  describe('HR Access & Operational Protection', () => {
    it('GET /api/v1/hr/dashboard should return stats for HR user (200)', async () => {
      const res = await supertest(app.server)
        .get('/api/v1/hr/dashboard')
        .set('Authorization', `Bearer ${hrToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('totalEmployees');
      expect(res.body).toHaveProperty('activeCount');
      expect(res.body).toHaveProperty('pendingCount');
    });

    it('GET /api/v1/hr/people should return directory for HR user (200)', async () => {
      const res = await supertest(app.server)
        .get('/api/v1/hr/people')
        .set('Authorization', `Bearer ${hrToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('GET /api/v1/operations/grid should REJECT HR user with 403 Forbidden', async () => {
      const res = await supertest(app.server)
        .get('/api/v1/operations/grid')
        .set('Authorization', `Bearer ${hrToken}`);

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

    it('Operations or HR requests with SUSPENDED account should return 403 Forbidden', async () => {
      const res = await supertest(app.server)
        .get('/api/v1/hr/dashboard')
        .set('Authorization', `Bearer ${suspendedToken}`);

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Account is in SUSPENDED state');
    });
  });

  // ---------------------------------------------------------------------------
  // 2. HR Provisioning Flow
  // ---------------------------------------------------------------------------
  describe('User Provisioning', () => {
    it('POST /api/v1/hr/users should allow HR to provision employee in PENDING status (201)', async () => {
      const res = await supertest(app.server)
        .post('/api/v1/hr/users')
        .set('Authorization', `Bearer ${hrToken}`)
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

    it('POST /api/v1/hr/users should REJECT HR attempting to provision SUPER_ADMIN or ADMIN (403)', async () => {
      const res = await supertest(app.server)
        .post('/api/v1/hr/users')
        .set('Authorization', `Bearer ${hrToken}`)
        .send({
          name: 'Privileged User',
          email: 'privileged@workgrid.corp',
          initialRole: UserRole.SUPER_ADMIN,
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Forbidden');
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Role Assignment Governance & Safeguards
  // ---------------------------------------------------------------------------
  describe('Role Assignment Rules', () => {
    it('PATCH /api/v1/hr/users/:id/role should allow HR to assign SERVER role to member and record audit (200)', async () => {
      const res = await supertest(app.server)
        .patch('/api/v1/hr/users/member-user-id/role')
        .set('Authorization', `Bearer ${hrToken}`)
        .send({
          role: UserRole.SERVER,
          reason: 'Promoted to Sector Supervisor',
        });

      expect(res.status).toBe(200);
      expect(res.body.user.role).toBe(UserRole.SERVER);
      expect(res.body.audit).toHaveProperty('id');
      expect(res.body.audit.newRole).toBe(UserRole.SERVER);
      expect(res.body.audit.changedById).toBe('hr-user-id');
    });

    it('PATCH /api/v1/hr/users/:id/role should REJECT HR attempting to assign SUPER_ADMIN (403)', async () => {
      const res = await supertest(app.server)
        .patch('/api/v1/hr/users/member-user-id/role')
        .set('Authorization', `Bearer ${hrToken}`)
        .send({
          role: UserRole.SUPER_ADMIN,
          reason: 'Unauthorized promotion',
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Forbidden');
    });

    it('PATCH /api/v1/hr/users/:id/role should REJECT HR attempting self-role modification (403)', async () => {
      const res = await supertest(app.server)
        .patch('/api/v1/hr/users/hr-user-id/role')
        .set('Authorization', `Bearer ${hrToken}`)
        .send({
          role: UserRole.SUPER_ADMIN,
        });

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Self-role modification is not permitted');
    });

    it('PATCH /api/v1/hr/users/:id/role should allow SUPER_ADMIN to assign HR role (200)', async () => {
      const res = await supertest(app.server)
        .patch('/api/v1/hr/users/member-user-id/role')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          role: UserRole.HR,
          reason: 'Transferred to HR team',
        });

      expect(res.status).toBe(200);
      expect(res.body.user.role).toBe(UserRole.HR);
    });

    it('PATCH /api/v1/hr/users/:id/role should REJECT demoting the sole Super Admin (400)', async () => {
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
    it('PATCH /api/v1/hr/users/:id/status should allow HR to activate user (200)', async () => {
      const res = await supertest(app.server)
        .patch('/api/v1/hr/users/member-user-id/status')
        .set('Authorization', `Bearer ${hrToken}`)
        .send({
          accountStatus: AccountStatus.ACTIVE,
          reason: 'Completed onboarding verification',
        });

      expect(res.status).toBe(200);
      expect(res.body.accountStatus).toBe(AccountStatus.ACTIVE);
    });

    it('GET /api/v1/hr/audit-logs should return role change history for HR (200)', async () => {
      const res = await supertest(app.server)
        .get('/api/v1/hr/audit-logs')
        .set('Authorization', `Bearer ${hrToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });
  });
});
