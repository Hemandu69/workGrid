import { prisma } from '../db/client.js';
import { AccountStatus, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { AuthUserPayload } from '../plugins/auth.js';
import { ProvisionUserInput } from '../schemas/hr.schema.js';

export class HRService {
  /**
   * HR Executive Dashboard Statistics
   */
  static async getHRDashboardStats(organizationId: string) {
    const users = await prisma.user.findMany({
      where: { organizationId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        accountStatus: true,
        title: true,
        createdAt: true,
      },
    });

    const totalEmployees = users.length;
    const activeCount = users.filter((u) => u.accountStatus === AccountStatus.ACTIVE).length;
    const pendingCount = users.filter((u) => u.accountStatus === AccountStatus.PENDING).length;
    const suspendedCount = users.filter((u) => u.accountStatus === AccountStatus.SUSPENDED).length;
    const deactivatedCount = users.filter((u) => u.accountStatus === AccountStatus.DEACTIVATED).length;

    const recentPending = users
      .filter((u) => u.accountStatus === AccountStatus.PENDING)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 5);

    return {
      totalEmployees,
      activeCount,
      pendingCount,
      suspendedCount,
      deactivatedCount,
      recentPending,
    };
  }

  /**
   * People Management Directory
   */
  static async getPeopleDirectory(
    organizationId: string,
    filters: {
      role?: UserRole;
      accountStatus?: AccountStatus;
      search?: string;
    }
  ) {
    const where: any = { organizationId };

    if (filters.role) where.role = filters.role;
    if (filters.accountStatus) where.accountStatus = filters.accountStatus;

    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { email: { contains: filters.search, mode: 'insensitive' } },
        { title: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const users = await prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        accountStatus: true,
        status: true,
        title: true,
        avatarUrl: true,
        capacityLimitHours: true,
        currentAllocatedHours: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return users;
  }

  /**
   * Provision a new employee account (defaults to PENDING status)
   */
  static async provisionUser(
    organizationId: string,
    actor: AuthUserPayload,
    input: ProvisionUserInput
  ) {
    const initialRole = input.initialRole || UserRole.MEMBER;

    // HR Role Assignment Allowlist Check for Provisioning
    if (actor.role === UserRole.HR) {
      const allowedRoles: UserRole[] = [UserRole.MEMBER, UserRole.TEAM_LEAD, UserRole.SERVER];
      if (!allowedRoles.includes(initialRole)) {
        const error = new Error(`HR users cannot provision accounts with privileged role ${initialRole}.`);
        (error as any).statusCode = 403;
        throw error;
      }
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
    });

    if (existingUser) {
      const error = new Error(`A user with email ${input.email} already exists.`);
      (error as any).statusCode = 409;
      throw error;
    }

    const tempPasswordHash = await bcrypt.hash('TempPassword123!', 10);

    const user = await prisma.user.create({
      data: {
        organizationId,
        email: input.email.toLowerCase(),
        name: input.name,
        title: input.title,
        role: initialRole,
        accountStatus: AccountStatus.PENDING,
        passwordHash: tempPasswordHash,
        capacityLimitHours: input.capacityLimitHours || 40,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        accountStatus: true,
        title: true,
        capacityLimitHours: true,
        createdAt: true,
      },
    });

    return user;
  }

  /**
   * Assign or Change User Role (Transactional with Audit Logging)
   */
  static async updateUserRole(
    organizationId: string,
    actor: AuthUserPayload,
    targetUserId: string,
    newRole: UserRole,
    reason?: string
  ) {
    // 1. Self-Role Modification Check
    if (actor.id === targetUserId) {
      const error = new Error('Self-role modification is not permitted.');
      (error as any).statusCode = 403;
      throw error;
    }

    // 2. Target Lookup & Organization Scoping
    const targetUser = await prisma.user.findFirst({
      where: {
        id: targetUserId,
        organizationId,
      },
    });

    if (!targetUser) {
      const error = new Error(`User with ID ${targetUserId} not found in this organization.`);
      (error as any).statusCode = 404;
      throw error;
    }

    // 3. Role Authority Rules & Allowlist Enforcement
    if (actor.role === UserRole.HR) {
      const hrAllowedRoles: UserRole[] = [UserRole.MEMBER, UserRole.TEAM_LEAD, UserRole.SERVER];
      if (!hrAllowedRoles.includes(newRole)) {
        const error = new Error(
          `HR users are not authorized to assign role ${newRole}. Allowed roles: ${hrAllowedRoles.join(', ')}.`
        );
        (error as any).statusCode = 403;
        throw error;
      }

      // HR cannot alter roles of existing SUPER_ADMIN, ADMIN, or HR
      if (
        targetUser.role === UserRole.SUPER_ADMIN ||
        targetUser.role === UserRole.ADMIN ||
        targetUser.role === UserRole.HR
      ) {
        const error = new Error(
          `HR users cannot modify roles of privileged accounts (${targetUser.role}).`
        );
        (error as any).statusCode = 403;
        throw error;
      }
    } else if (actor.role === UserRole.SUPER_ADMIN) {
      // Last Super Admin Safeguard
      if (targetUser.role === UserRole.SUPER_ADMIN && newRole !== UserRole.SUPER_ADMIN) {
        const superAdminCount = await prisma.user.count({
          where: {
            organizationId,
            role: UserRole.SUPER_ADMIN,
            accountStatus: AccountStatus.ACTIVE,
          },
        });

        if (superAdminCount <= 1) {
          const error = new Error('Cannot demote the last remaining active Super Admin in the organization.');
          (error as any).statusCode = 400;
          throw error;
        }
      }
    } else {
      const error = new Error(`Role ${actor.role} is not authorized to manage or assign roles.`);
      (error as any).statusCode = 403;
      throw error;
    }

    // 4. Atomic Transaction: Update Role + Auto-activate if PENDING + Increment Version + Create Audit Log
    const result = await prisma.$transaction(async (tx) => {
      const willActivate = targetUser.accountStatus === AccountStatus.PENDING;
      const updated = await tx.user.update({
        where: { id: targetUserId },
        data: {
          role: newRole,
          accountStatus: willActivate ? AccountStatus.ACTIVE : targetUser.accountStatus,
          version: { increment: 1 },
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          accountStatus: true,
          title: true,
          updatedAt: true,
        },
      });

      const audit = await tx.roleAuditLog.create({
        data: {
          organizationId,
          targetUserId,
          changedById: actor.id,
          previousRole: targetUser.role || null,
          newRole,
          reason: reason || (willActivate ? 'Account approved and role assigned' : 'Role updated via People Management'),
        },
      });

      return { user: updated, audit };
    });

    return result;
  }

  /**
   * Update Account Status (PENDING, ACTIVE, SUSPENDED, DEACTIVATED)
   */
  static async updateAccountStatus(
    organizationId: string,
    actor: AuthUserPayload,
    targetUserId: string,
    newStatus: AccountStatus,
    reason?: string
  ) {
    // 1. Target Lookup & Org Scoping
    const targetUser = await prisma.user.findFirst({
      where: {
        id: targetUserId,
        organizationId,
      },
    });

    if (!targetUser) {
      const error = new Error(`User with ID ${targetUserId} not found in this organization.`);
      (error as any).statusCode = 404;
      throw error;
    }

    // 2. Self Suspension Safeguard
    if (actor.id === targetUserId && newStatus !== AccountStatus.ACTIVE) {
      const error = new Error('Users cannot suspend or deactivate their own accounts.');
      (error as any).statusCode = 403;
      throw error;
    }

    // 3. Super Admin & Privileged Target Protection
    if (targetUser.role === UserRole.SUPER_ADMIN && actor.role !== UserRole.SUPER_ADMIN) {
      const error = new Error('Only a Super Admin can change the account status of a Super Admin account.');
      (error as any).statusCode = 403;
      throw error;
    }

    // 4. Last Super Admin Safeguard
    if (
      targetUser.role === UserRole.SUPER_ADMIN &&
      newStatus !== AccountStatus.ACTIVE
    ) {
      const activeSuperAdmins = await prisma.user.count({
        where: {
          organizationId,
          role: UserRole.SUPER_ADMIN,
          accountStatus: AccountStatus.ACTIVE,
        },
      });

      if (activeSuperAdmins <= 1) {
        const error = new Error('Cannot suspend or deactivate the last remaining active Super Admin.');
        (error as any).statusCode = 400;
        throw error;
      }
    }

    const updated = await prisma.user.update({
      where: { id: targetUserId },
      data: {
        accountStatus: newStatus,
        version: { increment: 1 },
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        accountStatus: true,
        title: true,
        updatedAt: true,
      },
    });

    // Record audit event
    await prisma.auditEvent.create({
      data: {
        organizationId,
        userId: actor.id,
        action: 'STATUS_CHANGED',
        entityType: 'User',
        entityId: targetUserId,
        details: { previousStatus: targetUser.accountStatus, newStatus, reason },
      },
    }).catch(() => null);

    return updated;
  }

  /**
   * Fetch Role Audit Trail
   */
  static async getRoleAuditLogs(organizationId: string, targetUserId?: string) {
    const where: any = { organizationId };
    if (targetUserId) where.targetUserId = targetUserId;

    const logs = await prisma.roleAuditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        targetUser: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
          },
        },
        changedBy: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            avatarUrl: true,
          },
        },
      },
    });

    return logs.map((l) => ({
      id: l.id,
      targetUserId: l.targetUserId,
      targetUserName: l.targetUser?.name || 'Unknown User',
      targetUserEmail: l.targetUser?.email || '',
      targetUserAvatar: l.targetUser?.avatarUrl,
      changedById: l.changedById,
      changedByName: l.changedBy?.name || 'System / Admin',
      changedByRole: l.changedBy?.role || UserRole.SUPER_ADMIN,
      previousRole: l.previousRole,
      newRole: l.newRole,
      reason: l.reason,
      createdAt: l.createdAt,
    }));
  }
}
