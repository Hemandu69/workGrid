import { prisma } from '../db/client.js';

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
          serverPresent: room.leadServerId !== null,
          serverUser: room.leadServer || undefined,
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
        leadServer: room.leadServer || undefined,
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

    return updated;
  }
}
