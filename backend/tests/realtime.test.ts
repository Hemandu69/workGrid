import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { io as ClientSocket, Socket as ClientSocketType } from 'socket.io-client';
import { AccountStatus, UserRole, TaskStatus } from '@prisma/client';
import { domainEventBus, publishDomainEvent, DomainEvent } from '../src/events/domain-events.js';

// In-memory test state
const testUsers: any[] = [
  {
    id: 'rt-superadmin-id',
    email: 'elena.rt@workgrid.corp',
    name: 'Elena SuperAdmin',
    role: UserRole.SUPER_ADMIN,
    accountStatus: AccountStatus.ACTIVE,
    organizationId: 'org-rt-1',
    passwordHash: 'hash',
    version: 1,
  },
  {
    id: 'rt-hr-id',
    email: 'sarah.hr@workgrid.corp',
    name: 'Sarah HR',
    role: UserRole.HR,
    accountStatus: AccountStatus.ACTIVE,
    organizationId: 'org-rt-1',
    passwordHash: 'hash',
    version: 1,
  },
  {
    id: 'rt-member-id',
    email: 'member.rt@workgrid.corp',
    name: 'Member RT',
    role: UserRole.MEMBER,
    accountStatus: AccountStatus.ACTIVE,
    organizationId: 'org-rt-1',
    passwordHash: 'hash',
    version: 1,
  },
  {
    id: 'rt-suspended-id',
    email: 'suspended.rt@workgrid.corp',
    name: 'Suspended RT',
    role: UserRole.MEMBER,
    accountStatus: AccountStatus.SUSPENDED,
    organizationId: 'org-rt-1',
    passwordHash: 'hash',
    version: 1,
  },
  {
    id: 'rt-org2-member-id',
    email: 'org2.member@workgrid.corp',
    name: 'Org2 Member',
    role: UserRole.MEMBER,
    accountStatus: AccountStatus.ACTIVE,
    organizationId: 'org-rt-2',
    passwordHash: 'hash',
    version: 1,
  },
  {
    id: 'rt-server-roomA-id',
    email: 'server.rooma@workgrid.corp',
    name: 'Server Room A',
    role: UserRole.SERVER,
    accountStatus: AccountStatus.ACTIVE,
    organizationId: 'org-rt-1',
    roomId: 'room-A',
    passwordHash: 'hash',
    version: 1,
  },
  {
    id: 'rt-server-roomB-id',
    email: 'server.roomb@workgrid.corp',
    name: 'Server Room B',
    role: UserRole.SERVER,
    accountStatus: AccountStatus.ACTIVE,
    organizationId: 'org-rt-1',
    roomId: 'room-B',
    passwordHash: 'hash',
    version: 1,
  },
];

vi.mock('../src/db/client.js', () => ({
  prisma: {
    user: {
      findUnique: vi.fn().mockImplementation(async ({ where }) => {
        return testUsers.find((u) => u.id === where.id || u.email === where.email) || null;
      }),
      findFirst: vi.fn().mockImplementation(async ({ where }) => {
        return testUsers.find((u) => u.id === where.id || u.email === where.email) || null;
      }),
      update: vi.fn().mockImplementation(async ({ where, data }) => {
        const idx = testUsers.findIndex((u) => u.id === where.id);
        if (idx !== -1) {
          testUsers[idx] = { ...testUsers[idx], ...data };
          return testUsers[idx];
        }
        return null;
      }),
    },
    organization: {
      findFirst: vi.fn().mockResolvedValue({ id: 'org-rt-1', name: 'WorkGrid RT Org' }),
    },
    auditEvent: {
      create: vi.fn().mockResolvedValue({ id: 'aud-1' }),
    },
  },
}));

