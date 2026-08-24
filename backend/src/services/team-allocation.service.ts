import { prisma } from '../db/client.js';
import { AccountStatus, UserRole } from '@prisma/client';
import { publishDomainEvent } from '../events/domain-events.js';
import { TeamService, teamMemberSelect } from './team.service.js';
import { deriveEventStatus } from './org-event.service.js';
import { deriveAvailability, availabilityFromUserStatus } from '../utils/availability-projection.js';

// Standalone from RoomService / server-positioning.ts by design — this
// engine only ever writes TeamEventPlacement rows, never User.roomId /
// User.subroomId (the separate, non-event-scoped "permanent desk" field),
// and never touches SERVER-role positioning at all.

export class TeamAllocationError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

interface Actor {
  organizationId: string;
  id: string;
}

async function getSectionOrThrow(sectionLetter: string, organizationId: string) {
  const letter = sectionLetter.toUpperCase();
  const room = await prisma.room.findFirst({ where: { letter, organizationId } });
  if (!room) {
    throw new TeamAllocationError(`Section ${letter} does not exist for this organization.`, 404);
  }
  return room;
}

async function assertEventWritable(eventId: string, organizationId: string) {
  const event = await prisma.organizationEvent.findFirst({ where: { id: eventId, organizationId } });
  if (!event) {
    throw new TeamAllocationError('Event not found', 404);
  }
  const effectiveStatus = deriveEventStatus(event.scheduledAt, event.scheduledEndAt, event.completedAt, event.status);
  if (effectiveStatus === 'COMPLETED' || effectiveStatus === 'CANCELLED') {
    throw new TeamAllocationError(
      `Cannot change team positioning for a ${effectiveStatus.toLowerCase()} event.`,
      400
    );
  }
  return event;
}

function publishPlacementChanged(
  organizationId: string,
  teamId: string,
  eventId: string,
  sectionLetter: string | null,
  action: 'ALLOCATE' | 'REPLACE' | 'OVERRIDE' | 'CLEAR'
) {
  publishDomainEvent({
    type: 'TEAM_EVENT_PLACEMENT_CHANGED',
    organizationId,
    entityId: teamId,
    payload: { teamId, eventId, sectionLetter, action, timestamp: new Date().toISOString() },
  });
}

export class TeamAllocationService {
  /**
   * Preview: who from this team is currently positioned in the given
   * section for this event, and who else on the team is eligible and still
   * in the available pool. Presence-independent eligibility (see class doc)
   * — this is a planning view, not a live-only one.
   */
  static async getSectionPlacementPreview(
    teamId: string,
    eventId: string,
    sectionLetter: string,
    organizationId: string
  ) {
    const team = await TeamService.getTeam(teamId, organizationId);
    const event = await prisma.organizationEvent.findFirst({ where: { id: eventId, organizationId } });
    if (!event) {
      throw new TeamAllocationError('Event not found', 404);
    }
    const room = await getSectionOrThrow(sectionLetter, organizationId);
    const subrooms = await prisma.subroom.findMany({ where: { roomId: room.id }, orderBy: { number: 'asc' } });

    const placements = await prisma.teamEventPlacement.findMany({
      where: { eventId, teamId },
      include: { user: { select: teamMemberSelect } },
    });

    const decorate = (user: (typeof placements)[number]['user']) => ({
      ...user,
      needsReplacement:
        deriveAvailability({
          presenceState: user.presenceState,
          storedState: availabilityFromUserStatus(user.status),
        }).state === 'UNAVAILABLE',
    });

    const inSection = placements.filter((p) => p.roomId === room.id);
    const elsewhere = placements.filter((p) => p.roomId !== room.id);
    let currentSectionLetter: string | null = null;
    if (elsewhere.length > 0) {
      const elsewhereRoom = await prisma.room.findUnique({ where: { id: elsewhere[0].roomId } });
      currentSectionLetter = elsewhereRoom?.letter ?? null;
    }

    const subroomSummaries = subrooms.map((s) => {
      const placed = inSection.filter((p) => p.subroomId === s.id);
      return {
        subroomCode: s.code,
        capacity: s.memberCapacity,
        placedCount: placed.length,
        members: placed.map((p) => decorate(p.user)),
      };
    });

    const positionedUserIds = new Set(placements.map((p) => p.userId));
    const [pool, totalTeamMembers] = await Promise.all([
      prisma.user.findMany({
        where: {
          organizationId,
          teamId,
          role: UserRole.MEMBER,
          accountStatus: AccountStatus.ACTIVE,
          id: { notIn: [...positionedUserIds] },
        },
        orderBy: { name: 'asc' },
        select: teamMemberSelect,
      }),
      prisma.user.count({ where: { organizationId, teamId, role: UserRole.MEMBER } }),
    ]);

    return {
      team: { id: team.id, name: team.name, lead: team.lead },
      event: { id: event.id, title: event.title },
      section: { letter: room.letter, roomId: room.id },
      subrooms: subroomSummaries,
      totalPositioned: subroomSummaries.reduce((sum, s) => sum + s.placedCount, 0),
      totalCapacity: subrooms.reduce((sum, s) => sum + s.memberCapacity, 0),
      totalTeamMembers,
      pool,
      poolCount: pool.length,
      currentSectionLetter,
    };
  }

