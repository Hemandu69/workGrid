import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import supertest from 'supertest';
import crypto from 'crypto';
import { buildApp } from '../src/app.js';
import { UserRole, AccountStatus, PresenceState, UserStatus } from '@prisma/client';
import * as redisModule from '../src/redis/client.js';

const ORG = 'org-1';
const EVT_1 = crypto.randomUUID();
const LEAD_ID = crypto.randomUUID();
const NEW_MEMBER_ID = crypto.randomUUID();
const SERVER_ROLE_USER_ID = crypto.randomUUID();

const mockRoomsMeta = [{ id: 'room-c', letter: 'C', organizationId: ORG }];
const mockSubroomsMeta = Array.from({ length: 8 }, (_, i) => ({
  id: `subroom-c${i + 1}`,
  code: `C${i + 1}`,
  roomId: 'room-c',
  number: i + 1,
  memberCapacity: 2,
}));

let mockUsers: any[] = [];
let mockTeams: any[] = [];
let mockPlacements: any[] = [];
let mockEvents: any[] = [];

function resetMockData() {
  mockUsers = [
    { id: 'super-admin-1', email: 'elena@org.corp', name: 'Elena Vance', role: UserRole.SUPER_ADMIN, accountStatus: AccountStatus.ACTIVE, organizationId: ORG, teamId: null, presenceState: PresenceState.IN, status: UserStatus.ONLINE },
    { id: 'admin-1', email: 'marcus@org.corp', name: 'Marcus Sterling', role: UserRole.ADMIN, accountStatus: AccountStatus.ACTIVE, organizationId: ORG, teamId: null, presenceState: PresenceState.IN, status: UserStatus.ONLINE },
    { id: 'member-1', email: 'sarah@org.corp', name: 'Sarah Connor', role: UserRole.MEMBER, accountStatus: AccountStatus.ACTIVE, organizationId: ORG, teamId: null, presenceState: PresenceState.IN, status: UserStatus.ONLINE },
    { id: 'server-1', email: 'david@org.corp', name: 'David Chen', role: UserRole.SERVER, accountStatus: AccountStatus.ACTIVE, organizationId: ORG, teamId: null, presenceState: PresenceState.IN, status: UserStatus.ONLINE },
    { id: 'teamlead-1', email: 'amit@org.corp', name: 'Amit Shah', role: UserRole.TEAM_LEAD, accountStatus: AccountStatus.ACTIVE, organizationId: ORG, teamId: null, presenceState: PresenceState.IN, status: UserStatus.ONLINE },
    { id: LEAD_ID, email: 'priya@org.corp', name: 'Priya Natarajan', role: UserRole.TEAM_LEAD, accountStatus: AccountStatus.ACTIVE, organizationId: ORG, teamId: null, presenceState: PresenceState.IN, status: UserStatus.ONLINE },
    { id: NEW_MEMBER_ID, email: 'nora@org.corp', name: 'Nora Whitfield', role: UserRole.MEMBER, accountStatus: AccountStatus.ACTIVE, organizationId: ORG, teamId: null, presenceState: PresenceState.IN, status: UserStatus.ONLINE },
    { id: SERVER_ROLE_USER_ID, email: 'karan@org.corp', name: 'Karan Shah', role: UserRole.SERVER, accountStatus: AccountStatus.ACTIVE, organizationId: ORG, teamId: null, presenceState: PresenceState.IN, status: UserStatus.ONLINE },
  ];
  mockTeams = [];
  mockPlacements = [];
  mockEvents = [
    {
      id: EVT_1,
      organizationId: ORG,
      title: 'Cloud Summit',
      scheduledAt: new Date(Date.now() + 3 * 24 * 3600000),
      scheduledEndAt: new Date(Date.now() + 3 * 24 * 3600000 + 8 * 3600000),
      completedAt: null,
      status: 'UPCOMING',
    },
  ];
}

function findUser(id: string) {
  return mockUsers.find((u) => u.id === id) || null;
}

