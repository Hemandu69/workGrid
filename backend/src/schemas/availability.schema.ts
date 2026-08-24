import { z } from 'zod';

/**
 * Operational availability status change for a real, authenticated account.
 * This is the only availability concept left in WorkGrid besides event
 * attendance (see org-event.schema.ts) — a live, presence-derived "what am I
 * doing right now" signal, never a scheduled/hourly slot.
 */
export const setAvailabilityStatusSchema = z.object({
  personId: z.string().optional(),
  state: z.enum(['FREE', 'BUSY', 'PARTIALLY_AVAILABLE', 'UNAVAILABLE']),
});

export type SetAvailabilityStatusInput = z.infer<typeof setAvailabilityStatusSchema>;
