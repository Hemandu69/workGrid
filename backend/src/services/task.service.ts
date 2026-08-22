import { prisma } from '../db/client.js';
import {
  CreateTaskInput,
  UpdateTaskStatusInput,
  UpdateTaskProgressInput,
  ReassignTaskInput,
  AddTaskCommentInput,
} from '../schemas/task.schema.js';
import { AuthUserPayload } from '../plugins/auth.js';
import { AccountStatus, TaskStatus, UserRole } from '@prisma/client';
import { publishDomainEvent } from '../events/domain-events.js';
import { AvailabilityService } from './availability.service.js';
import {
  TASK_ELIGIBLE_ASSIGNEE_ROLES,
  TaskActorContext,
  TaskScopeContext,
  canCancelTask,
  canCreateTaskFor,
  canManageTask,
  canReassignTask,
  canViewTask,
  isValidStatusTransition,
  statusForProgress,
} from '../utils/task-lifecycle.js';

export class TaskForbiddenError extends Error {
  statusCode = 403;
}
export class TaskNotFoundError extends Error {
  statusCode = 404;
}
export class TaskValidationError extends Error {
  statusCode = 400;
}
export class TaskConflictError extends Error {
  statusCode = 409;
}

function toActorContext(user: AuthUserPayload): TaskActorContext {
  return {
    id: user.id,
    role: user.role,
    accountStatus: user.accountStatus,
    organizationId: user.organizationId,
    roomId: user.roomId || null,
  };
}

const TASK_INCLUDE = {
  assignee: { include: { room: true, subroom: true } },
  creator: true,
  campaign: true,
} as const;

export class TaskService {
  /**
   * Formats a raw Prisma task row into the API-facing shape. Never trust
   * this to determine visibility — callers must already have authorized it.
   */
  private static formatTask(t: any) {
    return {
      id: t.taskIdDisplay || t.id,
      dbId: t.id,
      title: t.title,
      description: t.description || '',
      status: t.status,
      priority: t.priority,
      progress: t.progress,
      assigneeId: t.assigneeId || '',
      assigneeName: t.assignee?.name || 'Unassigned',
      assigneeAvatar: t.assignee?.avatarUrl || undefined,
      assigneeSubroom: t.assignee?.subroom?.code || '—',
      assigneeRoom: t.assignee?.room ? `Room ${t.assignee.room.letter}` : '—',
      assigneeRoomId: t.assignee?.roomId || undefined,
      creatorId: t.creatorId || '',
      creatorName: t.creator?.name || 'System',
      estimatedHours: t.estimatedHours,
      allocatedHours: t.allocatedHours,
      dueDate: t.dueDate ? t.dueDate.toISOString() : new Date().toISOString(),
      createdAt: t.createdAt.toISOString(),
      completedAt: t.completedAt ? t.completedAt.toISOString() : undefined,
      campaignId: t.campaignId || undefined,
      campaignTitle: t.campaign?.title || undefined,
      tags: t.tags,
      commentsCount: t._count?.comments ?? t.comments?.length ?? 0,
    };
  }

  private static toScope(task: { organizationId: string; creatorId: string | null; assigneeId: string | null; assignee?: { roomId?: string | null } | null }): TaskScopeContext {
    return {
      organizationId: task.organizationId,
      creatorId: task.creatorId,
      assigneeId: task.assigneeId,
      assigneeRoomId: task.assignee?.roomId ?? null,
    };
  }

  private static async findRawTask(idOrDisplayId: string) {
    return prisma.task.findFirst({
      where: { OR: [{ id: idOrDisplayId }, { taskIdDisplay: idOrDisplayId }] },
      include: TASK_INCLUDE,
    });
  }

