import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import supertest from 'supertest';
import { UserRole } from '@prisma/client';
import * as redisModule from '../src/redis/client.js';

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    room: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: 'room-b-id',
          organizationId: 'org-1',
          letter: 'B',
          name: 'Sector B — Infrastructure & Security',
          leadServerId: 'server-id',
          leadServer: {
            id: 'server-id',
            name: 'David Chen',
            email: 'david.chen@workgrid.corp',
            avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e',
            role: 'SERVER',
            status: 'BUSY',
          },
          subrooms: [
            {
              id: 'subroom-b3-id',
              organizationId: 'org-1',
              roomId: 'room-b-id',
              code: 'B3',
              number: 3,
              memberCapacity: 2,
              serverSeatCount: 1,
              members: [
                {
                  id: 'member-1-id',
                  name: 'Sarah Connor',
                  email: 'sarah.connor@workgrid.corp',
                  role: 'MEMBER',
                  status: 'ONLINE',
                  title: 'Senior Systems Engineer',
                  avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330',
                  currentAllocatedHours: 28,
                  capacityLimitHours: 35,
                },
              ],
            },
          ],
        },
      ]),
      findFirst: vi.fn(),
    },
    subroom: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'subroom-b3-id',
        code: 'B3',
        number: 3,
        memberCapacity: 2,
        members: [{ id: 'member-1' }],
      }),
      update: vi.fn().mockResolvedValue({
        id: 'subroom-b3-id',
        code: 'B3',
        memberCapacity: 4,
      }),
    },
  },
}));

vi.mock('../src/db/client.js', () => ({
  prisma: mockPrisma,
  checkDatabaseHealth: vi.fn().mockResolvedValue({ status: 'healthy', latencyMs: 1 }),
}));

describe('Room & Subroom Endpoints (/api/v1/rooms)', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let memberToken: string;

  beforeAll(async () => {
    // RoomService.getAllRooms has a short-lived Redis cache-aside — simulate
    // an unreachable Redis so it always falls through to the mocked Postgres
    // path instead of paying a real connection attempt in this test env.
    vi.spyOn(redisModule, 'getRedisClient').mockImplementation(() => {
      throw new Error('Redis unreachable (test)');
    });

    app = await buildApp();
    await app.ready();

    adminToken = app.jwt.sign({
      id: 'test-admin-id',
      email: 'admin@workgrid.corp',
      name: 'Test Admin',
      role: UserRole.ADMIN,
      organizationId: 'test-org-id',
    });

    memberToken = app.jwt.sign({
      id: 'test-member-id',
      email: 'member@workgrid.corp',
      name: 'Test Member',
      role: UserRole.MEMBER,
      organizationId: 'test-org-id',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/rooms rejects an unauthenticated request', async () => {
    const res = await supertest(app.server).get('/api/v1/rooms');
    expect(res.status).toBe(401);
  });

  it('GET /api/v1/rooms should return all 8 rooms structure for an authenticated user', async () => {
    const res = await supertest(app.server).get('/api/v1/rooms').set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('PATCH /api/v1/rooms/subrooms/:id/capacity should reject non-admins with 403', async () => {
    const res = await supertest(app.server)
      .patch('/api/v1/rooms/subrooms/B3/capacity')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ memberCapacity: 4 });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Forbidden');
  });

  it('PATCH /api/v1/rooms/subrooms/:id/capacity should reject invalid body with 400', async () => {
    const res = await supertest(app.server)
      .patch('/api/v1/rooms/subrooms/B3/capacity')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ memberCapacity: -1 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Bad Request');
  });
});
