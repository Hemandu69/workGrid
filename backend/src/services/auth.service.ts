import { prisma } from '../db/client.js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { AccountStatus, UserRole } from '@prisma/client';
import {
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
} from '../schemas/auth.schema.js';
import { AuthUserPayload } from '../plugins/auth.js';
import { hrEventBus } from '../events/hr-events.js';

export class AuthService {
  /**
   * Authenticate user credentials, enforce accountStatus, update lastLoginAt, and log audit event.
   */
  static async validateCredentials(
    input: LoginInput,
    ipAddress?: string
  ): Promise<AuthUserPayload> {
    const normalizedEmail = input.email.trim().toLowerCase();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: {
        room: true,
        subroom: true,
      },
    });

    if (!user) {
      throw new Error('Invalid email or password');
    }

    const isMatch = await bcrypt.compare(input.password, user.passwordHash);
    if (!isMatch) {
      // Record failed login audit event
      await prisma.auditEvent.create({
        data: {
          organizationId: user.organizationId,
          userId: user.id,
          action: 'LOGIN_FAILURE',
          entityType: 'User',
          entityId: user.id,
          details: { email: normalizedEmail, reason: 'Invalid password' },
          ipAddress: ipAddress || null,
        },
      }).catch(() => null);

      throw new Error('Invalid email or password');
    }

    // Account Status Governance Checks: SUSPENDED and DEACTIVATED are blocked from logging in
    if (user.accountStatus === AccountStatus.SUSPENDED) {
      const error = new Error('Account is suspended. Please contact IT or HR.');
      (error as any).statusCode = 403;
      throw error;
    }

    if (user.accountStatus === AccountStatus.DEACTIVATED) {
      const error = new Error('Account is deactivated. Access permanently revoked.');
      (error as any).statusCode = 403;
      throw error;
    }

    // PENDING and ACTIVE are allowed to authenticate
    // Update lastLoginAt
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // Record success audit event
    await prisma.auditEvent.create({
      data: {
        organizationId: user.organizationId,
        userId: user.id,
        action: 'LOGIN_SUCCESS',
        entityType: 'User',
        entityId: user.id,
        details: { email: normalizedEmail, role: user.role || 'UNASSIGNED', accountStatus: user.accountStatus },
        ipAddress: ipAddress || null,
      },
    }).catch(() => null);

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role || undefined,
      accountStatus: user.accountStatus,
      organizationId: user.organizationId,
      version: user.version,
      roomId: user.roomId || undefined,
      subroomId: user.subroomId || undefined,
    };
  }

  /**
   * Public Self-Registration (Strictly creates PENDING account with UNASSIGNED/null role)
   */
  static async register(
    input: RegisterInput,
    ipAddress?: string
  ) {
    const normalizedEmail = input.email.trim().toLowerCase();

    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      const error = new Error(`User with email ${input.email} already exists.`);
      (error as any).statusCode = 400;
      throw error;
    }

    // Resolve default organization safely
    const org = await prisma.organization.findFirst({
      orderBy: { createdAt: 'asc' },
    });

    if (!org) {
      const error = new Error('No default organization found for user registration.');
      (error as any).statusCode = 500;
      throw error;
    }

    const passwordHash = await bcrypt.hash(input.password, 10);

    const newUser = await prisma.user.create({
      data: {
        organizationId: org.id,
        email: normalizedEmail,
        name: input.name.trim(),
        title: input.title?.trim() || 'New Employee',
        accountStatus: AccountStatus.PENDING,
        passwordHash,
      },
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

    // Record registration audit event
    await prisma.auditEvent.create({
      data: {
        organizationId: org.id,
        userId: newUser.id,
        action: 'ACCOUNT_REGISTERED',
        entityType: 'User',
        entityId: newUser.id,
        details: { email: normalizedEmail, accountStatus: AccountStatus.PENDING, role: 'UNASSIGNED' },
        ipAddress: ipAddress || null,
      },
    }).catch(() => null);

    // Emit real-time HR event (organization-isolated)
    hrEventBus.emitHREvent(org.id, {
      type: 'EMPLOYEE_REGISTERED',
      organizationId: org.id,
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        title: newUser.title,
        role: null,
        accountStatus: newUser.accountStatus,
        status: 'OFFLINE',
        createdAt: newUser.createdAt,
      },
      createdAt: new Date().toISOString(),
    });

    return {
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
      role: newUser.role ?? null,
      accountStatus: newUser.accountStatus,
      title: newUser.title,
      createdAt: newUser.createdAt,
    };
  }

  /**
   * Authoritative User Profile Lookup (safe data only)
   */
  static async getUserProfile(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        room: true,
        subroom: true,
      },
    });

    if (!user) {
      throw new Error('User not found');
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
      organizationId: user.organizationId,
      version: user.version,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  /**
   * Logout audit logging
   */
  static async logout(userId: string, organizationId: string, ipAddress?: string) {
    await prisma.auditEvent.create({
      data: {
        organizationId,
        userId,
        action: 'LOGOUT',
        entityType: 'User',
        entityId: userId,
        ipAddress: ipAddress || null,
      },
    }).catch(() => null);
  }

  /**
   * Request Password Reset (generates secure token hash)
   */
  static async requestPasswordReset(email: string, ipAddress?: string) {
    const normalizedEmail = email.trim().toLowerCase();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    // Consistent non-enumerative message
    const genericResponse = {
      message: 'If the email is registered, instructions to reset your password have been generated.',
    };

    if (!user || user.accountStatus !== AccountStatus.ACTIVE) {
      return genericResponse;
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });

    await prisma.auditEvent.create({
      data: {
        organizationId: user.organizationId,
        userId: user.id,
        action: 'PASSWORD_RESET_REQUEST',
        entityType: 'User',
        entityId: user.id,
        ipAddress: ipAddress || null,
      },
    }).catch(() => null);

    return {
      ...genericResponse,
      resetToken: rawToken, // Returned for backend API testing / contract integration
    };
  }

  /**
   * Reset Password (validates token hash, updates hash, increments version, and marks token used)
   */
  static async resetPassword(
    input: ResetPasswordInput,
    ipAddress?: string
  ) {
    const tokenHash = crypto.createHash('sha256').update(input.token.trim()).digest('hex');

    const tokenRecord = await prisma.passwordResetToken.findFirst({
      where: {
        tokenHash,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: { user: true },
    });

    if (!tokenRecord) {
      const error = new Error('Invalid or expired password reset token.');
      (error as any).statusCode = 400;
      throw error;
    }

    const user = tokenRecord.user || (await prisma.user.findUnique({ where: { id: tokenRecord.userId } }));
    if (!user) {
      const error = new Error('Invalid or expired password reset token.');
      (error as any).statusCode = 400;
      throw error;
    }
    const newPasswordHash = await bcrypt.hash(input.newPassword, 10);

    // Transactional reset: update password, invalidate existing sessions (version++), mark token used
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash: newPasswordHash,
          version: { increment: 1 },
        },
      });

      await tx.passwordResetToken.update({
        where: { id: tokenRecord.id },
        data: { usedAt: new Date() },
      });

      await tx.auditEvent.create({
        data: {
          organizationId: user.organizationId,
          userId: user.id,
          action: 'PASSWORD_RESET_SUCCESS',
          entityType: 'User',
          entityId: user.id,
          ipAddress: ipAddress || null,
        },
      });
    });

    return {
      message: 'Password has been reset successfully. Please sign in with your new password.',
    };
  }
}