  /**
   * Role-scoped task listing. Filters supplied by the client are honored only
   * within the bounds the requester is authorized to see — a MEMBER can never
   * widen the query past their own assignments, and a TEAM_LEAD/SERVER can
   * never widen it past their own room, regardless of what they pass.
   */
  static async getTasks(
    filters: {
      status?: TaskStatus;
      priority?: string;
      assigneeId?: string;
      roomLetter?: string;
      campaignId?: string;
      search?: string;
    },
    requester: AuthUserPayload
  ) {
    const where: any = { organizationId: requester.organizationId };

    if (filters.status) where.status = filters.status;
    if (filters.priority) where.priority = filters.priority;
    if (filters.campaignId) where.campaignId = filters.campaignId;
    if (filters.search) {
      where.OR = [
        { title: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
        { taskIdDisplay: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    if (requester.role === UserRole.MEMBER) {
      // A member can only ever see their own assignments — the client-supplied
      // assigneeId is ignored entirely rather than trusted.
      where.assigneeId = requester.id;
    } else if (requester.role === UserRole.TEAM_LEAD || requester.role === UserRole.SERVER) {
      if (!requester.roomId) {
        const error = new TaskForbiddenError('You have no room assignment, so no tasks are in scope.');
        throw error;
      }
      where.assignee = { roomId: requester.roomId };
    } else if (filters.assigneeId) {
      // ADMIN/SUPER_ADMIN may filter by assignee if they choose to.
      where.assigneeId = filters.assigneeId;
    }

    if (filters.roomLetter && (requester.role === UserRole.SUPER_ADMIN || requester.role === UserRole.ADMIN)) {
      where.assignee = { ...(where.assignee || {}), room: { letter: filters.roomLetter.toUpperCase() } };
    }

    const tasks = await prisma.task.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { ...TASK_INCLUDE, _count: { select: { comments: true } } },
    });

    return tasks.map((t) => this.formatTask(t));
  }

  static async getTaskById(idOrDisplayId: string, requester: AuthUserPayload) {
    const task = await this.findRawTask(idOrDisplayId);
    if (!task) throw new TaskNotFoundError(`Task ${idOrDisplayId} not found`);

    const actor = toActorContext(requester);
    const scope = this.toScope(task);
    if (!canViewTask(actor, scope)) {
      throw new TaskForbiddenError('You are not authorized to view this task.');
    }

    const [comments, history] = await Promise.all([
      prisma.taskComment.findMany({
        where: { taskId: task.id },
        orderBy: { createdAt: 'asc' },
        include: { author: true },
      }),
      this.getTaskHistoryRaw(task.id),
    ]);

    return {
      ...this.formatTask(task),
      commentsCount: comments.length,
      comments: comments.map((c) => ({
        id: c.id,
        authorId: c.authorId,
        authorName: c.author.name,
        authorAvatar: c.author.avatarUrl || undefined,
        content: c.content,
        createdAt: c.createdAt.toISOString(),
      })),
      history,
    };
  }

  private static async getTaskHistoryRaw(taskId: string) {
    const events =
      typeof (prisma as any).auditEvent?.findMany === 'function'
        ? await prisma.auditEvent.findMany({
            where: { entityType: 'Task', entityId: taskId },
            orderBy: { createdAt: 'asc' },
            include: { user: true },
          })
        : [];

    return events.map((e: any) => ({
      id: e.id,
      action: e.action,
      changedById: e.userId || undefined,
      changedByName: e.user?.name || 'System',
      details: e.details || {},
      createdAt: e.createdAt.toISOString(),
    }));
  }

  static async getTaskHistory(idOrDisplayId: string, requester: AuthUserPayload) {
    const task = await this.findRawTask(idOrDisplayId);
    if (!task) throw new TaskNotFoundError(`Task ${idOrDisplayId} not found`);

    const actor = toActorContext(requester);
    if (!canViewTask(actor, this.toScope(task))) {
      throw new TaskForbiddenError('You are not authorized to view this task.');
    }

    return this.getTaskHistoryRaw(task.id);
  }

  static async createTask(input: CreateTaskInput, user: AuthUserPayload) {
    if (user.accountStatus !== AccountStatus.ACTIVE) {
      throw new TaskForbiddenError('Only ACTIVE accounts may create tasks.');
    }

    // Assignee must exist in the SAME organization — never trust that a
    // client-supplied id/email couldn't resolve to a different org's user.
    const assignee = await prisma.user.findFirst({
      where: {
        organizationId: user.organizationId,
        OR: [{ id: input.assigneeId }, { email: input.assigneeId }],
      },
      include: { room: true },
    });

    if (!assignee) {
      throw new TaskValidationError(`Assignee ${input.assigneeId} not found in your organization.`);
    }

    if (assignee.accountStatus !== AccountStatus.ACTIVE) {
      throw new TaskValidationError(
        `${assignee.name} is currently ${assignee.accountStatus} and cannot receive task assignments.`
      );
    }

    if (!assignee.role || !TASK_ELIGIBLE_ASSIGNEE_ROLES.includes(assignee.role)) {
      throw new TaskValidationError(`${assignee.name}'s role is not eligible to receive task assignments.`);
    }

    const actor = toActorContext(user);
    if (!canCreateTaskFor(actor, assignee.roomId)) {
      throw new TaskForbiddenError(
        'As a Server/Team Lead, you can only assign tasks to members in your own room.'
      );
    }

    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const taskIdDisplay = `TSK-${randomSuffix}`;

    const task = await prisma.$transaction(async (tx) => {
      const created = await tx.task.create({
        data: {
          organizationId: user.organizationId,
          taskIdDisplay,
          title: input.title,
          description: input.description,
          priority: input.priority,
          status: TaskStatus.ASSIGNED,
          progress: 0,
          estimatedHours: input.estimatedHours,
          allocatedHours: 0,
          dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
          assigneeId: assignee.id,
          creatorId: user.id,
          campaignId: input.campaignId,
          tags: input.tags,
        },
      });

      await tx.user.update({
        where: { id: assignee.id },
        data: { currentAllocatedHours: { increment: Math.round(input.estimatedHours) } },
      });

      if (typeof (tx as any).auditEvent?.create === 'function') {
        await (tx as any).auditEvent.create({
          data: {
            organizationId: user.organizationId,
            userId: user.id,
            action: 'TASK_CREATED',
            entityType: 'Task',
            entityId: created.id,
            details: { title: created.title, assigneeId: assignee.id, assigneeName: assignee.name },
          },
        });
      }

      return created;
    });

    const fullTask = await this.getTaskById(task.id, user);

    publishDomainEvent({
      type: 'TASK_CREATED',
      organizationId: user.organizationId,
      entityId: task.id,
      targetUserId: assignee.id,
      actorId: user.id,
      payload: { ...fullTask, assigneeId: assignee.id, creatorId: user.id },
    });

    publishDomainEvent({
      type: 'TASK_ASSIGNED',
      organizationId: user.organizationId,
      entityId: task.id,
      targetUserId: assignee.id,
      actorId: user.id,
      payload: {
        taskId: task.id,
        taskIdDisplay: task.taskIdDisplay,
        title: task.title,
        assigneeId: assignee.id,
        assigneeName: assignee.name,
        creatorId: user.id,
      },
    });

    // Receiving work moves a FREE person to BUSY and broadcasts it, so every
    // authorized view reflects the new load without a refresh. A person who has
    // explicitly set another availability keeps their choice.
    await AvailabilityService.syncAvailabilityWithTasks(assignee.id, user.id).catch(() => null);

    return fullTask;
  }

  static async updateTaskStatus(idOrDisplayId: string, input: UpdateTaskStatusInput, requester: AuthUserPayload) {
    const task = await this.findRawTask(idOrDisplayId);
    if (!task) throw new TaskNotFoundError(`Task ${idOrDisplayId} not found`);

    const actor = toActorContext(requester);
    const scope = this.toScope(task);
    const authorized = input.status === TaskStatus.CANCELLED ? canCancelTask(actor, scope) : canManageTask(actor, scope);
    if (!authorized) {
      throw new TaskForbiddenError('You are not authorized to change this task’s status.');
    }

    if (!isValidStatusTransition(task.status, input.status)) {
      throw new TaskConflictError(`Cannot move task from ${task.status} to ${input.status}.`);
    }

    const now = new Date();
    const isReopening = task.status === TaskStatus.COMPLETED && (input.status as TaskStatus) !== TaskStatus.COMPLETED;
    const nextProgress =
      input.status === TaskStatus.COMPLETED
        ? 100
        : isReopening
        ? Math.min(task.progress, 90) // reopening pulls progress off 100%
        : task.progress;

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.task.update({
        where: { id: task.id },
        data: {
          status: input.status,
          progress: nextProgress,
          allocatedHours: input.allocatedHours !== undefined ? input.allocatedHours : task.allocatedHours,
          completedAt: input.status === TaskStatus.COMPLETED ? now : input.status !== task.status ? null : task.completedAt,
        },
      });

      if (typeof (tx as any).auditEvent?.create === 'function') {
        await (tx as any).auditEvent.create({
          data: {
            organizationId: task.organizationId,
            userId: requester.id,
            action: 'TASK_STATUS_CHANGED',
            entityType: 'Task',
            entityId: task.id,
            details: { previousStatus: task.status, newStatus: input.status, reason: input.reason || null },
          },
        });
      }

      return result;
    });

    const fullTask = await this.getTaskById(updated.id, requester);

    publishDomainEvent({
      type:
        input.status === TaskStatus.COMPLETED
          ? 'TASK_COMPLETED'
          : input.status === TaskStatus.CANCELLED
          ? 'TASK_CANCELLED'
          : 'TASK_STATUS_CHANGED',
      organizationId: task.organizationId,
      entityId: task.id,
      targetUserId: task.assigneeId,
      actorId: requester.id,
      payload: {
        taskId: task.id,
        taskIdDisplay: task.taskIdDisplay,
        assigneeId: task.assigneeId,
        creatorId: task.creatorId,
        previousStatus: task.status,
        newStatus: input.status,
        task: fullTask,
      },
    });

    // Finishing the last active task restores the assignee to FREE; picking work
    // back up moves them to BUSY. Broadcast so every projection stays in step.
    if (task.assigneeId) {
      await AvailabilityService.syncAvailabilityWithTasks(task.assigneeId, requester.id).catch(() => null);
    }

    return fullTask;
  }

