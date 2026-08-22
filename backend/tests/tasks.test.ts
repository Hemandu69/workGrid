import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import supertest from 'supertest';
import { UserRole, AccountStatus, TaskStatus } from '@prisma/client';

/**
 * In-memory task/user store mutated by the service calls themselves, so each
 * scenario models a genuine sequence rather than isolated fixture snapshots.
 */
interface FakeTask {
  id: string;
  taskIdDisplay: string;
  organizationId: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: string;
  taskType: string;
  teamSection: string | null;
  parentTaskId: string | null;
  progress: number;
  estimatedHours: number;
  allocatedHours: number;
  dueDate: Date | null;
  assigneeId: string | null;
  creatorId: string | null;
  campaignId: string | null;
  tags: string[];
  completedAt: Date | null;
  createdAt: Date;
}

const USERS: Record<string, any> = {
  'admin-1': { id: 'admin-1', name: 'Marcus Sterling', email: 'admin@workgrid.corp', role: 'ADMIN', accountStatus: 'ACTIVE', organizationId: 'org-1', roomId: null },
  'superadmin-1': { id: 'superadmin-1', name: 'Elena Vance', email: 'super@workgrid.corp', role: 'SUPER_ADMIN', accountStatus: 'ACTIVE', organizationId: 'org-1', roomId: null },
  'server-b': { id: 'server-b', name: 'David Chen', email: 'david@workgrid.corp', role: 'SERVER', accountStatus: 'ACTIVE', organizationId: 'org-1', roomId: 'room-b', room: { letter: 'B' } },
  'teamlead-b': { id: 'teamlead-b', name: 'Alex Rivera', email: 'alex@workgrid.corp', role: 'TEAM_LEAD', accountStatus: 'ACTIVE', organizationId: 'org-1', roomId: 'room-b', room: { letter: 'B' } },
  'member-b1': { id: 'member-b1', name: 'Sarah Connor', email: 'sarah@workgrid.corp', role: 'MEMBER', accountStatus: 'ACTIVE', organizationId: 'org-1', roomId: 'room-b', room: { letter: 'B' }, presenceState: 'IN', status: 'ONLINE' },
  'member-b2': { id: 'member-b2', name: 'Liam Vance', email: 'liam@workgrid.corp', role: 'MEMBER', accountStatus: 'ACTIVE', organizationId: 'org-1', roomId: 'room-b', room: { letter: 'B' }, presenceState: 'IN', status: 'ONLINE' },
  'member-b3': { id: 'member-b3', name: 'Maya Patel', email: 'maya@workgrid.corp', role: 'MEMBER', accountStatus: 'ACTIVE', organizationId: 'org-1', roomId: 'room-b', room: { letter: 'B' }, presenceState: 'OUT', status: 'OFFLINE' },
  'member-b4': { id: 'member-b4', name: 'Kabir Nair', email: 'kabir@workgrid.corp', role: 'MEMBER', accountStatus: 'ACTIVE', organizationId: 'org-1', roomId: 'room-b', room: { letter: 'B' }, presenceState: 'IN', status: 'BUSY' },
  'member-a1': { id: 'member-a1', name: 'External Person', email: 'ext@workgrid.corp', role: 'MEMBER', accountStatus: 'ACTIVE', organizationId: 'org-1', roomId: 'room-a', room: { letter: 'A' }, presenceState: 'IN', status: 'ONLINE' },
  'member-pending': { id: 'member-pending', name: 'Pending Person', email: 'pending@workgrid.corp', role: 'MEMBER', accountStatus: 'PENDING', organizationId: 'org-1', roomId: 'room-b', room: { letter: 'B' } },
  'hr-1': { id: 'hr-1', name: 'Priya HR', email: 'hr@workgrid.corp', role: 'HR', accountStatus: 'ACTIVE', organizationId: 'org-1', roomId: null },
  'org2-admin': { id: 'org2-admin', name: 'Org2 Admin', email: 'admin2@other.corp', role: 'ADMIN', accountStatus: 'ACTIVE', organizationId: 'org-2', roomId: null },
  'org2-member': { id: 'org2-member', name: 'Org2 Member', email: 'member2@other.corp', role: 'MEMBER', accountStatus: 'ACTIVE', organizationId: 'org-2', roomId: null },
};

let tasks: FakeTask[] = [];
let taskSeq = 0;
const auditEvents: any[] = [];
const publishedEvents: any[] = [];

