import { z } from 'zod';

export const updateSubroomCapacitySchema = z.object({
  memberCapacity: z.number().int().min(1).max(20),
});

export type UpdateSubroomCapacityInput = z.infer<typeof updateSubroomCapacitySchema>;