function matchUserWhere(u: any, where: any = {}): boolean {
  if (where.organizationId && u.organizationId !== where.organizationId) return false;
  if (where.id && typeof where.id === 'string' && u.id !== where.id) return false;
  if (where.id?.not && u.id === where.id.not) return false;
  if (where.id?.notIn && where.id.notIn.includes(u.id)) return false;
  if (where.teamId && u.teamId !== where.teamId) return false;
  if (where.role && u.role !== where.role) return false;
  if (where.accountStatus && u.accountStatus !== where.accountStatus) return false;
  return true;
}

const { mockPrisma, publishedEvents } = vi.hoisted(() => ({
  mockPrisma: {} as any,
  publishedEvents: [] as any[],
}));

Object.assign(mockPrisma, {
  team: {
    findMany: vi.fn(async ({ where, include }: any = {}) =>
      mockTeams
        .filter((t) => !where?.organizationId || t.organizationId === where.organizationId)
        .map((t) => {
          let placements: any[] = [];
          if (include?.placements?.where?.eventId) {
            const eventId = include.placements.where.eventId;
            placements = mockPlacements
              .filter((p) => p.teamId === t.id && p.eventId === eventId)
              .map((p) => ({
                room: mockRoomsMeta.find((r) => r.id === p.roomId) || { letter: 'A' },
              }));
          }
          return {
            ...t,
            lead: t.leadId ? findUser(t.leadId) : null,
            _count: { members: mockUsers.filter((u) => u.teamId === t.id).length },
            placements,
          };
        })
    ),
    findFirst: vi.fn(async ({ where }: any) => {
      let list = [...mockTeams];
      if (where.id) list = list.filter((t) => t.id === where.id);
      if (where.organizationId) list = list.filter((t) => t.organizationId === where.organizationId);
      if (where.name) list = list.filter((t) => t.name === where.name);
      if (where.id?.not) list = list.filter((t) => t.id !== where.id.not);
      const found = list[0];
      if (!found) return null;
      const lead = found.leadId ? findUser(found.leadId) : null;
      const members = mockUsers.filter((u) => u.teamId === found.id);
      return { ...found, lead, members };
    }),
    create: vi.fn(async ({ data }: any) => {
      const row = { id: `team-${mockTeams.length}-${crypto.randomUUID()}`, createdAt: new Date(), updatedAt: new Date(), ...data };
      mockTeams.push(row);
      return row;
    }),
    update: vi.fn(async ({ where, data }: any) => {
      const idx = mockTeams.findIndex((t) => t.id === where.id);
      mockTeams[idx] = { ...mockTeams[idx], ...data, updatedAt: new Date() };
      return mockTeams[idx];
    }),
    delete: vi.fn(async ({ where }: any) => {
      const idx = mockTeams.findIndex((t) => t.id === where.id);
      const [removed] = mockTeams.splice(idx, 1);
      mockUsers.forEach((u) => {
        if (u.teamId === where.id) u.teamId = null;
      });
      mockPlacements = mockPlacements.filter((p) => p.teamId !== where.id);
      return removed;
    }),
  },
  user: {
    findFirst: vi.fn(async ({ where }: any) => {
      const found = mockUsers.find((u) => matchUserWhere(u, where));
      return found ? { ...found } : null;
    }),
    findMany: vi.fn(async ({ where, orderBy, take }: any = {}) => {
      let list = mockUsers.filter((u) => matchUserWhere(u, where));
      if (orderBy?.name === 'asc') list = [...list].sort((a, b) => a.name.localeCompare(b.name));
      if (typeof take === 'number') list = list.slice(0, take);
      return list.map((u) => ({ ...u }));
    }),
    count: vi.fn(async ({ where }: any = {}) => mockUsers.filter((u) => matchUserWhere(u, where)).length),
    update: vi.fn(async ({ where, data }: any) => {
      const idx = mockUsers.findIndex((u) => u.id === where.id);
      mockUsers[idx] = { ...mockUsers[idx], ...data };
      return { ...mockUsers[idx] };
    }),
  },
  organizationEvent: {
    findFirst: vi.fn(async ({ where }: any) => {
      const found = mockEvents.find((e) => e.id === where.id && (!where.organizationId || e.organizationId === where.organizationId));
      return found ? { ...found } : null;
    }),
  },
  room: {
    findFirst: vi.fn(async ({ where }: any) => {
      const found = mockRoomsMeta.find((r) => r.letter === where.letter && r.organizationId === where.organizationId);
      return found ? { ...found } : null;
    }),
    findUnique: vi.fn(async ({ where }: any) => {
      const found = mockRoomsMeta.find((r) => r.id === where.id);
      return found ? { ...found } : null;
    }),
  },
  subroom: {
    findMany: vi.fn(async ({ where, orderBy }: any) => {
      let list = mockSubroomsMeta.filter((s) => s.roomId === where.roomId);
      if (orderBy?.number === 'asc') list = [...list].sort((a, b) => a.number - b.number);
      return list.map((s) => ({ ...s }));
    }),
    findFirst: vi.fn(async ({ where }: any) => {
      const found = mockSubroomsMeta.find((s) => s.code === where.code && s.roomId === where.roomId);
      return found ? { ...found } : null;
    }),
  },
  teamEventPlacement: {
    findMany: vi.fn(async ({ where, include }: any = {}) => {
      let list = [...mockPlacements];
      if (where?.eventId) list = list.filter((p) => p.eventId === where.eventId);
      if (where?.teamId && typeof where.teamId === 'string') list = list.filter((p) => p.teamId === where.teamId);
      if (where?.teamId?.not) list = list.filter((p) => p.teamId !== where.teamId.not);
      if (where?.subroomId?.in) list = list.filter((p) => where.subroomId.in.includes(p.subroomId));
      return list.map((p) => ({
        ...p,
        ...(include?.user ? { user: (() => { const u = findUser(p.userId)!; return { id: u.id, name: u.name, email: u.email, role: u.role, accountStatus: u.accountStatus, status: u.status, presenceState: u.presenceState }; })() } : {}),
      }));
    }),
    findUnique: vi.fn(async ({ where }: any) => {
      const key = where.eventId_userId;
      const found = mockPlacements.find((p) => p.eventId === key.eventId && p.userId === key.userId);
      return found ? { ...found } : null;
    }),
    count: vi.fn(async ({ where }: any = {}) => {
      let list = [...mockPlacements];
      if (where?.eventId) list = list.filter((p) => p.eventId === where.eventId);
      if (where?.subroomId) list = list.filter((p) => p.subroomId === where.subroomId);
      if (where?.userId?.not) list = list.filter((p) => p.userId !== where.userId.not);
      return list.length;
    }),
    create: vi.fn(async ({ data }: any) => {
      const row = { id: `placement-${mockPlacements.length}-${crypto.randomUUID()}`, createdAt: new Date(), updatedAt: new Date(), ...data };
      mockPlacements.push(row);
      return { ...row };
    }),
    createMany: vi.fn(async ({ data }: any) => {
      for (const d of data) mockPlacements.push({ id: `placement-${mockPlacements.length}-${crypto.randomUUID()}`, createdAt: new Date(), updatedAt: new Date(), ...d });
      return { count: data.length };
    }),
    delete: vi.fn(async ({ where }: any) => {
      const key = where.eventId_userId;
      const idx = mockPlacements.findIndex((p) => p.eventId === key.eventId && p.userId === key.userId);
      if (idx === -1) throw new Error('Placement not found');
      const [removed] = mockPlacements.splice(idx, 1);
      return removed;
    }),
    deleteMany: vi.fn(async ({ where }: any) => {
      const before = mockPlacements.length;
      mockPlacements = mockPlacements.filter((p) => !(p.teamId === where.teamId && p.eventId === where.eventId));
      return { count: before - mockPlacements.length };
    }),
    upsert: vi.fn(async ({ where, create, update }: any) => {
      const key = where.eventId_userId;
      const idx = mockPlacements.findIndex((p) => p.eventId === key.eventId && p.userId === key.userId);
      if (idx >= 0) {
        mockPlacements[idx] = { ...mockPlacements[idx], ...update, updatedAt: new Date() };
        return { ...mockPlacements[idx] };
      }
      const row = { id: `placement-${mockPlacements.length}-${crypto.randomUUID()}`, createdAt: new Date(), updatedAt: new Date(), ...create };
      mockPlacements.push(row);
      return { ...row };
    }),
  },
  $transaction: vi.fn(async (fn: any) => fn(mockPrisma)),
});

