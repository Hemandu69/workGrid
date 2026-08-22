import { z } from 'zod';
import { DayOfWeek, SlotState } from '@prisma/client';

export const updateAvailabilitySlotSchema = z.object({
  day: z.nativeEnum(DayOfWeek),
  hour: z.number().int().min(0).max(23),
  state: z.nativeEnum(SlotState),
  taskId: z.string().optional(),
});

export const updateWeeklyScheduleSchema = z.object({
  slots: z.array(updateAvailabilitySlotSchema),
  timezone: z.string().default('UTC'),
});

export type UpdateWeeklyScheduleInput = z.infer<typeof updateWeeklyScheduleSchema>;

/**
 * Operational availability status change for a real, authenticated account.
 */
export const setAvailabilityStatusSchema = z.object({
  personId: z.string().optional(),
  state: z.enum(['FREE', 'BUSY', 'PARTIALLY_AVAILABLE', 'UNAVAILABLE']),
});

export type SetAvailabilityStatusInput = z.infer<typeof setAvailabilityStatusSchema>;
