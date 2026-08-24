import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AccountStatus, PresenceState, UserRole, UserStatus } from '@prisma/client';
import { TeamAllocationService } from '../src/services/team-allocation.service.js';

// ---------------------------------------------------------------------------
// Mock topology: Sections A, C, D (8 subrooms each, capacity 2) — enough to
// exercise cross-section moves and cross-event independence without
// generating all 8 sections.
// ---------------------------------------------------------------------------
const ORG = 'org-1';
const SECTIONS = ['A', 'C', 'D'];

const mockRoomsMeta = SECTIONS.map((letter) => ({ id: `room-${letter}`, letter, organizationId: ORG }));
const mockSubroomsMeta: Array<{ id: string; code: string; roomId: string; number: number; memberCapacity: number }> = [];
for (const room of mockRoomsMeta) {
  for (let n = 1; n <= 8; n++) {
    mockSubroomsMeta.push({ id: `subroom-${room.letter}${n}`, code: `${room.letter}${n}`, roomId: room.id, number: n, memberCapacity: 2 });
  }
}

const EVT_1 = 'evt-1';
const EVT_2 = 'evt-2';
const EVT_COMPLETED = 'evt-completed';
const TEAM_ALPHA = 'team-alpha';
const TEAM_BETA = 'team-beta';

let mockUsers: any[] = [];
let mockTeams: any[] = [];
let mockPlacements: any[] = [];
let mockEvents: any[] = [];

function resetMockData() {
  const future1 = new Date(Date.now() + 3 * 24 * 3600000);
  const future1End = new Date(future1.getTime() + 8 * 3600000);
  const future2 = new Date(Date.now() + 5 * 24 * 3600000);
  const future2End = new Date(future2.getTime() + 8 * 3600000);

  mockTeams = [
    { id: TEAM_ALPHA, organizationId: ORG, name: 'Team Alpha', leadId: 'lead-1' },
    { id: TEAM_BETA, organizationId: ORG, name: 'Team Beta', leadId: null },
  ];

  mockEvents = [
    { id: EVT_1, organizationId: ORG, title: 'Summit', scheduledAt: future1, scheduledEndAt: future1End, completedAt: null, status: 'UPCOMING' },
    { id: EVT_2, organizationId: ORG, title: 'Mixer', scheduledAt: future2, scheduledEndAt: future2End, completedAt: null, status: 'UPCOMING' },
    { id: EVT_COMPLETED, organizationId: ORG, title: 'Past Event', scheduledAt: new Date(Date.now() - 10 * 24 * 3600000), scheduledEndAt: new Date(Date.now() - 9 * 24 * 3600000), completedAt: new Date(Date.now() - 9 * 24 * 3600000), status: 'UPCOMING' },
  ];

  mockUsers = [
    { id: 'lead-1', organizationId: ORG, name: 'Priya Lead', email: 'priya@org.corp', role: UserRole.TEAM_LEAD, accountStatus: AccountStatus.ACTIVE, status: UserStatus.ONLINE, presenceState: PresenceState.IN, teamId: TEAM_ALPHA, roomId: null, subroomId: null },
  ];
  // 20 ACTIVE MEMBER users on Team Alpha — more than a single section's 16-seat
  // capacity, so the "positioned vs pool" split has something real to test.
  // m17-m20 start presence OUT — unavailable, but must still be selectable for
  // an *initial* fill (presence-independent planning eligibility).
  for (let i = 1; i <= 20; i++) {
    const idx = String(i).padStart(2, '0');
    mockUsers.push({
      id: `m${idx}`,
      organizationId: ORG,
      name: `Member ${idx}`,
      email: `member${idx}@org.corp`,
      role: UserRole.MEMBER,
      accountStatus: AccountStatus.ACTIVE,
      status: i > 16 ? UserStatus.OFFLINE : UserStatus.ONLINE,
      presenceState: i > 16 ? PresenceState.OUT : PresenceState.IN,
      teamId: TEAM_ALPHA,
      roomId: null,
      subroomId: null,
    });
  }
  // A PENDING account on the same team — must never be eligible.
  mockUsers.push({ id: 'm-pending', organizationId: ORG, name: 'Pending Member', email: 'pending@org.corp', role: UserRole.MEMBER, accountStatus: AccountStatus.PENDING, status: UserStatus.OFFLINE, presenceState: PresenceState.UNKNOWN, teamId: TEAM_ALPHA, roomId: null, subroomId: null });
  // A different team's members — must never leak into Team Alpha's pool.
  for (let i = 1; i <= 2; i++) {
    mockUsers.push({ id: `beta-${i}`, organizationId: ORG, name: `Beta Member ${i}`, email: `beta${i}@org.corp`, role: UserRole.MEMBER, accountStatus: AccountStatus.ACTIVE, status: UserStatus.ONLINE, presenceState: PresenceState.IN, teamId: TEAM_BETA, roomId: null, subroomId: null });
  }

  mockPlacements = [];
}

