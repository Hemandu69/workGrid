import { z } from 'zod';

export const createTeamSchema = z.object({
  name: z.string().trim().min(1).max(120),
  leadId: z.string().uuid().optional(),
});
export type CreateTeamInput = z.infer<typeof createTeamSchema>;

export const updateTeamSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  leadId: z.string().uuid().nullable().optional(),
});
export type UpdateTeamInput = z.infer<typeof updateTeamSchema>;

export const addTeamMemberSchema = z.object({
  userId: z.string().uuid(),
});
export type AddTeamMemberInput = z.infer<typeof addTeamMemberSchema>;

// Section letters and subroom codes reuse the exact house convention from
// room.schema.ts's assignRoomSchema.
export const allocateTeamSchema = z.object({
  eventId: z.string().uuid(),
  sectionLetter: z.string().trim().regex(/^[A-Ha-h]$/, 'sectionLetter must be a single letter A-H'),
});
export type AllocateTeamInput = z.infer<typeof allocateTeamSchema>;

export const replaceTeamMemberSchema = z.object({
  eventId: z.string().uuid(),
  userId: z.string().uuid(),
});
export type ReplaceTeamMemberInput = z.infer<typeof replaceTeamMemberSchema>;

export const overrideTeamPlacementSchema = z.object({
  eventId: z.string().uuid(),
  subroomCode: z.string().trim().regex(/^[A-Ha-h][1-8]$/, 'subroomCode must look like C3'),
});
export type OverrideTeamPlacementInput = z.infer<typeof overrideTeamPlacementSchema>;

export const clearTeamPlacementSchema = z.object({
  eventId: z.string().uuid(),
});
export type ClearTeamPlacementInput = z.infer<typeof clearTeamPlacementSchema>;

export const placementPreviewQuerySchema = z.object({
  eventId: z.string().uuid(),
  sectionLetter: z.string().trim().regex(/^[A-Ha-h]$/, 'sectionLetter must be a single letter A-H'),
});
export type PlacementPreviewQuery = z.infer<typeof placementPreviewQuerySchema>;
