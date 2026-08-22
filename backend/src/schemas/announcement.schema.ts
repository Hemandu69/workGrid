import { z } from 'zod';
import { AudienceScope, AnnouncementStatus } from '@prisma/client';

export const createAnnouncementSchema = z.object({
  title: z.string().min(3).max(200),
  content: z.string().min(5).max(5000),
  scope: z.nativeEnum(AudienceScope).default(AudienceScope.GLOBAL),
  targetRoom: z.string().optional(),
  status: z.nativeEnum(AnnouncementStatus).default(AnnouncementStatus.PUBLISHED),
  pinned: z.boolean().default(false),
  scheduledFor: z.string().datetime().optional(),
});

export type CreateAnnouncementInput = z.infer<typeof createAnnouncementSchema>;

export const updateAnnouncementSchema = z
  .object({
    title: z.string().min(3).max(200).optional(),
    content: z.string().min(5).max(5000).optional(),
    scope: z.nativeEnum(AudienceScope).optional(),
    targetRoom: z.string().optional(),
    scheduledFor: z.string().datetime().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided' });

export type UpdateAnnouncementInput = z.infer<typeof updateAnnouncementSchema>;
