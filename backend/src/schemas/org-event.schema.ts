import { z } from 'zod';
import { EventResponseChoice } from '@prisma/client';

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD');
const timeStr = z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'time must be HH:mm (24-hour)');

export const createOrgEventSchema = z
  .object({
    title: z.string().min(3).max(200),
    description: z.string().min(1).max(5000),
    date: dateStr,
    time: timeStr,
    endTime: timeStr,
  })
  .refine((data) => data.endTime > data.time, {
    message: 'endTime must be after time',
    path: ['endTime'],
  });

export const updateOrgEventSchema = z
  .object({
    title: z.string().min(3).max(200).optional(),
    description: z.string().min(1).max(5000).optional(),
    date: dateStr.optional(),
    time: timeStr.optional(),
    endTime: timeStr.optional(),
  })
  .refine((data) => !data.time || !data.endTime || data.endTime > data.time, {
    message: 'endTime must be after time',
    path: ['endTime'],
  });

export const updateOrgEventResponseSchema = z.object({
  response: z.nativeEnum(EventResponseChoice),
});

export type CreateOrgEventInput = z.infer<typeof createOrgEventSchema>;
export type UpdateOrgEventInput = z.infer<typeof updateOrgEventSchema>;
export type UpdateOrgEventResponseInput = z.infer<typeof updateOrgEventResponseSchema>;
