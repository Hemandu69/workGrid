import { z } from 'zod';
import { TaskStatus, TaskPriority, TaskType } from '@prisma/client';

const baseTaskFields = {
  title: z.string().min(3).max(200),
  description: z.string().optional(),
  priority: z.nativeEnum(TaskPriority).default(TaskPriority.MEDIUM),
  estimatedHours: z.number().min(0.5).max(100).default(8.0),
  dueDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  campaignId: z.string().uuid().optional(),
  tags: z.array(z.string()).default([]),
};

export const createTaskSchema = z
  .object({
    ...baseTaskFields,
    taskType: z.nativeEnum(TaskType).default(TaskType.INDIVIDUAL),
    // Required for INDIVIDUAL tasks, absent/ignored for an unassigned TEAM task.
    assigneeId: z.string().uuid().or(z.string().min(5)).optional(),
    // Required for TEAM tasks — the section (room letter) the task belongs to.
    teamSection: z.string().length(1).optional(),
  })
  .refine((data) => data.taskType !== TaskType.INDIVIDUAL || Boolean(data.assigneeId), {
    message: 'assigneeId is required for an individual task',
    path: ['assigneeId'],
  })
  .refine((data) => data.taskType !== TaskType.TEAM || Boolean(data.teamSection), {
    message: 'teamSection is required for a team task',
    path: ['teamSection'],
  });

export const updateTaskStatusSchema = z.object({
  status: z.nativeEnum(TaskStatus),
  allocatedHours: z.number().min(0).optional(),
  reason: z.string().max(500).optional(),
});

export const updateTaskProgressSchema = z.object({
  progress: z.number().int().min(0).max(100),
});

export const reassignTaskSchema = z.object({
  assigneeId: z.string().uuid().or(z.string().min(5)),
  reason: z.string().max(500).optional(),
});

export const splitTeamTaskSchema = z.object({
  assignments: z
    .array(
      z.object({
        assigneeId: z.string().uuid().or(z.string().min(5)),
        title: z.string().min(3).max(200),
        description: z.string().optional(),
        estimatedHours: z.number().min(0.5).max(100).optional(),
      })
    )
    .min(2, 'A split must divide the work across at least 2 members'),
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
export type UpdateTaskProgressInput = z.infer<typeof updateTaskProgressSchema>;
export type ReassignTaskInput = z.infer<typeof reassignTaskSchema>;
export type SplitTeamTaskInput = z.infer<typeof splitTeamTaskSchema>;
export type AddTaskCommentInput = z.infer<typeof addTaskCommentSchema>;
export type CreateTaskCampaignInput = z.infer<typeof createTaskCampaignSchema>;
