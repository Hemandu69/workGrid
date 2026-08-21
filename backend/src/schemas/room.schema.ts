import { z } from 'zod';

export const updateSubroomCapacitySchema = z.object({
  memberCapacity: z.number().int().min(1).max(20),
});

export type UpdateSubroomCapacityInput = z.infer<typeof updateSubroomCapacitySchema>;

export const assignRoomSchema = z.object({
  sectionLetter: z.string().trim().regex(/^[A-Ha-h]$/, 'sectionLetter must be a single letter A-H'),
  // Required when assigning a non-SERVER person (MEMBER/TEAM_LEAD); ignored for SERVER role,
  // whose subroom placement is always computed dynamically from supervisory positioning.
  subroomCode: z
    .string()
    .trim()
    .regex(/^[A-Ha-h][1-8]$/, 'subroomCode must look like B3')
    .optional(),
});

export type AssignRoomInput = z.infer<typeof assignRoomSchema>;