  static async updateTaskProgress(idOrDisplayId: string, input: UpdateTaskProgressInput, requester: AuthUserPayload) {
    const task = await this.findRawTask(idOrDisplayId);
    if (!task) throw new TaskNotFoundError(`Task ${idOrDisplayId} not found`);

    const actor = toActorContext(requester);
    const scope = this.toScope(task);
    if (!canManageTask(actor, scope)) {
      throw new TaskForbiddenError('You are not authorized to update this task’s progress.');
    }

    if (task.status === TaskStatus.CANCELLED) {
      throw new TaskConflictError('Cannot update progress on a cancelled task.');
    }

    const nextStatus = statusForProgress(input.progress, task.status);
    if (!isValidStatusTransition(task.status, nextStatus)) {
      throw new TaskConflictError(`Progress of ${input.progress}% is not valid from status ${task.status}.`);
    }

    const now = new Date();
    const completingNow = nextStatus === TaskStatus.COMPLETED && task.status !== TaskStatus.COMPLETED;
    const reopeningNow = task.status === TaskStatus.COMPLETED && nextStatus !== TaskStatus.COMPLETED;

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.task.update({
        where: { id: task.id },
        data: {
          progress: input.progress,
          status: nextStatus,
          completedAt: completingNow ? now : reopeningNow ? null : task.completedAt,
        },
      });

      if (typeof (tx as any).auditEvent?.create === 'function') {
        await (tx as any).auditEvent.create({
          data: {
            organizationId: task.organizationId,
            userId: requester.id,
            action: 'TASK_PROGRESS_CHANGED',
            entityType: 'Task',
            entityId: task.id,
            details: { previousProgress: task.progress, newProgress: input.progress },
          },
        });

        if (nextStatus !== task.status && typeof (tx as any).auditEvent?.create === 'function') {
          await (tx as any).auditEvent.create({
            data: {
              organizationId: task.organizationId,
              userId: requester.id,
              action: 'TASK_STATUS_CHANGED',
              entityType: 'Task',
              entityId: task.id,
              details: { previousStatus: task.status, newStatus: nextStatus, reason: 'progress-driven' },
            },
          });
        }
      }

      return result;
    });

    const fullTask = await this.getTaskById(updated.id, requester);

    publishDomainEvent({
      type: 'TASK_PROGRESS_CHANGED',
      organizationId: task.organizationId,
      entityId: task.id,
      targetUserId: task.assigneeId,
      actorId: requester.id,
      payload: {
        taskId: task.id,
        taskIdDisplay: task.taskIdDisplay,
        assigneeId: task.assigneeId,
        creatorId: task.creatorId,
        previousProgress: task.progress,
        newProgress: input.progress,
        task: fullTask,
      },
    });

    if (nextStatus !== task.status) {
      publishDomainEvent({
        type: completingNow ? 'TASK_COMPLETED' : 'TASK_STATUS_CHANGED',
        organizationId: task.organizationId,
        entityId: task.id,
        targetUserId: task.assigneeId,
        actorId: requester.id,
        payload: {
          taskId: task.id,
          taskIdDisplay: task.taskIdDisplay,
          assigneeId: task.assigneeId,
          creatorId: task.creatorId,
          previousStatus: task.status,
          newStatus: nextStatus,
          task: fullTask,
        },
      });
    }

    if (task.assigneeId) {
      await AvailabilityService.syncAvailabilityWithTasks(task.assigneeId, requester.id).catch(() => null);
    }

    return fullTask;
  }

  static async reassignTask(idOrDisplayId: string, input: ReassignTaskInput, requester: AuthUserPayload) {
    const task = await this.findRawTask(idOrDisplayId);
    if (!task) throw new TaskNotFoundError(`Task ${idOrDisplayId} not found`);

    if (task.status === TaskStatus.COMPLETED || task.status === TaskStatus.CANCELLED) {
      throw new TaskConflictError(`Cannot reassign a task that is already ${task.status}.`);
    }

    const newAssignee = await prisma.user.findFirst({
      where: {
        organizationId: task.organizationId,
        OR: [{ id: input.assigneeId }, { email: input.assigneeId }],
      },
      include: { room: true },
    });

    if (!newAssignee) {
      throw new TaskValidationError(`Assignee ${input.assigneeId} not found in your organization.`);
    }
    if (newAssignee.accountStatus !== AccountStatus.ACTIVE) {
      throw new TaskValidationError(`${newAssignee.name} is currently ${newAssignee.accountStatus} and cannot receive task assignments.`);
    }
    if (!newAssignee.role || !TASK_ELIGIBLE_ASSIGNEE_ROLES.includes(newAssignee.role)) {
      throw new TaskValidationError(`${newAssignee.name}'s role is not eligible to receive task assignments.`);
    }

    const actor = toActorContext(requester);
    const scope = this.toScope(task);
    if (!canReassignTask(actor, scope, newAssignee.roomId)) {
      throw new TaskForbiddenError('You are not authorized to reassign this task.');
    }

    if (newAssignee.id === task.assigneeId) {
      throw new TaskConflictError(`Task is already assigned to ${newAssignee.name}.`);
    }

    const previousAssigneeId = task.assigneeId;
    const previousAssigneeName = task.assignee?.name || null;

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.task.update({
        where: { id: task.id },
        data: { assigneeId: newAssignee.id },
      });

      if (previousAssigneeId) {
        await tx.user.update({
          where: { id: previousAssigneeId },
          data: { currentAllocatedHours: { decrement: Math.round(task.estimatedHours) } },
        }).catch(() => null);
      }
      await tx.user.update({
        where: { id: newAssignee.id },
        data: { currentAllocatedHours: { increment: Math.round(task.estimatedHours) } },
      });

      if (typeof (tx as any).auditEvent?.create === 'function') {
        await (tx as any).auditEvent.create({
          data: {
            organizationId: task.organizationId,
            userId: requester.id,
            action: 'TASK_REASSIGNED',
            entityType: 'Task',
            entityId: task.id,
            details: {
              previousAssigneeId,
              previousAssigneeName,
              newAssigneeId: newAssignee.id,
              newAssigneeName: newAssignee.name,
              reason: input.reason || null,
            },
          },
        });
      }

      return result;
    });

    const fullTask = await this.getTaskById(updated.id, requester);

    publishDomainEvent({
      type: 'TASK_REASSIGNED',
      organizationId: task.organizationId,
      entityId: task.id,
      targetUserId: newAssignee.id,
      actorId: requester.id,
      payload: {
        taskId: task.id,
        taskIdDisplay: task.taskIdDisplay,
        previousAssigneeId,
        previousAssigneeName,
        newAssigneeId: newAssignee.id,
        newAssigneeName: newAssignee.name,
        creatorId: task.creatorId,
        task: fullTask,
      },
    });

    if (previousAssigneeId) {
      await AvailabilityService.syncAvailabilityWithTasks(previousAssigneeId, requester.id).catch(() => null);
    }
    await AvailabilityService.syncAvailabilityWithTasks(newAssignee.id, requester.id).catch(() => null);

    return fullTask;
  }

  static async cancelTask(idOrDisplayId: string, reason: string | undefined, requester: AuthUserPayload) {
    return this.updateTaskStatus(idOrDisplayId, { status: TaskStatus.CANCELLED, reason }, requester);
  }

  static async completeTask(idOrDisplayId: string, requester: AuthUserPayload) {
    return this.updateTaskStatus(idOrDisplayId, { status: TaskStatus.COMPLETED }, requester);
  }

  static async addTaskComment(idOrDisplayId: string, input: AddTaskCommentInput, user: AuthUserPayload) {
    const task = await this.findRawTask(idOrDisplayId);
    if (!task) throw new TaskNotFoundError(`Task ${idOrDisplayId} not found`);

    const actor = toActorContext(user);
    if (!canViewTask(actor, this.toScope(task))) {
      throw new TaskForbiddenError('You are not authorized to comment on this task.');
    }

    const comment = await prisma.taskComment.create({
      data: { taskId: task.id, authorId: user.id, content: input.content },
      include: { author: true },
    });

    const formatted = {
      id: comment.id,
      authorId: comment.authorId,
      authorName: comment.author.name,
      authorAvatar: comment.author.avatarUrl || undefined,
      content: comment.content,
      createdAt: comment.createdAt.toISOString(),
    };

    publishDomainEvent({
      type: 'TASK_UPDATED',
      organizationId: task.organizationId,
      entityId: task.id,
      targetUserId: task.assigneeId,
      actorId: user.id,
      payload: {
        taskId: task.id,
        taskIdDisplay: task.taskIdDisplay,
        assigneeId: task.assigneeId,
        creatorId: task.creatorId,
        comment: formatted,
      },
    });

    return formatted;
  }

  /**
   * Backend-derived task analytics. SUPER_ADMIN/ADMIN see the whole
   * organization; a TEAM_LEAD sees only their own room.
   */
  static async getTaskAnalytics(requester: AuthUserPayload) {
    const where: any = { organizationId: requester.organizationId };

    if (requester.role === UserRole.TEAM_LEAD) {
      if (!requester.roomId) {
        throw new TaskForbiddenError('You have no room assignment, so no analytics are in scope.');
      }
      where.assignee = { roomId: requester.roomId };
    } else if (requester.role !== UserRole.SUPER_ADMIN && requester.role !== UserRole.ADMIN) {
      throw new TaskForbiddenError('You are not authorized to view task analytics.');
    }

    const tasks = await prisma.task.findMany({
      where,
      select: {
        status: true,
        priority: true,
        dueDate: true,
        createdAt: true,
        completedAt: true,
        assigneeId: true,
        assignee: { select: { id: true, name: true } },
      },
    });

    const now = new Date();
    const byStatus: Record<string, number> = {};
    for (const status of Object.values(TaskStatus)) byStatus[status] = 0;

    let overdue = 0;
    let completedCount = 0;
    let totalCompletionMs = 0;
    const perPerson = new Map<string, { name: string; total: number; completed: number }>();

    for (const t of tasks) {
      byStatus[t.status] = (byStatus[t.status] || 0) + 1;

      if (
        t.dueDate &&
        t.dueDate.getTime() < now.getTime() &&
        t.status !== TaskStatus.COMPLETED &&
        t.status !== TaskStatus.CANCELLED
      ) {
        overdue++;
      }

      if (t.status === TaskStatus.COMPLETED && t.completedAt) {
        completedCount++;
        totalCompletionMs += t.completedAt.getTime() - t.createdAt.getTime();
      }

      if (t.assigneeId && t.assignee) {
        const entry = perPerson.get(t.assigneeId) || { name: t.assignee.name, total: 0, completed: 0 };
        entry.total++;
        if (t.status === TaskStatus.COMPLETED) entry.completed++;
        perPerson.set(t.assigneeId, entry);
      }
    }

    const totalTasks = tasks.length;
    const nonCancelled = totalTasks - byStatus[TaskStatus.CANCELLED];
    const completionRate = nonCancelled > 0 ? Math.round((completedCount / nonCancelled) * 100) : 0;
    const averageCompletionHours = completedCount > 0 ? Math.round((totalCompletionMs / completedCount / 3600000) * 10) / 10 : 0;

    return {
      totalTasks,
      byStatus,
      overdueCount: overdue,
      completionRate,
      averageCompletionHours,
      tasksPerPerson: Array.from(perPerson.entries()).map(([id, v]) => ({
        assigneeId: id,
        assigneeName: v.name,
        totalTasks: v.total,
        completedTasks: v.completed,
      })),
    };
  }
}
