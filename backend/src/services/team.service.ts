import { prisma } from '../db/client.js';
import { UserRole } from '@prisma/client';

export class TeamServiceError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

export const teamMemberSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  accountStatus: true,
  status: true,
  presenceState: true,
  title: true,
  avatarUrl: true,
} as const;

export class TeamService {
  static async listTeams(organizationId: string, eventId?: string) {
    const teams = await prisma.team.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
      include: {
        lead: { select: teamMemberSelect },
        _count: { select: { members: true } },
        ...(eventId
          ? {
              placements: {
                where: { eventId },
                select: { room: { select: { letter: true } } },
                take: 1,
              },
            }
          : {}),
      },
    });

    return teams.map((t: any) => ({
      id: t.id,
      name: t.name,
      lead: t.lead,
      memberCount: t._count.members,
      allocatedSection: t.placements?.[0]?.room?.letter ?? null,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    }));
  }

  static async getTeam(teamId: string, organizationId: string) {
    const team = await prisma.team.findFirst({
      where: { id: teamId, organizationId },
      include: {
        lead: { select: teamMemberSelect },
        members: { select: teamMemberSelect, orderBy: { name: 'asc' } },
      },
    });
    if (!team) {
      throw new TeamServiceError('Team not found', 404);
    }
    return team;
  }

  static async createTeam(organizationId: string, input: { name: string; leadId?: string }) {
    if (input.leadId) {
      const lead = await prisma.user.findFirst({ where: { id: input.leadId, organizationId } });
      if (!lead) {
        throw new TeamServiceError('leadId does not reference a user in this organization.', 400);
      }
    }
    const clash = await prisma.team.findFirst({ where: { organizationId, name: input.name } });
    if (clash) {
      throw new TeamServiceError(`A team named "${input.name}" already exists.`, 400);
    }

    const team = await prisma.team.create({
      data: { organizationId, name: input.name, leadId: input.leadId ?? null },
    });
    return this.getTeam(team.id, organizationId);
  }

  static async updateTeam(
    teamId: string,
    organizationId: string,
    input: { name?: string; leadId?: string | null }
  ) {
    await this.getTeam(teamId, organizationId);

    if (input.leadId) {
      const lead = await prisma.user.findFirst({ where: { id: input.leadId, organizationId } });
      if (!lead) {
        throw new TeamServiceError('leadId does not reference a user in this organization.', 400);
      }
    }
    if (input.name) {
      const clash = await prisma.team.findFirst({
        where: { organizationId, name: input.name, id: { not: teamId } },
      });
      if (clash) {
        throw new TeamServiceError(`A team named "${input.name}" already exists.`, 400);
      }
    }

    await prisma.team.update({
      where: { id: teamId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.leadId !== undefined ? { leadId: input.leadId } : {}),
      },
    });
    return this.getTeam(teamId, organizationId);
  }

  static async deleteTeam(teamId: string, organizationId: string) {
    await this.getTeam(teamId, organizationId);
    // Cascades TeamEventPlacement rows and SetNulls every member's User.teamId.
    await prisma.team.delete({ where: { id: teamId } });
  }

  static async addMember(teamId: string, organizationId: string, userId: string) {
    await this.getTeam(teamId, organizationId);
    const user = await prisma.user.findFirst({ where: { id: userId, organizationId } });
    if (!user) {
      throw new TeamServiceError('User not found in this organization.', 404);
    }
    if (user.role !== UserRole.MEMBER && user.role !== UserRole.TEAM_LEAD) {
      throw new TeamServiceError('Only MEMBER or TEAM_LEAD users can belong to a team.', 400);
    }
    await prisma.user.update({ where: { id: userId }, data: { teamId } });
    return this.getTeam(teamId, organizationId);
  }

  static async removeMember(teamId: string, organizationId: string, userId: string) {
    await this.getTeam(teamId, organizationId);
    const user = await prisma.user.findFirst({ where: { id: userId, organizationId, teamId } });
    if (!user) {
      throw new TeamServiceError('User is not a member of this team.', 404);
    }
    await prisma.user.update({ where: { id: userId }, data: { teamId: null } });
    return this.getTeam(teamId, organizationId);
  }
}
