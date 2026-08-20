import { z } from 'zod';
import { TaskStatus, TaskPriority } from '@prisma/client';

export const createTaskSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().optional(),
  priority: z.nativeEnum(TaskPriority).default(TaskPriority.MEDIUM),
  estimatedHours: z.number().min(0.5).max(100).default(8.0),
  dueDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  assigneeId: z.string().uuid().or(z.string().min(5)),
  campaignId: z.string().uuid().optional(),
  tags: z.array(z.string()).default([]),
});

export const updateTaskStatusSchema = z.object({
  status: z.nativeEnum(TaskStatus),
  allocatedHours: z.number().min(0).optional(),
});

export const addTaskCommentSchema = z.object({
  content: z.string().min(1).max(2000),
});

export const createTaskCampaignSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().optional(),
  priority: z.nativeEnum(TaskPriority).default(TaskPriority.MEDIUM),
  targetRoom: z.string().optional(),
  dueDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskStatusInput = z.infer<typeof updateTaskStatusSchema>;
export type AddTaskCommentInput = z.infer<typeof addTaskCommentSchema>;
export type CreateTaskCampaignInput = z.infer<typeof createTaskCampaignSchema>;