describe('WorkGrid Global Realtime Architecture — Socket.IO', () => {
  let app: FastifyInstance;
  let serverPort: number;
  let superAdminToken: string;
  let hrToken: string;
  let memberToken: string;
  let suspendedToken: string;
  let org2MemberToken: string;
  let serverRoomAToken: string;
  let serverRoomBToken: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.listen({ port: 0, host: '127.0.0.1' });
    const addr = app.server.address();
    serverPort = typeof addr === 'object' && addr ? addr.port : 4000;

    superAdminToken = app.jwt.sign(testUsers[0]);
    hrToken = app.jwt.sign(testUsers[1]);
    memberToken = app.jwt.sign(testUsers[2]);
    suspendedToken = app.jwt.sign(testUsers[3]);
    org2MemberToken = app.jwt.sign(testUsers[4]);
    serverRoomAToken = app.jwt.sign(testUsers[5]);
    serverRoomBToken = app.jwt.sign(testUsers[6]);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('1. Socket.IO Authentication & Handshake Security', () => {
    it('should REJECT unauthenticated socket connection', async () => {
      const socket = ClientSocket(`http://127.0.0.1:${serverPort}`, {
        path: '/socket.io',
        transports: ['websocket'],
        autoConnect: false,
      });

      const errPromise = new Promise((resolve) => {
        socket.on('connect_error', (err) => {
          resolve(err.message);
        });
      });

      socket.connect();
      const errMsg = await errPromise;
      socket.disconnect();

      expect(errMsg).toBe('Authentication token required');
    });

    it('should REJECT SUSPENDED account socket connection', async () => {
      const socket = ClientSocket(`http://127.0.0.1:${serverPort}`, {
        path: '/socket.io',
        transports: ['websocket'],
        extraHeaders: {
          authorization: `Bearer ${suspendedToken}`,
        },
        autoConnect: false,
      });

      const errPromise = new Promise((resolve) => {
        socket.on('connect_error', (err) => {
          resolve(err.message);
        });
      });

      socket.connect();
      const errMsg = await errPromise;
      socket.disconnect();

      expect(errMsg).toContain('SUSPENDED');
    });

    it('should ACCEPT active user connection via Cookie header', async () => {
      const socket = ClientSocket(`http://127.0.0.1:${serverPort}`, {
        path: '/socket.io',
        transports: ['websocket'],
        extraHeaders: {
          cookie: `wg_auth_token=${memberToken}`,
        },
        autoConnect: false,
      });

      const connectPromise = new Promise((resolve) => {
        socket.on('CONNECTED', (data) => {
          resolve(data);
        });
      });

      socket.connect();
      const connectedData: any = await connectPromise;
      socket.disconnect();

      expect(connectedData.userId).toBe('rt-member-id');
      expect(connectedData.organizationId).toBe('org-rt-1');
      expect(connectedData.role).toBe(UserRole.MEMBER);
    });

    it('should ACCEPT active user connection via Authorization Bearer header', async () => {
      const socket = ClientSocket(`http://127.0.0.1:${serverPort}`, {
        path: '/socket.io',
        transports: ['websocket'],
        extraHeaders: {
          authorization: `Bearer ${hrToken}`,
        },
        autoConnect: false,
      });

      const connectPromise = new Promise((resolve) => {
        socket.on('CONNECTED', (data) => {
          resolve(data);
        });
      });

      socket.connect();
      const connectedData: any = await connectPromise;
      socket.disconnect();

      expect(connectedData.userId).toBe('rt-hr-id');
      expect(connectedData.organizationId).toBe('org-rt-1');
      expect(connectedData.role).toBe(UserRole.HR);
    });
  });

  describe('2. Organization Isolation & Scoping', () => {
    it('Org 1 events should NEVER reach Org 2 connected sockets', async () => {
      const org1Socket = ClientSocket(`http://127.0.0.1:${serverPort}`, {
        path: '/socket.io',
        transports: ['websocket'],
        extraHeaders: { authorization: `Bearer ${memberToken}` },
      });

      const org2Socket = ClientSocket(`http://127.0.0.1:${serverPort}`, {
        path: '/socket.io',
        transports: ['websocket'],
        extraHeaders: { authorization: `Bearer ${org2MemberToken}` },
      });

      await Promise.all([
        new Promise((res) => org1Socket.on('CONNECTED', res)),
        new Promise((res) => org2Socket.on('CONNECTED', res)),
      ]);

      const org1Received: any[] = [];
      const org2Received: any[] = [];

      org1Socket.on('ANNOUNCEMENT_CREATED', (e) => org1Received.push(e));
      org2Socket.on('ANNOUNCEMENT_CREATED', (e) => org2Received.push(e));

      // Publish event for Org 1
      publishDomainEvent({
        type: 'ANNOUNCEMENT_CREATED',
        organizationId: 'org-rt-1',
        entityId: 'ann-org1',
        payload: { title: 'Org 1 Only Task' },
      });

      await new Promise((r) => setTimeout(r, 100));

      org1Socket.disconnect();
      org2Socket.disconnect();

      expect(org1Received.length).toBe(1);
      expect(org1Received[0].payload.title).toBe('Org 1 Only Task');
      expect(org2Received.length).toBe(0);
    });
  });

  describe('3. Role-Based Room Routing & Governance Events', () => {
    it('HR events should be delivered to HR / Super Admin, but NOT to unauthorized Member sockets', async () => {
      const hrSocket = ClientSocket(`http://127.0.0.1:${serverPort}`, {
        path: '/socket.io',
        transports: ['websocket'],
        extraHeaders: { authorization: `Bearer ${hrToken}` },
      });

      const memberSocket = ClientSocket(`http://127.0.0.1:${serverPort}`, {
        path: '/socket.io',
        transports: ['websocket'],
        extraHeaders: { authorization: `Bearer ${memberToken}` },
      });

      await Promise.all([
        new Promise((res) => hrSocket.on('CONNECTED', res)),
        new Promise((res) => memberSocket.on('CONNECTED', res)),
      ]);

      const hrEvents: any[] = [];
      const memberEvents: any[] = [];

      hrSocket.on('ROLE_AUDIT_CREATED', (e) => hrEvents.push(e));
      memberSocket.on('ROLE_AUDIT_CREATED', (e) => memberEvents.push(e));

      publishDomainEvent({
        type: 'ROLE_AUDIT_CREATED',
        organizationId: 'org-rt-1',
        entityId: 'aud-999',
        payload: { changedBy: 'Sarah HR', newRole: 'TEAM_LEAD' },
      });

      await new Promise((r) => setTimeout(r, 100));

      hrSocket.disconnect();
      memberSocket.disconnect();

      expect(hrEvents.length).toBe(1);
      expect(hrEvents[0].payload.newRole).toBe('TEAM_LEAD');
      expect(memberEvents.length).toBe(0);
    });

    it('Personal ROLE_CHANGED event delivers directly to targeted user socket', async () => {
      const targetUserSocket = ClientSocket(`http://127.0.0.1:${serverPort}`, {
        path: '/socket.io',
        transports: ['websocket'],
        extraHeaders: { authorization: `Bearer ${memberToken}` },
      });

      await new Promise((res) => targetUserSocket.on('CONNECTED', res));

      const roleEvents: any[] = [];
      targetUserSocket.on('ROLE_CHANGED', (e) => roleEvents.push(e));

      publishDomainEvent({
        type: 'ROLE_CHANGED',
        organizationId: 'org-rt-1',
        targetUserId: 'rt-member-id',
        payload: { newRole: UserRole.TEAM_LEAD },
      });

      await new Promise((r) => setTimeout(r, 100));

      targetUserSocket.disconnect();

      expect(roleEvents.length).toBe(1);
      expect(roleEvents[0].payload.newRole).toBe(UserRole.TEAM_LEAD);
    });

    it('Account suspension (EMPLOYEE_SUSPENDED) terminates active user socket connection', async () => {
      const memberSocket = ClientSocket(`http://127.0.0.1:${serverPort}`, {
        path: '/socket.io',
        transports: ['websocket'],
        extraHeaders: { authorization: `Bearer ${memberToken}` },
      });

      await new Promise((res) => memberSocket.on('CONNECTED', res));

      const disconnectPromise = new Promise((resolve) => {
        memberSocket.on('disconnect', (reason) => {
          resolve(reason);
        });
      });

      publishDomainEvent({
        type: 'EMPLOYEE_SUSPENDED',
        organizationId: 'org-rt-1',
        targetUserId: 'rt-member-id',
        payload: { accountStatus: AccountStatus.SUSPENDED },
      });

      const disconnectReason = await disconnectPromise;
      expect(disconnectReason).toBeTruthy();
    });
  });

  describe('4. Global Domain Event Bus Delivery across Features', () => {
    it('Attendance check-in and check-out events broadcast to organization', async () => {
      const socket = ClientSocket(`http://127.0.0.1:${serverPort}`, {
        path: '/socket.io',
        transports: ['websocket'],
        extraHeaders: { authorization: `Bearer ${memberToken}` },
      });

      await new Promise((res) => socket.on('CONNECTED', res));

      const captured: any[] = [];
      socket.on('EMPLOYEE_CHECKED_IN', (e) => captured.push(e));
      socket.on('EMPLOYEE_CHECKED_OUT', (e) => captured.push(e));

      publishDomainEvent({
        type: 'EMPLOYEE_CHECKED_IN',
        organizationId: 'org-rt-1',
        entityId: 'att-1',
        targetUserId: 'rt-member-id',
        payload: { arrivedAt: new Date().toISOString(), state: 'IN' },
      });

      publishDomainEvent({
        type: 'EMPLOYEE_CHECKED_OUT',
        organizationId: 'org-rt-1',
        entityId: 'att-1',
        targetUserId: 'rt-member-id',
        payload: { leftAt: new Date().toISOString(), state: 'OUT', durationSeconds: 1800 },
      });

      await new Promise((r) => setTimeout(r, 100));
      socket.disconnect();

      expect(captured.length).toBe(2);
      expect(captured[0].type).toBe('EMPLOYEE_CHECKED_IN');
      expect(captured[1].type).toBe('EMPLOYEE_CHECKED_OUT');
    });

    it('Task status updates reach the assignee and admins, but not an unrelated member', async () => {
      const assigneeSocket = ClientSocket(`http://127.0.0.1:${serverPort}`, {
        path: '/socket.io',
        transports: ['websocket'],
        extraHeaders: { authorization: `Bearer ${memberToken}` },
      });
      const adminSocket = ClientSocket(`http://127.0.0.1:${serverPort}`, {
        path: '/socket.io',
        transports: ['websocket'],
        extraHeaders: { authorization: `Bearer ${superAdminToken}` },
      });
      const unrelatedSocket = ClientSocket(`http://127.0.0.1:${serverPort}`, {
        path: '/socket.io',
        transports: ['websocket'],
        extraHeaders: { authorization: `Bearer ${hrToken}` },
      });

      await Promise.all([
        new Promise((res) => assigneeSocket.on('CONNECTED', res)),
        new Promise((res) => adminSocket.on('CONNECTED', res)),
        new Promise((res) => unrelatedSocket.on('CONNECTED', res)),
      ]);

      const assigneeCaptured: any[] = [];
      const adminCaptured: any[] = [];
      const unrelatedCaptured: any[] = [];
      assigneeSocket.on('TASK_STATUS_CHANGED', (e) => assigneeCaptured.push(e));
      adminSocket.on('TASK_STATUS_CHANGED', (e) => adminCaptured.push(e));
      unrelatedSocket.on('TASK_STATUS_CHANGED', (e) => unrelatedCaptured.push(e));

      publishDomainEvent({
        type: 'TASK_STATUS_CHANGED',
        organizationId: 'org-rt-1',
        entityId: 'tsk-42',
        targetUserId: 'rt-member-id',
        payload: {
          taskId: 'tsk-42',
          assigneeId: 'rt-member-id',
          previousStatus: TaskStatus.IN_PROGRESS,
          newStatus: TaskStatus.COMPLETED,
        },
      });

      await new Promise((r) => setTimeout(r, 100));
      assigneeSocket.disconnect();
      adminSocket.disconnect();
      unrelatedSocket.disconnect();

      expect(assigneeCaptured.length).toBe(1);
      expect(assigneeCaptured[0].payload.newStatus).toBe(TaskStatus.COMPLETED);
      expect(adminCaptured.length).toBe(1);
      // HR is neither the assignee, creator, admin, nor operations-scoped.
      expect(unrelatedCaptured.length).toBe(0);
    });

    it('Task events never cross organizations, even for an admin socket', async () => {
      const org1AdminSocket = ClientSocket(`http://127.0.0.1:${serverPort}`, {
        path: '/socket.io',
        transports: ['websocket'],
        extraHeaders: { authorization: `Bearer ${superAdminToken}` },
      });

      await new Promise((res) => org1AdminSocket.on('CONNECTED', res));

      const captured: any[] = [];
      org1AdminSocket.on('TASK_CREATED', (e) => captured.push(e));

      publishDomainEvent({
        type: 'TASK_CREATED',
        organizationId: 'org-rt-2',
        entityId: 'tsk-org2',
        targetUserId: 'rt-org2-member-id',
        payload: { title: 'Org 2 Only Task', assigneeId: 'rt-org2-member-id' },
      });

      await new Promise((r) => setTimeout(r, 100));
      org1AdminSocket.disconnect();

      expect(captured.length).toBe(0);
    });

    it('Announcements broadcast to organization', async () => {
      const socket = ClientSocket(`http://127.0.0.1:${serverPort}`, {
        path: '/socket.io',
        transports: ['websocket'],
        extraHeaders: { authorization: `Bearer ${memberToken}` },
      });

      await new Promise((res) => socket.on('CONNECTED', res));

      const captured: any[] = [];
      socket.on('ANNOUNCEMENT_CREATED', (e) => captured.push(e));

      publishDomainEvent({
        type: 'ANNOUNCEMENT_CREATED',
        organizationId: 'org-rt-1',
        entityId: 'ann-101',
        payload: { title: 'Global Town Hall' },
      });

      await new Promise((r) => setTimeout(r, 100));
      socket.disconnect();

      expect(captured.length).toBe(1);
      expect(captured[0].payload.title).toBe('Global Town Hall');
    });
  });

  describe('5. Availability Events — privacy-scoped delivery', () => {
    it('delivers to an ADMIN socket regardless of room', async () => {
      const adminSocket = ClientSocket(`http://127.0.0.1:${serverPort}`, {
        path: '/socket.io',
        transports: ['websocket'],
        extraHeaders: { authorization: `Bearer ${superAdminToken}` },
      });
      await new Promise((res) => adminSocket.on('CONNECTED', res));

      const captured: any[] = [];
      adminSocket.on('AVAILABILITY_CHANGED', (e) => captured.push(e));

      publishDomainEvent({
        type: 'AVAILABILITY_CHANGED',
        organizationId: 'org-rt-1',
        entityId: 'rt-member-id',
        targetUserId: 'rt-member-id',
        payload: { userId: 'rt-member-id', personId: 'rt-member-id', organizationId: 'org-rt-1', roomId: 'room-A' },
      });

      await new Promise((r) => setTimeout(r, 100));
      adminSocket.disconnect();

      expect(captured.length).toBe(1);
    });

    it('always delivers to the affected user\'s own socket', async () => {
      const memberSocket = ClientSocket(`http://127.0.0.1:${serverPort}`, {
        path: '/socket.io',
        transports: ['websocket'],
        extraHeaders: { authorization: `Bearer ${memberToken}` },
      });
      await new Promise((res) => memberSocket.on('CONNECTED', res));

      const captured: any[] = [];
      memberSocket.on('AVAILABILITY_CHANGED', (e) => captured.push(e));

      publishDomainEvent({
        type: 'AVAILABILITY_CHANGED',
        organizationId: 'org-rt-1',
        entityId: 'rt-member-id',
        targetUserId: 'rt-member-id',
        payload: { userId: 'rt-member-id', personId: 'rt-member-id', organizationId: 'org-rt-1' },
      });

      await new Promise((r) => setTimeout(r, 100));
      memberSocket.disconnect();

      expect(captured.length).toBe(1);
    });

    it('delivers to the SERVER overseeing the affected user\'s room, but not a SERVER overseeing a different room', async () => {
      const serverA = ClientSocket(`http://127.0.0.1:${serverPort}`, {
        path: '/socket.io',
        transports: ['websocket'],
        extraHeaders: { authorization: `Bearer ${serverRoomAToken}` },
      });
      const serverB = ClientSocket(`http://127.0.0.1:${serverPort}`, {
        path: '/socket.io',
        transports: ['websocket'],
        extraHeaders: { authorization: `Bearer ${serverRoomBToken}` },
      });

      await Promise.all([
        new Promise((res) => serverA.on('CONNECTED', res)),
        new Promise((res) => serverB.on('CONNECTED', res)),
      ]);

      const capturedA: any[] = [];
      const capturedB: any[] = [];
      serverA.on('AVAILABILITY_CHANGED', (e) => capturedA.push(e));
      serverB.on('AVAILABILITY_CHANGED', (e) => capturedB.push(e));

      publishDomainEvent({
        type: 'AVAILABILITY_CHANGED',
        organizationId: 'org-rt-1',
        entityId: 'rt-org1-target',
        targetUserId: 'rt-org1-target',
        payload: { userId: 'rt-org1-target', personId: 'rt-org1-target', organizationId: 'org-rt-1', roomId: 'room-A' },
      });

      await new Promise((r) => setTimeout(r, 100));
      serverA.disconnect();
      serverB.disconnect();

      expect(capturedA.length).toBe(1);
      expect(capturedB.length).toBe(0);
    });

    it('does NOT deliver to an unrelated MEMBER outside the target\'s scope', async () => {
      const memberSocket = ClientSocket(`http://127.0.0.1:${serverPort}`, {
        path: '/socket.io',
        transports: ['websocket'],
        extraHeaders: { authorization: `Bearer ${memberToken}` },
      });
      await new Promise((res) => memberSocket.on('CONNECTED', res));

      const captured: any[] = [];
      memberSocket.on('AVAILABILITY_CHANGED', (e) => captured.push(e));

      publishDomainEvent({
        type: 'AVAILABILITY_CHANGED',
        organizationId: 'org-rt-1',
        entityId: 'rt-org1-target',
        targetUserId: 'rt-org1-target',
        payload: { userId: 'rt-org1-target', personId: 'rt-org1-target', organizationId: 'org-rt-1', roomId: 'room-A' },
      });

      await new Promise((r) => setTimeout(r, 100));
      memberSocket.disconnect();

      expect(captured.length).toBe(0);
    });
  });
});
