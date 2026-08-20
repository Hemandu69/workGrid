import { z } from 'zod';
import { AccountStatus, UserRole } from '@prisma/client';

export const provisionUserSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  title: z.string().optional(),
  initialRole: z.nativeEnum(UserRole).optional().default(UserRole.MEMBER),
  capacityLimitHours: z.number().min(1).max(80).optional().default(40),
});

export type ProvisionUserInput = z.infer<typeof provisionUserSchema>;

export const updateRoleSchema = z.object({
  role: z.nativeEnum(UserRole),
  reason: z.string().optional(),
});

export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;

export const updateStatusSchema = z.object({
  accountStatus: z.nativeEnum(AccountStatus),
  reason: z.string().optional(),
});

export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;