  /**
   * Bulk-allocate (or move) a team into a section for an event. If the team
   * already has placements for this event in a different section, the same
   * people are re-seated (identity-preserving) rather than re-rolled — only
   * the leftover open seats get freshly drawn from the eligible pool. This
   * makes "allocate" and "move to a new section" the same operation.
   */
  static async allocateTeamToSection(teamId: string, eventId: string, sectionLetter: string, actor: Actor) {
    await TeamService.getTeam(teamId, actor.organizationId);
    await assertEventWritable(eventId, actor.organizationId);
    const room = await getSectionOrThrow(sectionLetter, actor.organizationId);
    const subrooms = await prisma.subroom.findMany({ where: { roomId: room.id }, orderBy: { number: 'asc' } });
    if (subrooms.length === 0) {
      throw new TeamAllocationError(`Section ${room.letter} has no subrooms configured.`, 400);
    }

    await prisma.$transaction(async (tx) => {
      const existingPlacements = await tx.teamEventPlacement.findMany({
        where: { teamId, eventId },
        orderBy: { createdAt: 'asc' },
      });
      const existingUserIds = existingPlacements.map((p) => p.userId);

      // Seats in the target section already claimed by a *different* team's
      // placement for this same event — independent capacity accounting,
      // never merged with the legacy permanent-desk occupancy.
      const targetSubroomIds = subrooms.map((s) => s.id);
      const otherTeamOccupants = await tx.teamEventPlacement.findMany({
        where: { eventId, subroomId: { in: targetSubroomIds }, teamId: { not: teamId } },
      });
      const usedByOthers = new Map<string, number>();
      for (const p of otherTeamOccupants) {
        usedByOthers.set(p.subroomId, (usedByOthers.get(p.subroomId) ?? 0) + 1);
      }

      const totalCapacity = subrooms.reduce(
        (sum, s) => sum + Math.max(0, s.memberCapacity - (usedByOthers.get(s.id) ?? 0)),
        0
      );

      // Always clear first — the loop below re-creates every row, whether
      // re-seating an existing person or drawing a fresh one from the pool.
      if (existingPlacements.length > 0) {
        await tx.teamEventPlacement.deleteMany({ where: { teamId, eventId } });
      }

      let orderedUserIds = existingUserIds;
      if (orderedUserIds.length > totalCapacity) {
        orderedUserIds = orderedUserIds.slice(0, totalCapacity);
      } else if (orderedUserIds.length < totalCapacity) {
        const needed = totalCapacity - orderedUserIds.length;
        const pool = await tx.user.findMany({
          where: {
            organizationId: actor.organizationId,
            teamId,
            role: UserRole.MEMBER,
            accountStatus: AccountStatus.ACTIVE,
            id: { notIn: existingUserIds },
          },
          orderBy: { name: 'asc' },
          take: needed,
        });
        orderedUserIds = [...orderedUserIds, ...pool.map((u) => u.id)];
      }

      const rows: { userId: string; subroomId: string }[] = [];
      let cursor = 0;
      for (const subroom of subrooms) {
        let free = Math.max(0, subroom.memberCapacity - (usedByOthers.get(subroom.id) ?? 0));
        while (free > 0 && cursor < orderedUserIds.length) {
          rows.push({ userId: orderedUserIds[cursor], subroomId: subroom.id });
          cursor++;
          free--;
        }
        if (cursor >= orderedUserIds.length) break;
      }

      if (rows.length > 0) {
        await tx.teamEventPlacement.createMany({
          data: rows.map((r) => ({
            organizationId: actor.organizationId,
            eventId,
            teamId,
            userId: r.userId,
            roomId: room.id,
            subroomId: r.subroomId,
            positionedById: actor.id,
          })),
        });
      }
    });

    publishPlacementChanged(actor.organizationId, teamId, eventId, room.letter, 'ALLOCATE');
    return this.getSectionPlacementPreview(teamId, eventId, room.letter, actor.organizationId);
  }