function findUser(id: string) {
  return mockUsers.find((u) => u.id === id) || null;
}

const { mockPrisma, publishedEvents } = vi.hoisted(() => ({
  mockPrisma: {} as any,
  publishedEvents: [] as any[],
}));

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

Object.assign(mockPrisma, {
  team: {
    findMany: vi.fn(async ({ where }: any = {}) => {
      const list = mockTeams.filter((t) => !where?.organizationId || t.organizationId === where.organizationId);
      return list;
    }),
    findFirst: vi.fn(async ({ where }: any) => {
      let list = [...mockTeams];
      if (where.id) list = list.filter((t) => t.id === where.id);
      if (where.organizationId) list = list.filter((t) => t.organizationId === where.organizationId);
      if (where.name) list = list.filter((t) => t.name === where.name);
      if (where.id?.not) list = list.filter((t) => t.id !== where.id.not);
      const found = list[0];
      if (!found) return null;
      const lead = found.leadId ? findUser(found.leadId) : null;
      const members = mockUsers.filter((u) => u.teamId === found.id).sort((a, b) => a.name.localeCompare(b.name));
      return { ...found, lead, members };
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
        ...(include?.user ? { user: (() => { const u = findUser(p.userId)!; return { id: u.id, name: u.name, email: u.email, role: u.role, accountStatus: u.accountStatus, status: u.status, presenceState: u.presenceState, title: u.title, avatarUrl: u.avatarUrl }; })() } : {}),
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
      const row = { id: `placement-${mockPlacements.length}-${Math.random()}`, createdAt: new Date(), updatedAt: new Date(), ...data };
      mockPlacements.push(row);
      return { ...row };
    }),
    createMany: vi.fn(async ({ data }: any) => {
      for (const d of data) mockPlacements.push({ id: `placement-${mockPlacements.length}-${Math.random()}`, createdAt: new Date(), updatedAt: new Date(), ...d });
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
      const row = { id: `placement-${mockPlacements.length}-${Math.random()}`, createdAt: new Date(), updatedAt: new Date(), ...create };
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

const ACTOR = { organizationId: ORG, id: 'admin-1' };

describe('TeamAllocationService — event-scoped bulk placement', () => {
  beforeEach(() => {
    resetMockData();
    publishedEvents.length = 0;
  });

  describe('getSectionPlacementPreview', () => {
    it('starts with zero positioned and every ACTIVE MEMBER on the team in the pool, excluding PENDING and other teams', async () => {
      const preview = await TeamAllocationService.getSectionPlacementPreview(TEAM_ALPHA, EVT_1, 'C', ORG);

      expect(preview.totalPositioned).toBe(0);
      expect(preview.totalCapacity).toBe(16);
      expect(preview.poolCount).toBe(20); // 20 ACTIVE members, PENDING and Team Beta excluded
      expect(preview.pool.some((u) => u.id === 'm-pending')).toBe(false);
      expect(preview.pool.some((u) => u.id.startsWith('beta-'))).toBe(false);
    });
  });

  describe('allocateTeamToSection — initial fill', () => {
    it('fills exactly 16 seats (2 per subroom x 8), never exceeding capacity', async () => {
      const preview = await TeamAllocationService.allocateTeamToSection(TEAM_ALPHA, EVT_1, 'C', ACTOR);

      expect(preview.totalPositioned).toBe(16);
      for (const s of preview.subrooms) {
        expect(s.placedCount).toBeLessThanOrEqual(2);
      }
      expect(preview.poolCount).toBe(4); // 20 eligible - 16 positioned
    });

    it('eligibility for the initial fill is presence-independent — OUT members (m17-m20) can still be selected', async () => {
      // m01..m16 are IN, m17..m20 are OUT. Alphabetical fill order pulls m01
      // first, but with only 16 seats and 20 eligible members ordered by name
      // (Member 01..Member 20), the first 16 alphabetically are m01-m16 — all
      // IN. To prove presence independence, mark m01-m04 OUT/UNAVAILABLE too,
      // forcing some OUT members into the fill.
      findUser('m01')!.presenceState = PresenceState.OUT;
      findUser('m02')!.presenceState = PresenceState.OUT;
      findUser('m03')!.presenceState = PresenceState.OUT;
      findUser('m04')!.presenceState = PresenceState.OUT;

      const preview = await TeamAllocationService.allocateTeamToSection(TEAM_ALPHA, EVT_1, 'C', ACTOR);

      // Still fills all 16 seats despite 4 of the first-alphabetical members being OUT.
      expect(preview.totalPositioned).toBe(16);
      const placedIds = preview.subrooms.flatMap((s) => s.members.map((m) => m.id));
      expect(placedIds).toEqual(expect.arrayContaining(['m01', 'm02', 'm03', 'm04']));
    });

    it('does not touch User.roomId/subroomId — placement is a fully independent axis', async () => {
      await TeamAllocationService.allocateTeamToSection(TEAM_ALPHA, EVT_1, 'C', ACTOR);
      for (const u of mockUsers) {
        if (u.teamId === TEAM_ALPHA && u.role === UserRole.MEMBER) {
          expect(u.roomId).toBeNull();
          expect(u.subroomId).toBeNull();
        }
      }
    });

    it('rejects allocation for a COMPLETED event', async () => {
      await expect(TeamAllocationService.allocateTeamToSection(TEAM_ALPHA, EVT_COMPLETED, 'C', ACTOR)).rejects.toThrow(
        /completed/i
      );
    });
  });

  describe('moving a team to a different section preserves identity', () => {
    it('re-seats the same 16 people rather than drawing a fresh set', async () => {
      const first = await TeamAllocationService.allocateTeamToSection(TEAM_ALPHA, EVT_1, 'C', ACTOR);
      const firstIds = new Set(first.subrooms.flatMap((s) => s.members.map((m) => m.id)));
      expect(firstIds.size).toBe(16);

      const moved = await TeamAllocationService.allocateTeamToSection(TEAM_ALPHA, EVT_1, 'D', ACTOR);
      const movedIds = new Set(moved.subrooms.flatMap((s) => s.members.map((m) => m.id)));

      expect(movedIds).toEqual(firstIds);
      expect(moved.section.letter).toBe('D');
      // Section C must now be empty for this event — the team fully moved, not duplicated.
      const cAfterMove = await TeamAllocationService.getSectionPlacementPreview(TEAM_ALPHA, EVT_1, 'C', ORG);
      expect(cAfterMove.totalPositioned).toBe(0);
    });
  });

  describe('cross-event independence', () => {
    it('positioning the same team in two different sections for two different events does not conflict', async () => {
      await TeamAllocationService.allocateTeamToSection(TEAM_ALPHA, EVT_1, 'C', ACTOR);
      await TeamAllocationService.allocateTeamToSection(TEAM_ALPHA, EVT_2, 'A', ACTOR);

      const evt1Preview = await TeamAllocationService.getSectionPlacementPreview(TEAM_ALPHA, EVT_1, 'C', ORG);
      const evt2Preview = await TeamAllocationService.getSectionPlacementPreview(TEAM_ALPHA, EVT_2, 'A', ORG);

      expect(evt1Preview.totalPositioned).toBe(16);
      expect(evt2Preview.totalPositioned).toBe(16);
    });
  });

  describe('replacePlacement — presence-gated eligibility', () => {
    it('flags a positioned member whose presence is OUT as needing replacement, and swaps in a distinct pool member', async () => {
      await TeamAllocationService.allocateTeamToSection(TEAM_ALPHA, EVT_1, 'C', ACTOR);
      const before = await TeamAllocationService.getSectionPlacementPreview(TEAM_ALPHA, EVT_1, 'C', ORG);
      const placedIds = before.subrooms.flatMap((s) => s.members.map((m) => m.id));
      // m01-m16 are IN (IN presence) per resetMockData; force one OUT after placement.
      const targetId = placedIds[0];
      findUser(targetId)!.presenceState = PresenceState.OUT;

      const flagged = await TeamAllocationService.getSectionPlacementPreview(TEAM_ALPHA, EVT_1, 'C', ORG);
      const flaggedMember = flagged.subrooms.flatMap((s) => s.members).find((m) => m.id === targetId);
      expect(flaggedMember?.needsReplacement).toBe(true);

      const result = await TeamAllocationService.replacePlacement(TEAM_ALPHA, EVT_1, targetId, ACTOR);
      expect(result.removedUserId).toBe(targetId);
      expect(result.replacedByUserId).toBeTruthy();
      expect(result.replacedByUserId).not.toBe(targetId);
      expect(placedIds).not.toContain(result.replacedByUserId); // drawn from the pool, not already-placed

      const after = await TeamAllocationService.getSectionPlacementPreview(TEAM_ALPHA, EVT_1, 'C', ORG);
      expect(after.totalPositioned).toBe(16); // still full — one-for-one swap
      expect(after.subrooms.some((s) => s.members.some((m) => m.id === targetId))).toBe(false);
    });
  });

  describe('overridePlacement — manual single-person move', () => {
    it('moves one person to a specific subroom without touching anyone else', async () => {
      await TeamAllocationService.allocateTeamToSection(TEAM_ALPHA, EVT_1, 'C', ACTOR);
      const before = await TeamAllocationService.getSectionPlacementPreview(TEAM_ALPHA, EVT_1, 'C', ORG);

      // A full 16/16 allocation leaves no free seat anywhere in the section —
      // free up C8 the way an admin naturally would (clear one seat), so the
      // override has somewhere to actually move a person into.
      const vacated = before.subrooms.find((s) => s.subroomCode === 'C8')!.members[0];
      mockPlacements = mockPlacements.filter((p) => !(p.eventId === EVT_1 && p.userId === vacated.id));

      const otherSubroomMember = before.subrooms.find((s) => s.subroomCode === 'C1')!.members[0];
      const untouchedPeer = before.subrooms.find((s) => s.subroomCode === 'C1')!.members[1];

      const preview = await TeamAllocationService.overridePlacement(TEAM_ALPHA, EVT_1, otherSubroomMember.id, 'C8', ACTOR);

      const c1 = preview.subrooms.find((s) => s.subroomCode === 'C1')!;
      const c8 = preview.subrooms.find((s) => s.subroomCode === 'C8')!;
      expect(c8.members.some((m) => m.id === otherSubroomMember.id)).toBe(true);
      expect(c1.members.some((m) => m.id === otherSubroomMember.id)).toBe(false);
      // The peer left behind in C1 is untouched by the move.
      expect(c1.members.some((m) => m.id === untouchedPeer.id)).toBe(true);
      expect(preview.totalPositioned).toBe(15); // 16 - 1 vacated, moving doesn't add anyone
    });

    it('rejects moving into a subroom already at capacity for this event', async () => {
      await TeamAllocationService.allocateTeamToSection(TEAM_ALPHA, EVT_1, 'C', ACTOR);
      const before = await TeamAllocationService.getSectionPlacementPreview(TEAM_ALPHA, EVT_1, 'C', ORG);
      const fullSubroom = before.subrooms.find((s) => s.placedCount === 2)!;
      const outsider = before.pool[0];

      await expect(
        TeamAllocationService.overridePlacement(TEAM_ALPHA, EVT_1, outsider.id, fullSubroom.subroomCode, ACTOR)
      ).rejects.toThrow(/capacity/i);
    });
  });

  describe('clearTeamPlacement', () => {
    it('removes only this event\'s placements, leaving other events untouched', async () => {
      await TeamAllocationService.allocateTeamToSection(TEAM_ALPHA, EVT_1, 'C', ACTOR);
      await TeamAllocationService.allocateTeamToSection(TEAM_ALPHA, EVT_2, 'A', ACTOR);

      await TeamAllocationService.clearTeamPlacement(TEAM_ALPHA, EVT_1, ACTOR);

      const evt1After = await TeamAllocationService.getSectionPlacementPreview(TEAM_ALPHA, EVT_1, 'C', ORG);
      const evt2After = await TeamAllocationService.getSectionPlacementPreview(TEAM_ALPHA, EVT_2, 'A', ORG);
      expect(evt1After.totalPositioned).toBe(0);
      expect(evt2After.totalPositioned).toBe(16);
    });
  });

  describe('realtime', () => {
    it('publishes TEAM_EVENT_PLACEMENT_CHANGED on allocate', async () => {
      await TeamAllocationService.allocateTeamToSection(TEAM_ALPHA, EVT_1, 'C', ACTOR);
      const evt = publishedEvents.find((e) => e.type === 'TEAM_EVENT_PLACEMENT_CHANGED');
      expect(evt).toBeDefined();
      expect(evt.payload).toMatchObject({ teamId: TEAM_ALPHA, eventId: EVT_1, sectionLetter: 'C', action: 'ALLOCATE' });
    });
  });
});
