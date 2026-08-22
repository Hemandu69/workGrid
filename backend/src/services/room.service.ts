import { prisma } from '../db/client.js';
import { UserRole } from '@prisma/client';
import { publishDomainEvent } from '../events/domain-events.js';

export class RoomAssignmentError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

export interface RoomAssignmentState {
  personId: string;
  name: string;
  role: string;
  section: string | null; // e.g. "B"
  subroom: string | null; // e.g. "B3" — always null for SERVER role
  /** Other people currently assigned to the same subroom, derived live — never stored. */
  partners: Array<{ id: string; name: string }>;
}

const SECTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

export class RoomService {
  static async getAllRooms(organizationId?: string) {
    const rooms = await prisma.room.findMany({
      where: organizationId ? { organizationId } : undefined,
      orderBy: { letter: 'asc' },
      include: {
        leadServer: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
            role: true,
            status: true,
          },
        },
        members: {
          where: { role: UserRole.SERVER },
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
            role: true,
            status: true,
            title: true,
          },
        },
        subrooms: {
          orderBy: { number: 'asc' },
          include: {
            members: {
              select: {
                id: true,
                name: true,
                email: true,
                role: true,
                status: true,
                title: true,
                avatarUrl: true,
                currentAllocatedHours: true,
                capacityLimitHours: true,
              },
            },
          },
        },
      },
    });

    // Format response matching frontend expectations
    return rooms.map((room) => {
      // Servers assigned to this room (up to 3)
      const servers = room.members || [];
      const serverCount = servers.length;
      const serverSlotSummary = `${serverCount} / 3 server positions assigned`;

      const subrooms = room.subrooms.map((s) => {
        const membersCount = s.members.length;
        let status: 'OPTIMAL' | 'NEAR_CAPACITY' | 'FULL' | 'UNDERUTILIZED' = 'OPTIMAL';
        if (membersCount >= s.memberCapacity) {
          status = 'FULL';
        } else if (membersCount === s.memberCapacity - 1 && membersCount > 0) {
          status = 'NEAR_CAPACITY';
        } else if (membersCount === 0) {
          status = 'UNDERUTILIZED';
        }

        return {
          id: s.code, // e.g. "B3"
          dbId: s.id,
          roomLetter: room.letter,
          subroomNumber: s.number,
          name: `Subroom ${s.code}`,
          memberCapacity: s.memberCapacity,
          membersCount,
          serverSeatCount: s.serverSeatCount,
          serverPresent: serverCount > 0,
          serverUser: servers[0] || room.leadServer || undefined,
          servers,
          members: s.members,
          status,
        };
      });

      const totalMembers = subrooms.reduce((acc, s) => acc + s.membersCount, 0);
      const totalCapacity = subrooms.reduce((acc, s) => acc + s.memberCapacity, 0);
      const occupancyPercentage = totalCapacity > 0 ? Math.round((totalMembers / totalCapacity) * 100) : 0;

      return {
        id: `Room ${room.letter}`,
        dbId: room.id,
        letter: room.letter,
        name: room.name,
        leadServer: servers[0] || room.leadServer || undefined,
        servers,
        serverCount,
        serverCapacity: 3,
        serverSlotSummary,
        subrooms,
        totalMembers,
        totalCapacity,
        occupancyPercentage,
      };
    });
  }

  static async getRoomByLetter(letter: string, organizationId?: string) {
    const all = await this.getAllRooms(organizationId);
    const room = all.find((r) => r.letter.toUpperCase() === letter.toUpperCase());
    if (!room) {
      throw new Error(`Room Section ${letter} not found`);
    }
    return room;
  }

  static async updateSubroomCapacity(subroomCodeOrId: string, newCapacity: number) {
    const subroom = await prisma.subroom.findFirst({
      where: {
        OR: [{ id: subroomCodeOrId }, { code: subroomCodeOrId.toUpperCase() }],
      },
      include: {
        members: true,
        room: true,
      },
    });

    if (!subroom) {
      throw new Error(`Subroom ${subroomCodeOrId} not found`);
    }

    const currentOccupancy = subroom.members.length;

    // Strict Business Rule: Reject capacity reduction below current active occupancy
    if (newCapacity < currentOccupancy) {
      throw new Error(
        `Cannot reduce capacity to ${newCapacity}. Current occupancy is ${currentOccupancy} active members.`
      );
    }

    const updated = await prisma.subroom.update({
      where: { id: subroom.id },
      data: {
        memberCapacity: newCapacity,
      },
    });

    publishDomainEvent({
      type: 'SUBROOM_STATUS_CHANGED',
      organizationId: subroom.room.organizationId,
      entityId: subroom.id,
      payload: {
        subroomId: subroom.id,
        subroomCode: subroom.code,
        memberCapacity: newCapacity,
      },
    });

    return updated;
  }

  /**
   * Assign a SERVER to a room with maximum 3 servers per room constraint
   */
  static async assignServerToRoom(roomId: string, userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error(`User ${userId} not found`);
    }

    if (user.role !== UserRole.SERVER) {
      throw new Error(`User ${user.name} does not have the SERVER role (current role: ${user.role})`);
    }

    const room = await prisma.room.findUnique({
      where: { id: roomId },
    });

    if (!room) {
      throw new Error(`Room ${roomId} not found`);
    }

    // Check existing servers count
    const existingServerCount = await prisma.user.count({
      where: {
        roomId,
        role: UserRole.SERVER,
        id: { not: userId },
      },
    });

    if (existingServerCount >= 3) {
      throw new Error(`Room Section ${room.letter} already has the maximum of 3 assigned Servers.`);
    }

    // Update user roomId
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { roomId },
    });

    publishDomainEvent({
      type: 'ROOM_ASSIGNMENT_CHANGED',
      organizationId: room.organizationId,
      entityId: room.id,
      targetUserId: userId,
      payload: {
        roomId: room.id,
        roomLetter: room.letter,
        serverUserId: userId,
      },
    });

    return updated;
  }

  // ---------------------------------------------------------------------------
  // Single authoritative room/subroom assignment — works uniformly for real
  // (PostgreSQL-backed) users.
  // ---------------------------------------------------------------------------

  /**
   * Current occupancy of a subroom (MEMBER/TEAM_LEAD only — servers are
   * section-scoped and never count against subroom capacity).
   * `excludePersonId` lets a no-op / same-subroom reassignment pass its own
   * current occupancy without double-counting itself against the cap.
   */
  private static async getSubroomOccupancy(
    subroomCode: string,
    excludePersonId?: string
  ): Promise<number> {
    return prisma.user.count({
      where: {
        subroom: { code: subroomCode.toUpperCase() },
        role: { in: [UserRole.MEMBER, UserRole.TEAM_LEAD] },
        ...(excludePersonId ? { id: { not: excludePersonId } } : {}),
      },
    });
  }

  /**
   * Resolves a person's current room/subroom assignment.
   */
  static async getPersonAssignment(personId: string, organizationId: string): Promise<RoomAssignmentState> {
    const user = await prisma.user.findUnique({ where: { id: personId }, include: { room: true, subroom: true } });
    if (!user || user.organizationId !== organizationId) {
      throw new RoomAssignmentError(`Person ${personId} not found`, 404);
    }

    const partners =
      user.role !== UserRole.SERVER && user.subroomId
        ? await prisma.user.findMany({
            where: { subroomId: user.subroomId, id: { not: personId } },
            select: { id: true, name: true },
          })
        : [];

    return {
      personId,
      name: user.name,
      role: user.role || UserRole.MEMBER,
      section: user.room?.letter ?? null,
      subroom: user.role === UserRole.SERVER ? null : user.subroom?.code ?? null,
      partners,
    };
  }

  /**
   * Assigns, reassigns, or clears (sectionLetter === null) a person's room.
   * SERVER roles are section-scoped only — their subroom-level supervisory
   * position remains fully computed by calculateServerPositions() and is
   * never stored here. MEMBER/TEAM_LEAD require a target subroom and are
   * subject to the 2-person subroom capacity rule.
   */
  static async setPersonAssignment(
    personId: string,
    target: { sectionLetter: string | null; subroomCode?: string | null },
    actor: { organizationId: string }
  ): Promise<{ current: RoomAssignmentState; previousSection: string | null; previousSubroom: string | null }> {
    const previous = await this.getPersonAssignment(personId, actor.organizationId);
    // Current physical presence, used to decide whether their displayed
    // "current location" should follow the new assignment (a person marked IN
    // is standing at their desk; moving the desk moves them with it).
    const realUser = await prisma.user.findUnique({ where: { id: personId } });
    const isPresent = realUser?.presenceState === 'IN';

    // Clearing the assignment
    if (target.sectionLetter === null) {
      await prisma.user.update({
        where: { id: personId },
        data: {
          roomId: null,
          subroomId: null,
          ...(isPresent
            ? { currentLocationRoomId: null, currentLocationSubroomId: null, currentLocationName: null }
            : {}),
        },
      });

      const current = await this.getPersonAssignment(personId, actor.organizationId);
      this.publishAssignmentChanged(personId, previous, current, actor.organizationId);
      return { current, previousSection: previous.section, previousSubroom: previous.subroom };
    }

    const sectionLetter = target.sectionLetter.toUpperCase();
    if (!SECTION_LETTERS.includes(sectionLetter)) {
      throw new RoomAssignmentError(`Invalid section "${target.sectionLetter}". Must be one of A-H.`);
    }

    const room = await prisma.room.findFirst({ where: { letter: sectionLetter, organizationId: actor.organizationId } });
    if (!room) {
      throw new RoomAssignmentError(`Section ${sectionLetter} does not exist for this organization.`, 404);
    }

    const isServerRole = previous.role === UserRole.SERVER || previous.role === 'SERVER';

    if (isServerRole) {
      // Section-only assignment — subroom/position stays fully dynamic.
      const existingServerCount = await prisma.user.count({
        where: { roomId: room.id, role: UserRole.SERVER, id: { not: personId } },
      });
      if (existingServerCount >= 3) {
        throw new RoomAssignmentError(`Section ${sectionLetter} already has the maximum of 3 assigned Servers.`);
      }
      await prisma.user.update({
        where: { id: personId },
        data: {
          roomId: room.id,
          subroomId: null,
          // Subroom-level location stays dynamic (supervisory position is computed,
          // never stored) but the room-level pointer must track the new section so
          // event-supervision boundary checks compare against the correct room.
          ...(isPresent ? { currentLocationRoomId: room.id } : {}),
        },
      });
    } else {
      // MEMBER / TEAM_LEAD — requires a target subroom, subject to capacity.
      const subroomCode = target.subroomCode?.toUpperCase();
      if (!subroomCode) {
        throw new RoomAssignmentError('subroomCode is required when assigning a member or team lead.');
      }

      const subroom = await prisma.subroom.findFirst({
        where: { code: subroomCode, roomId: room.id, organizationId: actor.organizationId },
      });
      if (!subroom) {
        throw new RoomAssignmentError(`Subroom ${subroomCode} does not exist in Section ${sectionLetter}.`, 404);
      }

      const occupancy = await this.getSubroomOccupancy(subroomCode, personId);
      if (occupancy >= subroom.memberCapacity) {
        throw new RoomAssignmentError(
          `Subroom ${subroomCode} is at capacity (${occupancy}/${subroom.memberCapacity}). Choose another subroom or clear a seat first.`
        );
      }

      await prisma.user.update({
        where: { id: personId },
        data: {
          roomId: room.id,
          subroomId: subroom.id,
          // A member/team-lead currently marked IN is physically present at their
          // desk — moving that desk moves their displayed current location with it,
          // so People Availability and the drawer never show a stale old subroom.
          ...(isPresent
            ? { currentLocationRoomId: room.id, currentLocationSubroomId: subroom.id, currentLocationName: subroomCode }
            : {}),
        },
      });
    }

    const current = await this.getPersonAssignment(personId, actor.organizationId);
    this.publishAssignmentChanged(personId, previous, current, actor.organizationId);
    return { current, previousSection: previous.section, previousSubroom: previous.subroom };
  }

  private static publishAssignmentChanged(
    personId: string,
    previous: RoomAssignmentState,
    current: RoomAssignmentState,
    organizationId: string
  ) {
    publishDomainEvent({
      type: 'ROOM_ASSIGNMENT_CHANGED',
      organizationId,
      entityId: personId,
      targetUserId: personId,
      payload: {
        userId: personId,
        personId,
        role: current.role,
        previousSection: previous.section,
        previousSubroom: previous.subroom,
        newSection: current.section,
        newSubroom: current.subroom,
        timestamp: new Date().toISOString(),
      },
    });
  }
}