  /** Clears one positioned member's seat and pulls the next eligible pool member into it. */
  static async replacePlacement(teamId: string, eventId: string, userId: string, actor: Actor) {
    await TeamService.getTeam(teamId, actor.organizationId);
    await assertEventWritable(eventId, actor.organizationId);

    const placement = await prisma.teamEventPlacement.findUnique({ where: { eventId_userId: { eventId, userId } } });
    if (!placement || placement.teamId !== teamId) {
      throw new TeamAllocationError('This person is not currently positioned for this event.', 404);
    }

    const result = await prisma.$transaction(async (tx) => {
      const existingUserIds = (
        await tx.teamEventPlacement.findMany({ where: { teamId, eventId }, select: { userId: true } })
      ).map((p) => p.userId);

      const replacement = await tx.user.findFirst({
        where: {
          organizationId: actor.organizationId,
          teamId,
          role: UserRole.MEMBER,
          accountStatus: AccountStatus.ACTIVE,
          id: { notIn: existingUserIds },
        },
        orderBy: { name: 'asc' },
      });

      await tx.teamEventPlacement.delete({ where: { eventId_userId: { eventId, userId } } });

      if (replacement) {
        await tx.teamEventPlacement.create({
          data: {
            organizationId: actor.organizationId,
            eventId,
            teamId,
            userId: replacement.id,
            roomId: placement.roomId,
            subroomId: placement.subroomId,
            positionedById: actor.id,
          },
        });
      }

      return { removedUserId: userId, replacedByUserId: replacement?.id ?? null };
    });

    const room = await prisma.room.findUnique({ where: { id: placement.roomId } });
    publishPlacementChanged(actor.organizationId, teamId, eventId, room?.letter ?? null, 'REPLACE');
    return result;
  }

  /**
   * Manual single-person override — moves one team member to a specific
   * subroom for this event without touching anyone else's placement. This
   * is the event-scoped analog of the pre-existing RoomAssignmentModal
   * override; it never writes to User.roomId/subroomId.
   */
  static async overridePlacement(
    teamId: string,
    eventId: string,
    userId: string,
    newSubroomCode: string,
    actor: Actor
  ) {
    await TeamService.getTeam(teamId, actor.organizationId);
    await assertEventWritable(eventId, actor.organizationId);

    const member = await prisma.user.findFirst({ where: { id: userId, organizationId: actor.organizationId, teamId } });
    if (!member) {
      throw new TeamAllocationError('User is not a member of this team.', 404);
    }

    const code = newSubroomCode.toUpperCase();
    const sectionLetter = code[0];
    const room = await getSectionOrThrow(sectionLetter, actor.organizationId);
    const subroom = await prisma.subroom.findFirst({ where: { code, roomId: room.id } });
    if (!subroom) {
      throw new TeamAllocationError(`Subroom ${code} does not exist.`, 404);
    }

    const occupancy = await prisma.teamEventPlacement.count({
      where: { eventId, subroomId: subroom.id, userId: { not: userId } },
    });
    if (occupancy >= subroom.memberCapacity) {
      throw new TeamAllocationError(
        `Subroom ${code} is at capacity (${occupancy}/${subroom.memberCapacity}) for this event.`
      );
    }

    await prisma.teamEventPlacement.upsert({
      where: { eventId_userId: { eventId, userId } },
      create: {
        organizationId: actor.organizationId,
        eventId,
        teamId,
        userId,
        roomId: room.id,
        subroomId: subroom.id,
        positionedById: actor.id,
      },
      update: { teamId, roomId: room.id, subroomId: subroom.id, positionedById: actor.id },
    });

    publishPlacementChanged(actor.organizationId, teamId, eventId, sectionLetter, 'OVERRIDE');
    return this.getSectionPlacementPreview(teamId, eventId, sectionLetter, actor.organizationId);
  }

  /** Clears every placement this team has for the given event (undo). */
  static async clearTeamPlacement(teamId: string, eventId: string, actor: Actor) {
    await TeamService.getTeam(teamId, actor.organizationId);
    await prisma.teamEventPlacement.deleteMany({ where: { teamId, eventId } });
    publishPlacementChanged(actor.organizationId, teamId, eventId, null, 'CLEAR');
  }
}
