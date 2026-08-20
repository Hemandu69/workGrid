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
