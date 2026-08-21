import { prisma } from '../db/client.js';
import { UserRole } from '@prisma/client';
import { publishDomainEvent } from '../events/domain-events.js';

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
      throw new Error(`Room Sector ${letter} not found`);
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
      throw new Error(`Room Sector ${room.letter} already has the maximum of 3 assigned Servers.`);
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
}
