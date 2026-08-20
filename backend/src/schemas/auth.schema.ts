import { z } from 'zod';
import { UserRole } from '@prisma/client';

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(2),
  role: z.nativeEnum(UserRole).default(UserRole.MEMBER),
  title: z.string().optional(),
  roomId: z.string().optional(),
  subroomId: z.string().optional(),
  capacityLimitHours: z.number().min(1).max(80).default(40),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