vi.mock('../src/db/client.js', () => ({
  prisma: mockPrisma,
  checkDatabaseHealth: vi.fn().mockResolvedValue({ status: 'healthy', latencyMs: 1 }),
}));

vi.mock('../src/events/domain-events.js', () => ({
  publishDomainEvent: vi.fn().mockImplementation((event: any) => {
    const full = { id: `evt_${publishedEvents.length}`, timestamp: new Date().toISOString(), ...event };
    publishedEvents.push(full);
    return full;
  }),
  domainEventBus: {
    publishDomainEvent: vi.fn(),
    subscribeOrganization: vi.fn(() => () => undefined),
    subscribeAll: vi.fn(() => () => undefined),
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    setMaxListeners: vi.fn(),
  },
}));

describe('Teams API — CRUD, membership, and event-section allocation routes', () => {
  let app: FastifyInstance;
  const tokens: Record<string, string> = {};

  beforeAll(async () => {
    vi.spyOn(redisModule, 'getRedisClient').mockImplementation(() => {
      throw new Error('Redis unreachable (test)');
    });

    app = await buildApp();
    await app.ready();

    resetMockData();
    for (const u of mockUsers) {
      tokens[u.id] = app.jwt.sign({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        accountStatus: u.accountStatus,
        organizationId: u.organizationId,
      });
    }
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    resetMockData();
    publishedEvents.length = 0;
  });

  describe('Team CRUD', () => {
    it('ADMIN creates a team with a lead', async () => {
      const res = await supertest(app.server)
        .post('/api/v1/teams')
        .set('Authorization', `Bearer ${tokens['admin-1']}`)
        .send({ name: 'Team Alpha', leadId: LEAD_ID });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Team Alpha');
      expect(res.body.lead.id).toBe(LEAD_ID);
    });

    it('rejects a duplicate team name in the same organization', async () => {
      await supertest(app.server).post('/api/v1/teams').set('Authorization', `Bearer ${tokens['admin-1']}`).send({ name: 'Team Alpha' });
      const res = await supertest(app.server).post('/api/v1/teams').set('Authorization', `Bearer ${tokens['admin-1']}`).send({ name: 'Team Alpha' });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/already exists/i);
    });

    it('lists teams with member counts', async () => {
      await supertest(app.server).post('/api/v1/teams').set('Authorization', `Bearer ${tokens['admin-1']}`).send({ name: 'Team Alpha' });

      const res = await supertest(app.server).get('/api/v1/teams').set('Authorization', `Bearer ${tokens['admin-1']}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({ name: 'Team Alpha', memberCount: 0 });
    });

    it('renames a team via PATCH', async () => {
      const created = await supertest(app.server).post('/api/v1/teams').set('Authorization', `Bearer ${tokens['admin-1']}`).send({ name: 'Team Alpha' });

      const res = await supertest(app.server)
        .patch(`/api/v1/teams/${created.body.id}`)
        .set('Authorization', `Bearer ${tokens['admin-1']}`)
        .send({ name: 'Team Renamed' });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Team Renamed');
    });

    it('deletes a team and unassigns its members', async () => {
      const created = await supertest(app.server).post('/api/v1/teams').set('Authorization', `Bearer ${tokens['admin-1']}`).send({ name: 'Team Alpha' });
      await supertest(app.server)
        .post(`/api/v1/teams/${created.body.id}/members`)
        .set('Authorization', `Bearer ${tokens['admin-1']}`)
        .send({ userId: NEW_MEMBER_ID });

      const res = await supertest(app.server).delete(`/api/v1/teams/${created.body.id}`).set('Authorization', `Bearer ${tokens['admin-1']}`);
      expect(res.status).toBe(200);
      expect(findUser(NEW_MEMBER_ID)!.teamId).toBeNull();
    });
  });

  describe('Membership', () => {
    it('adds and removes a MEMBER from the roster', async () => {
      const created = await supertest(app.server).post('/api/v1/teams').set('Authorization', `Bearer ${tokens['admin-1']}`).send({ name: 'Team Alpha' });

      const added = await supertest(app.server)
        .post(`/api/v1/teams/${created.body.id}/members`)
        .set('Authorization', `Bearer ${tokens['admin-1']}`)
        .send({ userId: NEW_MEMBER_ID });
      expect(added.status).toBe(200);
      expect(added.body.members.some((m: any) => m.id === NEW_MEMBER_ID)).toBe(true);

      const removed = await supertest(app.server)
        .delete(`/api/v1/teams/${created.body.id}/members/${NEW_MEMBER_ID}`)
        .set('Authorization', `Bearer ${tokens['admin-1']}`);
      expect(removed.status).toBe(200);
      expect(removed.body.members.some((m: any) => m.id === NEW_MEMBER_ID)).toBe(false);
    });

    it('rejects adding a SERVER to a team roster', async () => {
      const created = await supertest(app.server).post('/api/v1/teams').set('Authorization', `Bearer ${tokens['admin-1']}`).send({ name: 'Team Alpha' });

      const res = await supertest(app.server)
        .post(`/api/v1/teams/${created.body.id}/members`)
        .set('Authorization', `Bearer ${tokens['admin-1']}`)
        .send({ userId: SERVER_ROLE_USER_ID });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/MEMBER or TEAM_LEAD/i);
    });
  });

  describe('Event section allocation', () => {
    it('previews, allocates, and reflects the placement for an event + section', async () => {
      const created = await supertest(app.server).post('/api/v1/teams').set('Authorization', `Bearer ${tokens['admin-1']}`).send({ name: 'Team Alpha' });
      await supertest(app.server)
        .post(`/api/v1/teams/${created.body.id}/members`)
        .set('Authorization', `Bearer ${tokens['admin-1']}`)
        .send({ userId: NEW_MEMBER_ID });

      const preview = await supertest(app.server)
        .get(`/api/v1/teams/${created.body.id}/placement`)
        .query({ eventId: EVT_1, sectionLetter: 'C' })
        .set('Authorization', `Bearer ${tokens['admin-1']}`);
      expect(preview.status).toBe(200);
      expect(preview.body.poolCount).toBe(1);

      const allocated = await supertest(app.server)
        .post(`/api/v1/teams/${created.body.id}/placement/allocate`)
        .set('Authorization', `Bearer ${tokens['admin-1']}`)
        .send({ eventId: EVT_1, sectionLetter: 'C' });
      expect(allocated.status).toBe(200);
      expect(allocated.body.totalPositioned).toBe(1);
      expect(allocated.body.poolCount).toBe(0);
    });

    it('rejects an eventId that is not a valid UUID with 400, not a 500', async () => {
      const created = await supertest(app.server).post('/api/v1/teams').set('Authorization', `Bearer ${tokens['admin-1']}`).send({ name: 'Team Alpha' });

      const res = await supertest(app.server)
        .post(`/api/v1/teams/${created.body.id}/placement/allocate`)
        .set('Authorization', `Bearer ${tokens['admin-1']}`)
        .send({ eventId: 'not-a-uuid', sectionLetter: 'C' });

      expect(res.status).toBe(400);
    });
  });

  describe('Authorization', () => {
    const forbidden: Array<[string, string]> = [
      ['MEMBER', 'member-1'],
      ['SERVER', 'server-1'],
      ['TEAM_LEAD', 'teamlead-1'],
    ];

    it.each(forbidden)('%s cannot create a team (403)', async (_label, actorId) => {
      const res = await supertest(app.server)
        .post('/api/v1/teams')
        .set('Authorization', `Bearer ${tokens[actorId]}`)
        .send({ name: 'Unauthorized Team' });
      expect(res.status).toBe(403);
    });

    it('SUPER_ADMIN can create a team (201)', async () => {
      const res = await supertest(app.server)
        .post('/api/v1/teams')
        .set('Authorization', `Bearer ${tokens['super-admin-1']}`)
        .send({ name: 'Super Admin Team' });
      expect(res.status).toBe(201);
    });
  });
});
