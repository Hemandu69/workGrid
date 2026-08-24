import { prisma } from '../db/client.js';
import { AccountStatus, UserRole, UserStatus } from '@prisma/client';
import { DEFAULT_PAGE_LIMIT } from '../schemas/pagination.schema.js';

export class UserService {
  static async getUsers(
    filters: {
      role?: UserRole;
      accountStatus?: AccountStatus;
      status?: UserStatus;
      roomId?: string;
      subroomId?: string;
      teamId?: string;
      search?: string;
      organizationId?: string;
    },
    pagination: { limit: number; offset: number } = { limit: DEFAULT_PAGE_LIMIT, offset: 0 }
  ) {
    const where: any = {};

    if (filters.organizationId) where.organizationId = filters.organizationId;
    if (filters.role) where.role = filters.role;
    if (filters.accountStatus) where.accountStatus = filters.accountStatus;
    if (filters.status) where.status = filters.status;
    if (filters.roomId) where.roomId = filters.roomId;
    if (filters.subroomId) where.subroomId = filters.subroomId;
    if (filters.teamId) where.teamId = filters.teamId;

    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { email: { contains: filters.search, mode: 'insensitive' } },
        { title: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const [total, users] = await prisma.$transaction(async (tx) => [
      await tx.user.count({ where }),
      await tx.user.findMany({
        where,
        orderBy: { name: 'asc' },
        include: {
          room: true,
          subroom: true,
        },
        take: pagination.limit,
        skip: pagination.offset,
      }),
    ]);

    return {
      items: users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        accountStatus: u.accountStatus,
        status: u.status,
        presenceState: u.presenceState,
        title: u.title,
        avatarUrl: u.avatarUrl,
        capacityLimitHours: u.capacityLimitHours,
        currentAllocatedHours: u.currentAllocatedHours,
        room: u.room ? `Room ${u.room.letter}` : undefined,
        subroom: u.subroom ? u.subroom.code : undefined,
        createdAt: u.createdAt,
      })),
      total,
      limit: pagination.limit,
      offset: pagination.offset,
    };
  }

  static async getUserById(id: string, organizationId?: string) {
    const where: any = { id };
    if (organizationId) where.organizationId = organizationId;

    const user = await prisma.user.findFirst({
      where,
      include: {
        room: true,
        subroom: true,
      },
    });

    if (!user) {
      throw new Error(`User with ID ${id} not found`);
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      accountStatus: user.accountStatus,
      status: user.status,
      title: user.title,
      avatarUrl: user.avatarUrl,
      capacityLimitHours: user.capacityLimitHours,
      currentAllocatedHours: user.currentAllocatedHours,
      room: user.room ? `Room ${user.room.letter}` : undefined,
      subroom: user.subroom ? user.subroom.code : undefined,
      createdAt: user.createdAt,
    };
  }
}
