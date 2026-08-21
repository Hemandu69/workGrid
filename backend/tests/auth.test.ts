import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import supertest from 'supertest';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { AccountStatus, UserRole } from '@prisma/client';

const mockTestUsers: any[] = [];
const mockAuditEvents: any[] = [];
const mockPasswordResetTokens: any[] = [];

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
      create: vi.fn().mockImplementation(async ({ data }) => {
        const newUser = {
          id: `usr-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          ...data,
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        mockTestUsers.push(newUser);
        return newUser;
      }),
      update: vi.fn().mockImplementation(async ({ where, data }) => {
        const index = mockTestUsers.findIndex((u) => u.id === where.id);
        if (index === -1) throw new Error('User not found');
        if (data.version?.increment) {
          mockTestUsers[index].version += data.version.increment;
          delete data.version;
        }
        mockTestUsers[index] = { ...mockTestUsers[index], ...data, updatedAt: new Date() };
        return mockTestUsers[index];
      }),
    },
    organization: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'org-test-1',
        name: 'WorkGrid Corp',
        slug: 'workgrid',
      }),
    },
    auditEvent: {
      create: vi.fn().mockImplementation(async ({ data }) => {
        const event = { id: `audit-${Date.now()}`, ...data, createdAt: new Date() };
        mockAuditEvents.push(event);
        return event;
      }),
    },
    passwordResetToken: {
      create: vi.fn().mockImplementation(async ({ data }) => {
        const token = { id: `prt-${Date.now()}`, ...data, usedAt: null, createdAt: new Date() };
        mockPasswordResetTokens.push(token);
        return token;
      }),
      findFirst: vi.fn().mockImplementation(async ({ where }) => {
        return (
          mockPasswordResetTokens.find((t) => {
            if (where.tokenHash && t.tokenHash !== where.tokenHash) return false;
            if (where.usedAt === null && t.usedAt !== null) return false;
            return true;
          }) || null
        );
      }),
      update: vi.fn().mockImplementation(async ({ where, data }) => {
        const index = mockPasswordResetTokens.findIndex((t) => t.id === where.id);
        if (index !== -1) {
          mockPasswordResetTokens[index] = { ...mockPasswordResetTokens[index], ...data };
          return mockPasswordResetTokens[index];
        }
        return null;
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

describe('WorkGrid Real Authentication & Session Endpoints (/api/v1/auth)', () => {
  let app: FastifyInstance;
  let activeUserToken: string;
  let activeUserCookie: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    // Populate mock test users
    const defaultHash = await bcrypt.hash('password123', 4);

    mockTestUsers.push(
      {
        id: 'usr-active-01',
        organizationId: 'org-test-1',
        email: 'sarah.connor@workgrid.corp',
        passwordHash: defaultHash,
        name: 'Sarah Connor',
        role: UserRole.MEMBER,
        accountStatus: AccountStatus.ACTIVE,
        version: 1,
        capacityLimitHours: 35,
        currentAllocatedHours: 28,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'usr-pending-01',
        organizationId: 'org-test-1',
        email: 'pending.user@workgrid.corp',
        passwordHash: defaultHash,
        name: 'Pending User',
        role: null,
        accountStatus: AccountStatus.PENDING,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'usr-suspended-01',
        organizationId: 'org-test-1',
        email: 'suspended.user@workgrid.corp',
        passwordHash: defaultHash,
        name: 'Suspended User',
        role: UserRole.MEMBER,
        accountStatus: AccountStatus.SUSPENDED,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'usr-deactivated-01',
        organizationId: 'org-test-1',
        email: 'deactivated.user@workgrid.corp',
        passwordHash: defaultHash,
        name: 'Deactivated User',
        role: UserRole.MEMBER,
        accountStatus: AccountStatus.DEACTIVATED,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    );
  });

  afterAll(async () => {
    await app.close();
  });

  // ---------------------------------------------------------------------------
  // 1. POST /api/v1/auth/login
  // ---------------------------------------------------------------------------
  describe('Login & Account Status Governance', () => {
    it('POST /login should authenticate active user, return token and set HttpOnly cookie (200)', async () => {
      const res = await supertest(app.server)
        .post('/api/v1/auth/login')
        .send({
          email: 'Sarah.Connor@WorkGrid.Corp', // testing email case-insensitivity
          password: 'password123',
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('token');
      expect(res.body.user).toHaveProperty('email', 'sarah.connor@workgrid.corp');
      expect(res.body.user).toHaveProperty('accountStatus', 'ACTIVE');
      expect(res.body.user).not.toHaveProperty('passwordHash');

      // Verify HttpOnly cookie header
      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      expect(cookies[0]).toContain('wg_auth_token=');
      expect(cookies[0]).toContain('HttpOnly');

      activeUserToken = res.body.token;
      activeUserCookie = cookies[0].split(';')[0];
    });

    it('POST /login should ALLOW user with PENDING account status to log in (200)', async () => {
      const res = await supertest(app.server)
        .post('/api/v1/auth/login')
        .send({
          email: 'pending.user@workgrid.corp',
          password: 'password123',
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('token');
      expect(res.body.user).toHaveProperty('accountStatus', 'PENDING');
      expect(res.body.user.role).toBeUndefined();

      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      expect(cookies[0]).toContain('wg_auth_token=');
    });

    it('POST /login should REJECT user with SUSPENDED account status with 403 Forbidden', async () => {
      const res = await supertest(app.server)
        .post('/api/v1/auth/login')
        .send({
          email: 'suspended.user@workgrid.corp',
          password: 'password123',
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Forbidden');
      expect(res.body.message).toContain('Account is suspended');
    });

    it('POST /login should REJECT user with DEACTIVATED account status with 403 Forbidden', async () => {
      const res = await supertest(app.server)
        .post('/api/v1/auth/login')
        .send({
          email: 'deactivated.user@workgrid.corp',
          password: 'password123',
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Forbidden');
      expect(res.body.message).toContain('Account is deactivated');
    });

    it('POST /login should REJECT invalid password with 401 Unauthorized', async () => {
      const res = await supertest(app.server)
        .post('/api/v1/auth/login')
        .send({
          email: 'sarah.connor@workgrid.corp',
          password: 'wrongpassword',
        });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
    });

    it('POST /login should REJECT unknown email with 401 Unauthorized', async () => {
      const res = await supertest(app.server)
        .post('/api/v1/auth/login')
        .send({
          email: 'nonexistent@workgrid.corp',
          password: 'password123',
        });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
    });
  });

  // ---------------------------------------------------------------------------
  // 2. POST /api/v1/auth/register (Safe Onboarding)
  // ---------------------------------------------------------------------------
  describe('Public Registration Safety', () => {
    it('POST /register should create account with null/UNASSIGNED role and PENDING status (201)', async () => {
      const res = await supertest(app.server)
        .post('/api/v1/auth/register')
        .send({
          name: 'Alex Developer',
          email: 'alex.dev@workgrid.corp',
          password: 'password123',
          title: 'Frontend Engineer',
        });

      expect(res.status).toBe(201);
      expect(res.body.user.role).toBeNull();
      expect(res.body.user).toHaveProperty('accountStatus', AccountStatus.PENDING);
    });

    it('POST /register should IGNORE client-provided role and organization elevation (e.g. SUPER_ADMIN)', async () => {
      const res = await supertest(app.server)
        .post('/api/v1/auth/register')
        .send({
          name: 'Hacker User',
          email: 'hacker@workgrid.corp',
          password: 'password123',
          role: 'SUPER_ADMIN',
          accountStatus: 'ACTIVE',
          organizationId: 'malicious-org',
        });

      expect(res.status).toBe(201);
      expect(res.body.user.role).toBeNull();
      expect(res.body.user.accountStatus).toBe(AccountStatus.PENDING);
    });

    it('POST /register should reject duplicate email with 400', async () => {
      const res = await supertest(app.server)
        .post('/api/v1/auth/register')
        .send({
          name: 'Duplicate Sarah',
          email: 'sarah.connor@workgrid.corp',
          password: 'password123',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('already exists');
    });
  });

  // ---------------------------------------------------------------------------
  // 3. GET /api/v1/auth/me & Dynamic Session Invalidation
  // ---------------------------------------------------------------------------
  describe('Current User Lookup & Dynamic Session Verification', () => {
    it('GET /me with valid cookie should return safe user profile (200)', async () => {
      const res = await supertest(app.server)
        .get('/api/v1/auth/me')
        .set('Cookie', activeUserCookie);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('usr-active-01');
      expect(res.body.email).toBe('sarah.connor@workgrid.corp');
      expect(res.body).not.toHaveProperty('passwordHash');
      expect(res.body).not.toHaveProperty('passwordResetToken');
    });

    it('GET /me with Bearer token header should also return profile (200)', async () => {
      const res = await supertest(app.server)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${activeUserToken}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('usr-active-01');
    });

    it('GET /me without credentials should return 401 Unauthorized', async () => {
      const res = await supertest(app.server).get('/api/v1/auth/me');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
    });

    it('Active user subsequently SUSPENDED in DB should immediately be rejected on existing session (403)', async () => {
      // Simulate HR suspending the active user in the database
      const userIndex = mockTestUsers.findIndex((u) => u.id === 'usr-active-01');
      mockTestUsers[userIndex].accountStatus = AccountStatus.SUSPENDED;

      const res = await supertest(app.server)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${activeUserToken}`);

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Account is in SUSPENDED state');

      // Restore user to ACTIVE
      mockTestUsers[userIndex].accountStatus = AccountStatus.ACTIVE;
    });
  });

  // ---------------------------------------------------------------------------
  // 4. POST /api/v1/auth/logout
  // ---------------------------------------------------------------------------
  describe('Logout', () => {
    it('POST /logout should clear HttpOnly session cookie (200)', async () => {
      const res = await supertest(app.server)
        .post('/api/v1/auth/logout')
        .set('Cookie', activeUserCookie);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Logged out successfully');

      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      expect(cookies[0]).toContain('wg_auth_token=;');
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Password Reset Flow
  // ---------------------------------------------------------------------------
  describe('Password Reset Token Architecture', () => {
    it('POST /forgot-password should generate secure reset token', async () => {
      const res = await supertest(app.server)
        .post('/api/v1/auth/forgot-password')
        .send({
          email: 'sarah.connor@workgrid.corp',
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('message');
      expect(res.body).toHaveProperty('resetToken');

      const resetToken = res.body.resetToken;

      // Reset password using the raw token
      const resetRes = await supertest(app.server)
        .post('/api/v1/auth/reset-password')
        .send({
          token: resetToken,
          newPassword: 'newPassword123!',
        });

      expect(resetRes.status).toBe(200);
      expect(resetRes.body.message).toContain('Password has been reset successfully');

      // Attempting to reuse the token should fail
      const reuseRes = await supertest(app.server)
        .post('/api/v1/auth/reset-password')
        .send({
          token: resetToken,
          newPassword: 'anotherPassword123!',
        });

      expect(reuseRes.status).toBe(400);
    });
  });

  // ---------------------------------------------------------------------------
  // 6. CORS & Cookie Header Governance
  // ---------------------------------------------------------------------------
  describe('CORS & Cookie Governance', () => {
    it('OPTIONS /api/v1/auth/login should respond with valid CORS headers and allow credentials', async () => {
      const res = await supertest(app.server)
        .options('/api/v1/auth/login')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'POST');

      expect(res.status).toBe(204);
      expect(res.headers['access-control-allow-credentials']).toBe('true');
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    });

    it('GET /api/v1/auth/me should reject request without auth token with safe 401', async () => {
      const res = await supertest(app.server)
        .get('/api/v1/auth/me');

      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Authentication token required.');
    });
  });
});
