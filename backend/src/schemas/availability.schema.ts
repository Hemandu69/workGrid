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

const calendarDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format');

/**
 * Date-specific override save for one real calendar week — used by the
 * calendar-aware Weekly Availability page. Each day's slots become
 * AvailabilityOverride rows for that exact date, never touching the
 * recurring AvailabilitySlot pattern or any other date.
 */
export const updateWeekAvailabilitySchema = z.object({
  weekStart: calendarDateSchema,
  // Optional — when provided, the returned totals are scoped to only the
  // dates in this real calendar month, excluding any out-of-month days at
  // the edges of the week (see getEffectiveWeekAvailability).
  month: z.number().int().min(1).max(12).optional(),
  year: z.number().int().optional(),
  days: z
    .array(
      z.object({
        date: calendarDateSchema,
        slots: z.array(
          z.object({
            hour: z.number().int().min(0).max(23),
            state: z.nativeEnum(SlotState),
            taskId: z.string().optional(),
          })
        ),
      })
    )
    .max(7),
});

export type UpdateWeekAvailabilityInput = z.infer<typeof updateWeekAvailabilitySchema>;
