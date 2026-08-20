import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import supertest from 'supertest';

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    user: {
      count: vi.fn().mockResolvedValue(2048),
    },
    room: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: 'room-b-id',
          letter: 'B',
          name: 'Sector B — Infrastructure & Security',
          leadServerId: null,
          leadServer: null,
          subrooms: [
            {
              id: 'subroom-b3-id',
              code: 'B3',
              number: 3,
              memberCapacity: 2,
              serverSeatCount: 1,
              members: [{ id: 'm1' }, { id: 'm2' }],
            },
          ],
        },
      ]),
    },
    task: {
      findMany: vi.fn().mockResolvedValue([
        {
          status: 'IN_PROGRESS',
          priority: 'HIGH',
          dueDate: new Date(),
        },
      ]),
    },
    taskCampaign: {
      count: vi.fn().mockResolvedValue(2),
    },
    announcement: {
      count: vi.fn().mockResolvedValue(3),
    },
  },
}));

vi.mock('../src/db/client.js', () => ({
  prisma: mockPrisma,
  checkDatabaseHealth: vi.fn().mockResolvedValue({ status: 'healthy', latencyMs: 1 }),
}));

describe('Dashboard Endpoints (/api/v1/dashboard)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/dashboard/summary should return consolidated summary metrics', async () => {
    const res = await supertest(app.server).get('/api/v1/dashboard/summary');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('organizationScale');
    expect(res.body).toHaveProperty('globalSaturationPercentage');
    expect(res.body).toHaveProperty('activeTasks');
    expect(res.body).toHaveProperty('sectorBreakdown');
  });
});