function makeTask(overrides: Partial<FakeTask> = {}): FakeTask {
  taskSeq++;
  return {
    id: `task-${taskSeq}`,
    taskIdDisplay: `TSK-${1000 + taskSeq}`,
    organizationId: 'org-1',
    title: `Task ${taskSeq}`,
    description: 'desc',
    status: TaskStatus.ASSIGNED,
    priority: 'MEDIUM',
    taskType: 'INDIVIDUAL',
    teamSection: null,
    parentTaskId: null,
    progress: 0,
    estimatedHours: 8,
    allocatedHours: 0,
    dueDate: null,
    assigneeId: null,
    creatorId: null,
    campaignId: null,
    tags: [],
    completedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function hydrate(t: FakeTask) {
  const assignee = t.assigneeId ? USERS[t.assigneeId] : null;
  const creator = t.creatorId ? USERS[t.creatorId] : null;
  return {
    ...t,
    assignee: assignee ? { ...assignee, room: assignee.room || null, subroom: null } : null,
    creator: creator || null,
    campaign: null,
    childTasks: tasks.filter((c) => c.parentTaskId === t.id).map((c) => ({ id: c.id })),
    _count: { comments: 0 },
  };
}

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    task: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    room: {
      findFirst: vi.fn(),
    },
    user: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    taskComment: {
      create: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    auditEvent: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('../src/db/client.js', () => ({
  prisma: mockPrisma,
  checkDatabaseHealth: vi.fn().mockResolvedValue({ status: 'healthy', latencyMs: 1 }),
}));

vi.mock('../src/events/domain-events.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/events/domain-events.js')>();
  return {
    ...actual,
    publishDomainEvent: vi.fn().mockImplementation((event: any) => {
      publishedEvents.push(event);
      return { id: `evt_${publishedEvents.length}`, timestamp: new Date().toISOString(), ...event };
    }),
  };
});

describe('Task Endpoints (/api/v1/tasks)', () => {
  let app: FastifyInstance;
  const tokens: Record<string, string> = {};

  beforeAll(async () => {
    mockPrisma.task.findFirst.mockImplementation(({ where }: any) => {
      const ors: any[] = where.OR || [where];
      const found = tasks.find((t) => ors.some((o: any) => (o.id && o.id === t.id) || (o.taskIdDisplay && o.taskIdDisplay === t.taskIdDisplay)));
      return Promise.resolve(found ? hydrate(found) : null);
    });

    // Evaluates a single Prisma-shaped clause (the ones this suite's OR/AND
    // combinations actually produce) against one task row.
    function matchesClause(t: any, clause: any): boolean {
      if (clause.assignee?.roomId) return USERS[t.assigneeId || '']?.roomId === clause.assignee.roomId;
      if (clause.taskType !== undefined || clause.teamSection !== undefined) {
        if (clause.taskType !== undefined && t.taskType !== clause.taskType) return false;
        if (clause.teamSection !== undefined && t.teamSection !== clause.teamSection) return false;
        if (clause.assigneeId === null && t.assigneeId) return false;
        return true;
      }
      return true;
    }

    function filterTasks(where: any): FakeTask[] {
      let result = tasks.filter((t) => t.organizationId === where.organizationId);
      if (where.status) result = result.filter((t) => t.status === where.status);
      if (where.assigneeId) result = result.filter((t) => t.assigneeId === where.assigneeId);
      if (where.assignee?.roomId) result = result.filter((t) => USERS[t.assigneeId || '']?.roomId === where.assignee.roomId);
      if (where.assignee?.room?.letter) result = result.filter((t) => USERS[t.assigneeId || '']?.room?.letter === where.assignee.room.letter);
      if (where.AND) {
        result = result.filter((t) =>
          (where.AND as any[]).every((clause) =>
            clause.OR ? clause.OR.some((sub: any) => matchesClause(t, sub)) : matchesClause(t, clause)
          )
        );
      }
      return result;
    }

    mockPrisma.task.findMany.mockImplementation(({ where, take, skip }: any) => {
      let result = filterTasks(where);
      if (typeof skip === 'number') result = result.slice(skip);
      if (typeof take === 'number') result = result.slice(0, take);
      return Promise.resolve(result.map(hydrate));
    });

    mockPrisma.task.count.mockImplementation(({ where }: any) => Promise.resolve(filterTasks(where).length));

    mockPrisma.task.create.mockImplementation(({ data }: any) => {
      const created = makeTask({ ...data, dueDate: data.dueDate || null });
      tasks.push(created);
      return Promise.resolve(created);
    });

    mockPrisma.task.update.mockImplementation(({ where, data }: any) => {
      const idx = tasks.findIndex((t) => t.id === where.id);
      if (idx === -1) return Promise.resolve(null);
      tasks[idx] = { ...tasks[idx], ...data };
      return Promise.resolve(tasks[idx]);
    });

    mockPrisma.user.findFirst.mockImplementation(({ where }: any) => {
      const ors: any[] = where.OR || [{ id: where.id }];
      const found = Object.values(USERS).find(
        (u: any) => u.organizationId === where.organizationId && ors.some((o: any) => (o.id && o.id === u.id) || (o.email && o.email === u.email))
      );
      return Promise.resolve(found || null);
    });

    // Batched lookup used by splitTeamTask: where.OR: [{id:{in:[...]}}, {email:{in:[...]}}]
    mockPrisma.user.findMany.mockImplementation(({ where }: any) => {
      const ors: any[] = where.OR || [];
      const idIn: string[] = ors.find((o: any) => o.id?.in)?.id?.in || [];
      const emailIn: string[] = ors.find((o: any) => o.email?.in)?.email?.in || [];
      const found = Object.values(USERS).filter(
        (u: any) => u.organizationId === where.organizationId && (idIn.includes(u.id) || emailIn.includes(u.email))
      );
      return Promise.resolve(found.map((u: any) => ({ ...u, room: u.room || null, subroom: null })));
    });

    mockPrisma.room.findFirst.mockImplementation(({ where }: any) => {
      const validLetters = ['A', 'B'];
      if (where.organizationId === 'org-1' && validLetters.includes(where.letter)) {
        return Promise.resolve({ id: `room-${where.letter.toLowerCase()}`, organizationId: 'org-1', letter: where.letter });
      }
      return Promise.resolve(null);
    });

    mockPrisma.user.findUnique.mockImplementation(({ where }: any) => Promise.resolve(USERS[where.id] || null));
    mockPrisma.user.update.mockImplementation(() => Promise.resolve({}));

    mockPrisma.auditEvent.create.mockImplementation(({ data }: any) => {
      const rec = { id: `aud-${auditEvents.length + 1}`, createdAt: new Date(), user: USERS[data.userId] || null, ...data };
      auditEvents.push(rec);
      return Promise.resolve(rec);
    });
    mockPrisma.auditEvent.findMany.mockImplementation(({ where }: any) =>
      Promise.resolve(auditEvents.filter((e) => e.entityType === where.entityType && e.entityId === where.entityId))
    );

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
    tasks = [];
    auditEvents.length = 0;
    publishedEvents.length = 0;
  });

  // --- Authentication & role gating ---------------------------------------

  it('1. rejects unauthenticated list requests', async () => {
    const res = await supertest(app.server).get('/api/v1/tasks');
    expect(res.status).toBe(401);
  });

  it('2. rejects HR from listing tasks — HR is not an operational task role', async () => {
    const res = await supertest(app.server).get('/api/v1/tasks').set('Authorization', `Bearer ${tokens['hr-1']}`);
    expect(res.status).toBe(403);
  });

  it('3. rejects MEMBER task creation with 403', async () => {
    const res = await supertest(app.server)
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${tokens['member-b1']}`)
      .send({ title: 'Unauthorized Task', assigneeId: 'member-b2' });
    expect(res.status).toBe(403);
  });

  it('4. rejects unauthenticated task creation with 401', async () => {
    const res = await supertest(app.server).post('/api/v1/tasks').send({ title: 'No Auth Task', assigneeId: 'member-b2' });
    expect(res.status).toBe(401);
  });

  it('5. allows TEAM_LEAD to create tasks (previously forbidden entirely)', async () => {
    const res = await supertest(app.server)
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${tokens['teamlead-b']}`)
      .send({ title: 'Squad Task', assigneeId: 'member-b1' });
    expect(res.status).toBe(201);
  });

  // --- List scoping (section 27 / org isolation, section 2 role scoping) --

  it('6. MEMBER sees only their own tasks even if they request someone else’s assigneeId', async () => {
    tasks.push(makeTask({ assigneeId: 'member-b1', creatorId: 'admin-1' }));
    tasks.push(makeTask({ assigneeId: 'member-b2', creatorId: 'admin-1' }));

    const res = await supertest(app.server)
      .get('/api/v1/tasks?assigneeId=member-b2')
      .set('Authorization', `Bearer ${tokens['member-b1']}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].assigneeId).toBe('member-b1');
  });

  it('7. SERVER sees only tasks assigned within their own room', async () => {
    tasks.push(makeTask({ assigneeId: 'member-b1', creatorId: 'admin-1' })); // room B
    tasks.push(makeTask({ assigneeId: 'member-a1', creatorId: 'admin-1' })); // room A

    const res = await supertest(app.server).get('/api/v1/tasks').set('Authorization', `Bearer ${tokens['server-b']}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].assigneeId).toBe('member-b1');
  });

  it('8. TEAM_LEAD sees only tasks assigned within their own room', async () => {
    tasks.push(makeTask({ assigneeId: 'member-b1', creatorId: 'admin-1' }));
    tasks.push(makeTask({ assigneeId: 'member-a1', creatorId: 'admin-1' }));

    const res = await supertest(app.server).get('/api/v1/tasks').set('Authorization', `Bearer ${tokens['teamlead-b']}`);

    expect(res.status).toBe(200);
    expect(res.body.items.every((t: any) => t.assigneeId === 'member-b1')).toBe(true);
  });

  it('9. ADMIN sees every task in their organization regardless of room', async () => {
    tasks.push(makeTask({ assigneeId: 'member-b1', creatorId: 'admin-1' }));
    tasks.push(makeTask({ assigneeId: 'member-a1', creatorId: 'admin-1' }));

    const res = await supertest(app.server).get('/api/v1/tasks').set('Authorization', `Bearer ${tokens['admin-1']}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.total).toBe(2);
  });

  it('10. a task belonging to another organization is never returned', async () => {
    tasks.push(makeTask({ organizationId: 'org-1', assigneeId: 'member-b1', creatorId: 'admin-1' }));
    tasks.push(makeTask({ organizationId: 'org-2', assigneeId: 'org2-member', creatorId: 'org2-admin' }));

    const res = await supertest(app.server).get('/api/v1/tasks').set('Authorization', `Bearer ${tokens['admin-1']}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].id).not.toBe(undefined);
  });

  // --- Assignment validation (section 3) ----------------------------------

  it('11. rejects assigning a task to a user in a different organization', async () => {
    const res = await supertest(app.server)
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${tokens['admin-1']}`)
      .send({ title: 'Cross Org Task', assigneeId: 'org2-member' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not found in your organization/i);
  });

  it('12. rejects assigning a task to a non-ACTIVE account', async () => {
    const res = await supertest(app.server)
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${tokens['admin-1']}`)
      .send({ title: 'Task for pending user', assigneeId: 'member-pending' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/PENDING/);
  });

  it('13. rejects assigning a task to an ineligible role (ADMIN cannot be a task recipient)', async () => {
    const res = await supertest(app.server)
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${tokens['superadmin-1']}`)
      .send({ title: 'Task for an admin', assigneeId: 'admin-1' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not eligible/i);
  });

  it('14. rejects a SERVER assigning outside their own room', async () => {
    const res = await supertest(app.server)
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${tokens['server-b']}`)
      .send({ title: 'Cross-room task', assigneeId: 'member-a1' });

    expect(res.status).toBe(403);
  });

  it('15. rejects a TEAM_LEAD assigning outside their own room', async () => {
    const res = await supertest(app.server)
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${tokens['teamlead-b']}`)
      .send({ title: 'Cross-room task', assigneeId: 'member-a1' });

    expect(res.status).toBe(403);
  });

  it('16. SERVER cannot create tasks at all — task-creation capability was removed', async () => {
    const res = await supertest(app.server)
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${tokens['server-b']}`)
      .send({ title: 'In-room task', assigneeId: 'member-b1' });

    expect(res.status).toBe(403);
  });

  // --- Status lifecycle (section 5) ---------------------------------------

  it('17. rejects an invalid status transition (DRAFT straight to COMPLETED)', async () => {
    tasks.push(makeTask({ id: 'task-draft', status: TaskStatus.DRAFT, assigneeId: 'member-b1', creatorId: 'admin-1' }));

    const res = await supertest(app.server)
      .patch('/api/v1/tasks/task-draft/status')
      .set('Authorization', `Bearer ${tokens['admin-1']}`)
      .send({ status: 'COMPLETED' });

    expect(res.status).toBe(409);
  });

  it('18. allows the assignee to move ASSIGNED -> IN_PROGRESS -> COMPLETED', async () => {
    tasks.push(makeTask({ id: 'task-flow', status: TaskStatus.ASSIGNED, assigneeId: 'member-b1', creatorId: 'admin-1' }));

    let res = await supertest(app.server)
      .patch('/api/v1/tasks/task-flow/status')
      .set('Authorization', `Bearer ${tokens['member-b1']}`)
      .send({ status: 'IN_PROGRESS' });
    expect(res.status).toBe(200);

    res = await supertest(app.server)
      .patch('/api/v1/tasks/task-flow/status')
      .set('Authorization', `Bearer ${tokens['member-b1']}`)
      .send({ status: 'COMPLETED' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('COMPLETED');
    expect(res.body.progress).toBe(100);
    expect(res.body.completedAt).toBeTruthy();
  });

  it('19. rejects COMPLETED -> IN_PROGRESS via the generic assignee unless done through reopen-eligible actor', async () => {
    // Reopen IS in the transition table; assignee is allowed to reopen their own task.
    tasks.push(makeTask({ id: 'task-done', status: TaskStatus.COMPLETED, progress: 100, assigneeId: 'member-b1', creatorId: 'admin-1', completedAt: new Date() }));

    const res = await supertest(app.server)
      .patch('/api/v1/tasks/task-done/status')
      .set('Authorization', `Bearer ${tokens['member-b1']}`)
      .send({ status: 'IN_PROGRESS' });

    expect(res.status).toBe(200);
    expect(res.body.completedAt).toBeFalsy();
  });

  it('20. rejects a plain MEMBER cancelling a task (cancel requires creator/admin/team-lead scope)', async () => {
    tasks.push(makeTask({ id: 'task-cancel', status: TaskStatus.ASSIGNED, assigneeId: 'member-b1', creatorId: 'admin-1' }));

    const res = await supertest(app.server)
      .patch('/api/v1/tasks/task-cancel/status')
      .set('Authorization', `Bearer ${tokens['member-b1']}`)
      .send({ status: 'CANCELLED' });

    expect(res.status).toBe(403);
  });

  it('21. allows the creator to cancel their own task', async () => {
    tasks.push(makeTask({ id: 'task-cancel2', status: TaskStatus.ASSIGNED, assigneeId: 'member-b1', creatorId: 'server-b' }));

    const res = await supertest(app.server)
      .post('/api/v1/tasks/task-cancel2/cancel')
      .set('Authorization', `Bearer ${tokens['server-b']}`)
      .send({ reason: 'No longer needed' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CANCELLED');
  });

  it('22. rejects a random unrelated MEMBER from changing another person’s task status', async () => {
    tasks.push(makeTask({ id: 'task-other', status: TaskStatus.ASSIGNED, assigneeId: 'member-b1', creatorId: 'admin-1' }));

    const res = await supertest(app.server)
      .patch('/api/v1/tasks/task-other/status')
      .set('Authorization', `Bearer ${tokens['member-b2']}`)
      .send({ status: 'IN_PROGRESS' });

    expect(res.status).toBe(403);
  });

  it('23. allows a TEAM_LEAD to change status for a task within their room even if not assignee/creator', async () => {
    tasks.push(makeTask({ id: 'task-teamlead', status: TaskStatus.ASSIGNED, assigneeId: 'member-b1', creatorId: 'server-b' }));

    const res = await supertest(app.server)
      .patch('/api/v1/tasks/task-teamlead/status')
      .set('Authorization', `Bearer ${tokens['teamlead-b']}`)
      .send({ status: 'IN_PROGRESS' });

    expect(res.status).toBe(200);
  });

  // --- Progress (section 6) ------------------------------------------------

  it('24. rejects progress outside 0-100', async () => {
    const res = await supertest(app.server)
      .patch('/api/v1/tasks/whatever/progress')
      .set('Authorization', `Bearer ${tokens['admin-1']}`)
      .send({ progress: 150 });

    expect(res.status).toBe(400);
  });

  it('25. progress reaching 100 auto-completes the task and sets completedAt', async () => {
    tasks.push(makeTask({ id: 'task-progress', status: TaskStatus.IN_PROGRESS, assigneeId: 'member-b1', creatorId: 'admin-1' }));

    const res = await supertest(app.server)
      .patch('/api/v1/tasks/task-progress/progress')
      .set('Authorization', `Bearer ${tokens['member-b1']}`)
      .send({ progress: 100 });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('COMPLETED');
    expect(res.body.completedAt).toBeTruthy();
  });

  it('26. rejects progress updates on a cancelled task', async () => {
    tasks.push(makeTask({ id: 'task-cancelled-progress', status: TaskStatus.CANCELLED, assigneeId: 'member-b1', creatorId: 'admin-1' }));

    const res = await supertest(app.server)
      .patch('/api/v1/tasks/task-cancelled-progress/progress')
      .set('Authorization', `Bearer ${tokens['member-b1']}`)
      .send({ progress: 50 });

    expect(res.status).toBe(409);
  });

  // --- Reassignment (section 3, 13) ----------------------------------------

  it('27. ADMIN can reassign a task to a different member', async () => {
    tasks.push(makeTask({ id: 'task-reassign', status: TaskStatus.IN_PROGRESS, assigneeId: 'member-b1', creatorId: 'admin-1', estimatedHours: 8 }));

    const res = await supertest(app.server)
      .patch('/api/v1/tasks/task-reassign/assignment')
      .set('Authorization', `Bearer ${tokens['admin-1']}`)
      .send({ assigneeId: 'member-b2', reason: 'Rebalancing workload' });

    expect(res.status).toBe(200);
    expect(res.body.assigneeId).toBe('member-b2');
  });

  it('28. rejects a plain MEMBER reassigning a task (never authorized)', async () => {
    tasks.push(makeTask({ id: 'task-reassign2', status: TaskStatus.ASSIGNED, assigneeId: 'member-b1', creatorId: 'admin-1' }));

    const res = await supertest(app.server)
      .patch('/api/v1/tasks/task-reassign2/assignment')
      .set('Authorization', `Bearer ${tokens['member-b1']}`)
      .send({ assigneeId: 'member-b2' });

    expect(res.status).toBe(403);
  });

  it('29. rejects a SERVER reassigning a task — not explicitly authorized', async () => {
    tasks.push(makeTask({ id: 'task-reassign3', status: TaskStatus.ASSIGNED, assigneeId: 'member-b1', creatorId: 'server-b' }));

    const res = await supertest(app.server)
      .patch('/api/v1/tasks/task-reassign3/assignment')
      .set('Authorization', `Bearer ${tokens['server-b']}`)
      .send({ assigneeId: 'member-b2' });

    expect(res.status).toBe(403);
  });

  it('30. allows a TEAM_LEAD to reassign within their room, rejects crossing into another room', async () => {
    tasks.push(makeTask({ id: 'task-reassign4', status: TaskStatus.ASSIGNED, assigneeId: 'member-b1', creatorId: 'admin-1' }));

    const okRes = await supertest(app.server)
      .patch('/api/v1/tasks/task-reassign4/assignment')
      .set('Authorization', `Bearer ${tokens['teamlead-b']}`)
      .send({ assigneeId: 'member-b2' });
    expect(okRes.status).toBe(200);

    const crossRes = await supertest(app.server)
      .patch('/api/v1/tasks/task-reassign4/assignment')
      .set('Authorization', `Bearer ${tokens['teamlead-b']}`)
      .send({ assigneeId: 'member-a1' });
    expect(crossRes.status).toBe(403);
  });

  it('31. rejects reassigning a completed task', async () => {
    tasks.push(makeTask({ id: 'task-reassign5', status: TaskStatus.COMPLETED, assigneeId: 'member-b1', creatorId: 'admin-1' }));

    const res = await supertest(app.server)
      .patch('/api/v1/tasks/task-reassign5/assignment')
      .set('Authorization', `Bearer ${tokens['admin-1']}`)
      .send({ assigneeId: 'member-b2' });

    expect(res.status).toBe(409);
  });

  // --- History / audit (section 7, 8) --------------------------------------

  it('32. creating and then reassigning a task produces a queryable history trail', async () => {
    const createRes = await supertest(app.server)
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${tokens['admin-1']}`)
      .send({ title: 'Audited Task', assigneeId: 'member-b1' });
    expect(createRes.status).toBe(201);

    const taskId = createRes.body.dbId;

    await supertest(app.server)
      .patch(`/api/v1/tasks/${taskId}/assignment`)
      .set('Authorization', `Bearer ${tokens['admin-1']}`)
      .send({ assigneeId: 'member-b2', reason: 'David -> Sarah' });

    const historyRes = await supertest(app.server)
      .get(`/api/v1/tasks/${taskId}/history`)
      .set('Authorization', `Bearer ${tokens['admin-1']}`);

    expect(historyRes.status).toBe(200);
    const actions = historyRes.body.map((h: any) => h.action);
    expect(actions).toContain('TASK_CREATED');
    expect(actions).toContain('TASK_REASSIGNED');
    const reassignEntry = historyRes.body.find((h: any) => h.action === 'TASK_REASSIGNED');
    expect(reassignEntry.details.newAssigneeId).toBe('member-b2');
    expect(reassignEntry.details.previousAssigneeId).toBe('member-b1');
  });

  it('33. history is never overwritten — repeated status changes append', async () => {
    tasks.push(makeTask({ id: 'task-history', status: TaskStatus.ASSIGNED, assigneeId: 'member-b1', creatorId: 'admin-1' }));

    await supertest(app.server).patch('/api/v1/tasks/task-history/status').set('Authorization', `Bearer ${tokens['member-b1']}`).send({ status: 'IN_PROGRESS' });
    await supertest(app.server).patch('/api/v1/tasks/task-history/status').set('Authorization', `Bearer ${tokens['member-b1']}`).send({ status: 'BLOCKED' });
    await supertest(app.server).patch('/api/v1/tasks/task-history/status').set('Authorization', `Bearer ${tokens['member-b1']}`).send({ status: 'IN_PROGRESS' });

    const historyRes = await supertest(app.server)
      .get('/api/v1/tasks/task-history/history')
      .set('Authorization', `Bearer ${tokens['admin-1']}`);

    const statusChanges = historyRes.body.filter((h: any) => h.action === 'TASK_STATUS_CHANGED');
    expect(statusChanges).toHaveLength(3);
  });

  it('34. an unrelated MEMBER cannot view another person’s task history', async () => {
    tasks.push(makeTask({ id: 'task-private', status: TaskStatus.ASSIGNED, assigneeId: 'member-b1', creatorId: 'admin-1' }));

    const res = await supertest(app.server)
      .get('/api/v1/tasks/task-private/history')
      .set('Authorization', `Bearer ${tokens['member-b2']}`);

    expect(res.status).toBe(403);
  });

  // --- Comments --------------------------------------------------------------

  it('35. a task-unrelated member cannot comment on it', async () => {
    tasks.push(makeTask({ id: 'task-comment', status: TaskStatus.ASSIGNED, assigneeId: 'member-b1', creatorId: 'admin-1' }));

    const res = await supertest(app.server)
      .post('/api/v1/tasks/task-comment/comments')
      .set('Authorization', `Bearer ${tokens['member-b2']}`)
      .send({ content: 'Snooping' });

    expect(res.status).toBe(403);
  });

  it('36. the assignee can comment on their own task', async () => {
    tasks.push(makeTask({ id: 'task-comment2', status: TaskStatus.ASSIGNED, assigneeId: 'member-b1', creatorId: 'admin-1' }));
    mockPrisma.taskComment.create.mockResolvedValueOnce({
      id: 'cm-1',
      authorId: 'member-b1',
      content: 'On it',
      createdAt: new Date(),
      author: USERS['member-b1'],
    });

    const res = await supertest(app.server)
      .post('/api/v1/tasks/task-comment2/comments')
      .set('Authorization', `Bearer ${tokens['member-b1']}`)
      .send({ content: 'On it' });

    expect(res.status).toBe(201);
  });

  // --- Realtime event payloads -----------------------------------------------

  it('37. creating a task publishes TASK_CREATED and TASK_ASSIGNED scoped to the org', async () => {
    await supertest(app.server)
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${tokens['admin-1']}`)
      .send({ title: 'Event Task', assigneeId: 'member-b1' });

    const created = publishedEvents.find((e) => e.type === 'TASK_CREATED');
    const assigned = publishedEvents.find((e) => e.type === 'TASK_ASSIGNED');
    expect(created).toBeDefined();
    expect(created.organizationId).toBe('org-1');
    expect(created.targetUserId).toBe('member-b1');
    expect(assigned).toBeDefined();
    expect(assigned.payload.assigneeId).toBe('member-b1');
  });

  it('38. reassigning publishes TASK_REASSIGNED with both previous and new assignee', async () => {
    tasks.push(makeTask({ id: 'task-event-reassign', status: TaskStatus.ASSIGNED, assigneeId: 'member-b1', creatorId: 'admin-1' }));

    await supertest(app.server)
      .patch('/api/v1/tasks/task-event-reassign/assignment')
      .set('Authorization', `Bearer ${tokens['admin-1']}`)
      .send({ assigneeId: 'member-b2' });

    const event = publishedEvents.find((e) => e.type === 'TASK_REASSIGNED');
    expect(event).toBeDefined();
    expect(event.payload.previousAssigneeId).toBe('member-b1');
    expect(event.payload.newAssigneeId).toBe('member-b2');
  });

  it('39. completing a task publishes TASK_COMPLETED, not just TASK_STATUS_CHANGED', async () => {
    tasks.push(makeTask({ id: 'task-event-complete', status: TaskStatus.IN_PROGRESS, assigneeId: 'member-b1', creatorId: 'admin-1' }));

    await supertest(app.server)
      .post('/api/v1/tasks/task-event-complete/complete')
      .set('Authorization', `Bearer ${tokens['member-b1']}`);

    expect(publishedEvents.some((e) => e.type === 'TASK_COMPLETED')).toBe(true);
  });

  it('40. cancelling a task publishes TASK_CANCELLED, not TASK_STATUS_CHANGED', async () => {
    tasks.push(makeTask({ id: 'task-event-cancel', status: TaskStatus.ASSIGNED, assigneeId: 'member-b1', creatorId: 'admin-1' }));

    await supertest(app.server)
      .post('/api/v1/tasks/task-event-cancel/cancel')
      .set('Authorization', `Bearer ${tokens['admin-1']}`);

    expect(publishedEvents.some((e) => e.type === 'TASK_CANCELLED')).toBe(true);
    expect(publishedEvents.some((e) => e.type === 'TASK_STATUS_CHANGED')).toBe(false);
  });

  // --- Analytics ---------------------------------------------------------

  it('41. task analytics are forbidden for a plain MEMBER', async () => {
    const res = await supertest(app.server).get('/api/v1/tasks/analytics').set('Authorization', `Bearer ${tokens['member-b1']}`);
    expect(res.status).toBe(403);
  });

  it('42. ADMIN analytics reflect the org’s task mix', async () => {
    tasks.push(makeTask({ status: TaskStatus.COMPLETED, assigneeId: 'member-b1', creatorId: 'admin-1', completedAt: new Date() }));
    tasks.push(makeTask({ status: TaskStatus.IN_PROGRESS, assigneeId: 'member-b1', creatorId: 'admin-1' }));
    tasks.push(makeTask({ status: TaskStatus.CANCELLED, assigneeId: 'member-b2', creatorId: 'admin-1' }));

    const res = await supertest(app.server).get('/api/v1/tasks/analytics').set('Authorization', `Bearer ${tokens['admin-1']}`);

    expect(res.status).toBe(200);
    expect(res.body.totalTasks).toBe(3);
    expect(res.body.byStatus.COMPLETED).toBe(1);
    expect(res.body.byStatus.CANCELLED).toBe(1);
    expect(res.body.completionRate).toBe(50); // 1 of 2 non-cancelled tasks
  });

  it('43. TEAM_LEAD analytics are scoped to their own room only', async () => {
    tasks.push(makeTask({ status: TaskStatus.COMPLETED, assigneeId: 'member-b1', creatorId: 'admin-1', completedAt: new Date() }));
    tasks.push(makeTask({ status: TaskStatus.COMPLETED, assigneeId: 'member-a1', creatorId: 'admin-1', completedAt: new Date() }));

    const res = await supertest(app.server).get('/api/v1/tasks/analytics').set('Authorization', `Bearer ${tokens['teamlead-b']}`);

    expect(res.status).toBe(200);
    expect(res.body.totalTasks).toBe(1);
  });

  // --- Team tasks: creation, section scoping ------------------------------

  it('44. ADMIN can create an unassigned TEAM task for any section', async () => {
    const res = await supertest(app.server)
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${tokens['admin-1']}`)
      .send({ title: 'Section B Infrastructure Audit', taskType: 'TEAM', teamSection: 'B' });

    expect(res.status).toBe(201);
    expect(res.body.taskType).toBe('TEAM');
    expect(res.body.teamSection).toBe('B');
    expect(res.body.assigneeId).toBe('');
    expect(res.body.status).toBe('DRAFT');
    expect(res.body.isDistributed).toBe(false);
  });

  it('45. SUPER_ADMIN can create a TEAM task for any section', async () => {
    const res = await supertest(app.server)
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${tokens['superadmin-1']}`)
      .send({ title: 'Section A Report', taskType: 'TEAM', teamSection: 'A' });

    expect(res.status).toBe(201);
    expect(res.body.teamSection).toBe('A');
  });

  it('46. TEAM_LEAD can create a TEAM task for their own section', async () => {
    const res = await supertest(app.server)
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${tokens['teamlead-b']}`)
      .send({ title: 'Squad B Distributed Work', taskType: 'TEAM', teamSection: 'B' });

    expect(res.status).toBe(201);
    expect(res.body.teamSection).toBe('B');
  });

  it('47. TEAM_LEAD cannot create a TEAM task for another section (403)', async () => {
    const res = await supertest(app.server)
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${tokens['teamlead-b']}`)
      .send({ title: 'Section A Work', taskType: 'TEAM', teamSection: 'A' });

    expect(res.status).toBe(403);
  });

  it('48. creating a TEAM task without teamSection is rejected (400)', async () => {
    const res = await supertest(app.server)
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${tokens['admin-1']}`)
      .send({ title: 'No Section Given', taskType: 'TEAM' });

    expect(res.status).toBe(400);
  });

  it('49. an unassigned team task appears in its own section Team Lead\'s task list', async () => {
    await supertest(app.server)
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${tokens['admin-1']}`)
      .send({ title: 'Section B Team Task', taskType: 'TEAM', teamSection: 'B' });

    const res = await supertest(app.server).get('/api/v1/tasks').set('Authorization', `Bearer ${tokens['teamlead-b']}`);

    expect(res.status).toBe(200);
    expect(res.body.items.some((t: any) => t.taskType === 'TEAM' && t.teamSection === 'B')).toBe(true);
  });

  // --- Team tasks: assignment, reassignment, availability -----------------

  it('50. a Team Lead can assign an unassigned team task to a member of their own section', async () => {
    const created = await supertest(app.server)
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${tokens['admin-1']}`)
      .send({ title: 'Assign Me', taskType: 'TEAM', teamSection: 'B' });

    const res = await supertest(app.server)
      .patch(`/api/v1/tasks/${created.body.id}/assignment`)
      .set('Authorization', `Bearer ${tokens['teamlead-b']}`)
      .send({ assigneeId: 'member-b1' });

    expect(res.status).toBe(200);
    expect(res.body.assigneeId).toBe('member-b1');
    expect(res.body.status).toBe('ASSIGNED');
  });

  it('51. a Team Lead cannot assign a team task belonging to another section (403)', async () => {
    const created = await supertest(app.server)
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${tokens['admin-1']}`)
      .send({ title: 'Section A Task', taskType: 'TEAM', teamSection: 'A' });

    const res = await supertest(app.server)
      .patch(`/api/v1/tasks/${created.body.id}/assignment`)
      .set('Authorization', `Bearer ${tokens['teamlead-b']}`)
      .send({ assigneeId: 'member-a1' });

    expect(res.status).toBe(403);
  });

  it('52. assigning a team task to a currently unavailable (OUT) member is rejected (409)', async () => {
    const created = await supertest(app.server)
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${tokens['admin-1']}`)
      .send({ title: 'Assign to OUT member', taskType: 'TEAM', teamSection: 'B' });

    const res = await supertest(app.server)
      .patch(`/api/v1/tasks/${created.body.id}/assignment`)
      .set('Authorization', `Bearer ${tokens['teamlead-b']}`)
      .send({ assigneeId: 'member-b3' }); // presenceState OUT

    expect(res.status).toBe(409);
  });

  it('53. assigning a team task to a BUSY-but-present member is allowed', async () => {
    const created = await supertest(app.server)
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${tokens['admin-1']}`)
      .send({ title: 'Assign to BUSY member', taskType: 'TEAM', teamSection: 'B' });

    const res = await supertest(app.server)
      .patch(`/api/v1/tasks/${created.body.id}/assignment`)
      .set('Authorization', `Bearer ${tokens['teamlead-b']}`)
      .send({ assigneeId: 'member-b4' }); // presenceState IN, status BUSY

    expect(res.status).toBe(200);
    expect(res.body.assigneeId).toBe('member-b4');
  });

  it('54. reassigning a team task preserves the same task id and records both history entries — no duplicate task is created', async () => {
    const created = await supertest(app.server)
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${tokens['admin-1']}`)
      .send({ title: 'Reassign Me', taskType: 'TEAM', teamSection: 'B' });
    const taskId = created.body.id;

    const assigned = await supertest(app.server)
      .patch(`/api/v1/tasks/${taskId}/assignment`)
      .set('Authorization', `Bearer ${tokens['teamlead-b']}`)
      .send({ assigneeId: 'member-b1' });
    expect(assigned.body.dbId).toBe(created.body.dbId);

    // member-b1 becomes unavailable; the Team Lead reassigns to member-b2
    const reassigned = await supertest(app.server)
      .patch(`/api/v1/tasks/${taskId}/assignment`)
      .set('Authorization', `Bearer ${tokens['teamlead-b']}`)
      .send({ assigneeId: 'member-b2', reason: 'member-b1 unavailable' });

    expect(reassigned.status).toBe(200);
    expect(reassigned.body.id).toBe(created.body.id);
    expect(reassigned.body.dbId).toBe(created.body.dbId);
    expect(reassigned.body.assigneeId).toBe('member-b2');

    // Exactly one task row exists for this id — no duplicate was created.
    expect(tasks.filter((t) => t.id === created.body.dbId)).toHaveLength(1);

    const history = await supertest(app.server)
      .get(`/api/v1/tasks/${taskId}/history`)
      .set('Authorization', `Bearer ${tokens['admin-1']}`);
    const reassignedEntries = history.body.filter((h: any) => h.action === 'TASK_REASSIGNED');
    expect(reassignedEntries.length).toBeGreaterThanOrEqual(2); // unassigned→b1, b1→b2
  });

  // --- Team tasks: splitting -----------------------------------------------

  it('55. a Team Lead can split an unassigned team task across 2+ members, creating independent child tasks', async () => {
    const created = await supertest(app.server)
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${tokens['admin-1']}`)
      .send({ title: 'Section B Infrastructure Audit', taskType: 'TEAM', teamSection: 'B' });

    publishedEvents.length = 0;

    const res = await supertest(app.server)
      .post(`/api/v1/tasks/${created.body.id}/split`)
      .set('Authorization', `Bearer ${tokens['teamlead-b']}`)
      .send({
        assignments: [
          { assigneeId: 'member-b1', title: 'Network audit' },
          { assigneeId: 'member-b2', title: 'Documentation' },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.children).toHaveLength(2);
    expect(res.body.children.map((c: any) => c.assigneeId).sort()).toEqual(['member-b1', 'member-b2']);
    expect(res.body.children.every((c: any) => c.taskType === 'INDIVIDUAL')).toBe(true);
    expect(res.body.children.every((c: any) => c.parentTaskId === created.body.dbId)).toBe(true);
    expect(res.body.parent.isDistributed).toBe(true);

    expect(publishedEvents.filter((e) => e.type === 'TASK_CREATED')).toHaveLength(2);
    expect(publishedEvents.filter((e) => e.type === 'TASK_ASSIGNED')).toHaveLength(2);
    expect(publishedEvents.some((e) => e.type === 'TASK_UPDATED' && e.entityId === created.body.dbId)).toBe(true);
  });

  it('56. splitting records a TASK_SPLIT audit entry on the parent task', async () => {
    const created = await supertest(app.server)
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${tokens['admin-1']}`)
      .send({ title: 'Splittable Task', taskType: 'TEAM', teamSection: 'B' });

    await supertest(app.server)
      .post(`/api/v1/tasks/${created.body.id}/split`)
      .set('Authorization', `Bearer ${tokens['teamlead-b']}`)
      .send({
        assignments: [
          { assigneeId: 'member-b1', title: 'Part one' },
          { assigneeId: 'member-b2', title: 'Part two' },
        ],
      });

    const history = await supertest(app.server)
      .get(`/api/v1/tasks/${created.body.id}/history`)
      .set('Authorization', `Bearer ${tokens['admin-1']}`);
    expect(history.body.some((h: any) => h.action === 'TASK_SPLIT')).toBe(true);
  });

  it('57. cannot split a task that already has an assignee (409)', async () => {
    tasks.push(makeTask({ id: 'team-task-assigned', taskType: 'TEAM', teamSection: 'B', status: TaskStatus.ASSIGNED, assigneeId: 'member-b1', creatorId: 'admin-1' }));

    const res = await supertest(app.server)
      .post('/api/v1/tasks/team-task-assigned/split')
      .set('Authorization', `Bearer ${tokens['teamlead-b']}`)
      .send({
        assignments: [
          { assigneeId: 'member-b1', title: 'Part one' },
          { assigneeId: 'member-b2', title: 'Part two' },
        ],
      });

    expect(res.status).toBe(409);
  });

  it('58. splitting requires at least 2 assignments (400)', async () => {
    const created = await supertest(app.server)
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${tokens['admin-1']}`)
      .send({ title: 'One-Person Split Attempt', taskType: 'TEAM', teamSection: 'B' });

    const res = await supertest(app.server)
      .post(`/api/v1/tasks/${created.body.id}/split`)
      .set('Authorization', `Bearer ${tokens['teamlead-b']}`)
      .send({ assignments: [{ assigneeId: 'member-b1', title: 'Only part' }] });

    expect(res.status).toBe(400);
  });

  it('59. a Team Lead from another section cannot split a team task that is not theirs (403)', async () => {
    const created = await supertest(app.server)
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${tokens['admin-1']}`)
      .send({ title: 'Section A Split', taskType: 'TEAM', teamSection: 'A' });

    const res = await supertest(app.server)
      .post(`/api/v1/tasks/${created.body.id}/split`)
      .set('Authorization', `Bearer ${tokens['teamlead-b']}`)
      .send({
        assignments: [
          { assigneeId: 'member-a1', title: 'Part one' },
          { assigneeId: 'member-a1', title: 'Part two' },
        ],
      });

    expect(res.status).toBe(403);
  });

  it('60. organization isolation: a user from another org cannot view, assign, or split an org-1 team task', async () => {
    const created = await supertest(app.server)
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${tokens['admin-1']}`)
      .send({ title: 'Org-1 Team Task', taskType: 'TEAM', teamSection: 'B' });

    const viewRes = await supertest(app.server)
      .get(`/api/v1/tasks/${created.body.id}`)
      .set('Authorization', `Bearer ${tokens['org2-admin']}`);
    expect(viewRes.status).toBe(403); // different org, not admin of org-1, not creator/assignee

    const splitRes = await supertest(app.server)
      .post(`/api/v1/tasks/${created.body.id}/split`)
      .set('Authorization', `Bearer ${tokens['org2-admin']}`)
      .send({ assignments: [{ assigneeId: 'org2-member', title: 'Part one' }, { assigneeId: 'org2-member', title: 'Part two' }] });
    expect(splitRes.status).toBe(403);
  });
});
