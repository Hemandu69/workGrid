import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import supertest from 'supertest';
import bcrypt from 'bcryptjs';

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    user: {
      findUnique: vi.fn().mockImplementation(async ({ where }) => {
        if (where.email === 'sarah.connor@workgrid.corp') {
          return {
            id: 'member-1-id',
            email: 'sarah.connor@workgrid.corp',
            passwordHash: await bcrypt.hash('password123', 4),
            name: 'Sarah Connor',
            role: 'MEMBER',
            organizationId: 'org-1',
            roomId: 'room-b-id',
            subroomId: 'subroom-b3-id',
            capacityLimitHours: 35,
            currentAllocatedHours: 28,
          };
        }
        return null;
      }),
    },
  },
}));

vi.mock('../src/db/client.js', () => ({
  prisma: mockPrisma,
  checkDatabaseHealth: vi.fn().mockResolvedValue({ status: 'healthy', latencyMs: 1 }),
}));

describe('Auth Endpoints (/api/v1/auth)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /api/v1/auth/login should authenticate valid credentials with 200 and token', async () => {
    const res = await supertest(app.server)
      .post('/api/v1/auth/login')
      .send({
        email: 'sarah.connor@workgrid.corp',
        password: 'password123',
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user).toHaveProperty('email', 'sarah.connor@workgrid.corp');
  });

  it('POST /api/v1/auth/login should reject invalid credentials with 401', async () => {
    const res = await supertest(app.server)
      .post('/api/v1/auth/login')
      .send({
        email: 'nonexistent@workgrid.corp',
        password: 'wrongpassword',
      });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Unauthorized');
  });

  it('POST /api/v1/auth/login should validate request body schema with 400', async () => {
    const res = await supertest(app.server)
      .post('/api/v1/auth/login')
      .send({
        email: 'not-an-email',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Bad Request');
  });

  it('GET /api/v1/auth/me should reject unauthenticated requests with 401', async () => {
    const res = await supertest(app.server).get('/api/v1/auth/me');

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Unauthorized');
  });
});
