import { prisma } from '../db/client.js';
import {
  CreateTaskInput,
  UpdateTaskStatusInput,
  UpdateTaskProgressInput,
  ReassignTaskInput,
  SplitTeamTaskInput,
  AddTaskCommentInput,
} from '../schemas/task.schema.js';
import { AuthUserPayload } from '../plugins/auth.js';
import { AccountStatus, TaskStatus, TaskType, UserRole } from '@prisma/client';
import { publishDomainEvent } from '../events/domain-events.js';
import { AvailabilityService } from './availability.service.js';
import { DEFAULT_PAGE_LIMIT } from '../schemas/pagination.schema.js';
import { deriveAvailability, availabilityFromUserStatus } from '../utils/availability-projection.js';
import {
  TASK_ELIGIBLE_ASSIGNEE_ROLES,
  TaskActorContext,
  TaskScopeContext,
  canCancelTask,
  canCreateTaskFor,
  canManageTask,
  canManageTeamTask,
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

function toActorContext(user: AuthUserPayload, roomLetter?: string | null): TaskActorContext {
  return {
    id: user.id,
    role: user.role,
    accountStatus: user.accountStatus,
    organizationId: user.organizationId,
    roomId: user.roomId || null,
    roomLetter: roomLetter ?? null,
  };
}

const TASK_INCLUDE = {
  assignee: { include: { room: true, subroom: true } },
  creator: true,
  campaign: true,
  childTasks: { select: { id: true } },
} as const;

// Lighter include for list views — formatTask only reads a handful of fields
// off assignee/creator/campaign, so list queries don't need the full related
// rows that TASK_INCLUDE pulls for single-task detail views.
const TASK_LIST_INCLUDE = {
  assignee: {
    select: {
      id: true,
      name: true,
      avatarUrl: true,
      roomId: true,
      room: { select: { letter: true } },
      subroom: { select: { code: true } },
    },
  },
  creator: { select: { id: true, name: true } },
  campaign: { select: { id: true, title: true } },
  childTasks: { select: { id: true } },
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
      taskType: t.taskType,
      teamSection: t.teamSection || undefined,
      parentTaskId: t.parentTaskId || undefined,
      isDistributed: (t.childTasks?.length ?? 0) > 0,
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

  private static toScope(task: {
    organizationId: string;
    creatorId: string | null;
    assigneeId: string | null;
    assignee?: { roomId?: string | null } | null;
    taskType?: TaskType;
    teamSection?: string | null;
  }): TaskScopeContext {
    return {
      organizationId: task.organizationId,
      creatorId: task.creatorId,
      assigneeId: task.assigneeId,
      assigneeRoomId: task.assignee?.roomId ?? null,
      taskType: task.taskType,
      teamSection: task.teamSection ?? null,
    };
  }

  /** Resolves the actor's own section letter — needed for team-task scope checks that can't rely on an assignee's room. */
  private static async resolveRoomLetter(userId: string): Promise<string | null> {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { room: { select: { letter: true } } } });
    return user?.room?.letter ?? null;
  }

  /** Builds the actor context used for authorization, resolving roomLetter only for TEAM_LEAD (the one role that needs it, for unassigned-team-task scope checks). */
  private static async buildActorContext(user: AuthUserPayload): Promise<TaskActorContext> {
    const roomLetter = user.role === UserRole.TEAM_LEAD ? await this.resolveRoomLetter(user.id) : null;
    return toActorContext(user, roomLetter);
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
    requester: AuthUserPayload,
    pagination: { limit: number; offset: number } = { limit: DEFAULT_PAGE_LIMIT, offset: 0 }
  ) {
    const where: any = { organizationId: requester.organizationId };
    const andConditions: any[] = [];

    if (filters.status) where.status = filters.status;
    if (filters.priority) where.priority = filters.priority;
    if (filters.campaignId) where.campaignId = filters.campaignId;
    if (filters.search) {
      andConditions.push({
        OR: [
          { title: { contains: filters.search, mode: 'insensitive' } },
          { description: { contains: filters.search, mode: 'insensitive' } },
          { taskIdDisplay: { contains: filters.search, mode: 'insensitive' } },
        ],
      });
    }

    if (requester.role === UserRole.MEMBER) {
      // A member can only ever see their own assignments — the client-supplied
      // assigneeId is ignored entirely rather than trusted.
      where.assigneeId = requester.id;
    } else if (requester.role === UserRole.TEAM_LEAD) {
      if (!requester.roomId) {
        throw new TaskForbiddenError('You have no room assignment, so no tasks are in scope.');
      }
      // A Team Lead sees tasks assigned within their room, plus their own
      // section's unassigned team tasks (which have no assignee to match on).
      const roomLetter = await this.resolveRoomLetter(requester.id);
      andConditions.push({
        OR: [
          { assignee: { roomId: requester.roomId } },
          ...(roomLetter ? [{ taskType: TaskType.TEAM, teamSection: roomLetter, assigneeId: null }] : []),
        ],
      });
    } else if (requester.role === UserRole.SERVER) {
      if (!requester.roomId) {
        throw new TaskForbiddenError('You have no room assignment, so no tasks are in scope.');
      }
      where.assignee = { roomId: requester.roomId };
    } else if (filters.assigneeId) {
      // ADMIN/SUPER_ADMIN may filter by assignee if they choose to.
      where.assigneeId = filters.assigneeId;
    }

    if (filters.roomLetter && (requester.role === UserRole.SUPER_ADMIN || requester.role === UserRole.ADMIN)) {
      where.assignee = { ...(where.assignee || {}), room: { letter: filters.roomLetter.toUpperCase() } };
    }

    if (andConditions.length > 0) where.AND = andConditions;

    const [total, tasks] = await prisma.$transaction(async (tx) => [
      await tx.task.count({ where }),
      await tx.task.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: { ...TASK_LIST_INCLUDE, _count: { select: { comments: true } } },
        take: pagination.limit,
        skip: pagination.offset,
      }),
    ]);

    return { items: tasks.map((t) => this.formatTask(t)), total, limit: pagination.limit, offset: pagination.offset };
  }

  static async getTaskById(idOrDisplayId: string, requester: AuthUserPayload) {
    const task = await this.findRawTask(idOrDisplayId);
    if (!task) throw new TaskNotFoundError(`Task ${idOrDisplayId} not found`);

    const actor = await this.buildActorContext(requester);
    const scope = this.toScope(task);
    if (!canViewTask(actor, scope)) {
      throw new TaskForbiddenError('You are not authorized to view this task.');
    }

    return this.formatTaskDetail(task);
  }

  /**
   * Formats a task detail response (comments + history) from a raw row that
   * already carries the TASK_INCLUDE-shaped relations. Callers that just
   * performed a mutation and already have the relevant relations in scope
   * (e.g. createTask's freshly-fetched assignee, reassignTask's newAssignee)
   * pass a merged row here instead of re-running findRawTask's full include
   * — the caller is responsible for having already authorized the action.
   */
  private static async formatTaskDetail(taskWithRelations: any) {
    const [comments, history] = await Promise.all([
      prisma.taskComment.findMany({
        where: { taskId: taskWithRelations.id },
        orderBy: { createdAt: 'asc' },
        include: { author: true },
      }),
      this.getTaskHistoryRaw(taskWithRelations.id),
    ]);

    return {
      ...this.formatTask(taskWithRelations),
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

    const actor = await this.buildActorContext(requester);
    if (!canViewTask(actor, this.toScope(task))) {
      throw new TaskForbiddenError('You are not authorized to view this task.');
    }

    return this.getTaskHistoryRaw(task.id);
  }

  static async createTask(input: CreateTaskInput, user: AuthUserPayload) {
    if (user.accountStatus !== AccountStatus.ACTIVE) {
      throw new TaskForbiddenError('Only ACTIVE accounts may create tasks.');
    }

    if (input.taskType === TaskType.TEAM) {
      return this.createTeamTask(input, user);
    }

    if (!input.assigneeId) {
      throw new TaskValidationError('assigneeId is required for an individual task.');
    }
    const assigneeIdOrEmail = input.assigneeId;

    // Assignee must exist in the SAME organization — never trust that a
    // client-supplied id/email couldn't resolve to a different org's user.
    const assignee = await prisma.user.findFirst({
      where: {
        organizationId: user.organizationId,
        OR: [{ id: assigneeIdOrEmail }, { email: assigneeIdOrEmail }],
      },
      include: { room: true, subroom: true },
    });

    if (!assignee) {
      throw new TaskValidationError(`Assignee ${assigneeIdOrEmail} not found in your organization.`);
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

    // Fetched only when a campaign is actually attached — avoids an
    // unconditional join for the common no-campaign case.
    const campaign = input.campaignId
      ? await prisma.taskCampaign.findUnique({ where: { id: input.campaignId }, select: { id: true, title: true } })
      : null;

    const task = await prisma.$transaction(async (tx) => {
      const created = await tx.task.create({
        data: {
          organizationId: user.organizationId,
          taskIdDisplay,
          title: input.title,
          description: input.description,
          priority: input.priority,
          taskType: TaskType.INDIVIDUAL,
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

    // Built directly from data already in scope instead of re-fetching the
    // full task detail — a task that's milliseconds old has no comments or
    // prior history entries beyond the TASK_CREATED audit event just written,
    // which formatTaskDetail's own history query below picks up correctly.
    const fullTask = await this.formatTaskDetail({
      ...task,
      assignee,
      creator: { name: user.name },
      campaign,
      childTasks: [],
    });

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

  /**
   * A TEAM task belongs to a section, not a person — it starts unassigned
   * (status DRAFT, displayed as "Open") and the section's Team Lead later
   * assigns it to one member or splits it across several via splitTeamTask.
   */
  private static async createTeamTask(input: CreateTaskInput, user: AuthUserPayload) {
    if (!input.teamSection) {
      throw new TaskValidationError('teamSection is required for a team task.');
    }
    const teamSection = input.teamSection.toUpperCase();

    const room = await prisma.room.findFirst({
      where: { organizationId: user.organizationId, letter: teamSection },
    });
    if (!room) {
      throw new TaskValidationError(`Section ${teamSection} does not exist in your organization.`);
    }

    const actorRoomLetter = user.role === UserRole.TEAM_LEAD ? await this.resolveRoomLetter(user.id) : null;
    const actor = toActorContext(user, actorRoomLetter);
    const newTaskScope: TaskScopeContext = {
      organizationId: user.organizationId,
      creatorId: user.id,
      assigneeId: null,
      taskType: TaskType.TEAM,
      teamSection,
    };
    if (!canManageTeamTask(actor, newTaskScope)) {
      throw new TaskForbiddenError('You can only create team tasks for your own section.');
    }

    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const taskIdDisplay = `TSK-${randomSuffix}`;

    const campaign = input.campaignId
      ? await prisma.taskCampaign.findUnique({ where: { id: input.campaignId }, select: { id: true, title: true } })
      : null;

    const task = await prisma.$transaction(async (tx) => {
      const created = await tx.task.create({
        data: {
          organizationId: user.organizationId,
          taskIdDisplay,
          title: input.title,
          description: input.description,
          priority: input.priority,
          taskType: TaskType.TEAM,
          teamSection,
          status: TaskStatus.DRAFT,
          progress: 0,
          estimatedHours: input.estimatedHours,
          allocatedHours: 0,
          dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
          assigneeId: null,
          creatorId: user.id,
          campaignId: input.campaignId,
          tags: input.tags,
        },
      });

      if (typeof (tx as any).auditEvent?.create === 'function') {
        await (tx as any).auditEvent.create({
          data: {
            organizationId: user.organizationId,
            userId: user.id,
            action: 'TASK_CREATED',
            entityType: 'Task',
            entityId: created.id,
            details: { title: created.title, taskType: 'TEAM', teamSection },
          },
        });
      }

      return created;
    });

    const fullTask = await this.formatTaskDetail({
      ...task,
      assignee: null,
      creator: { name: user.name },
      campaign,
      childTasks: [],
    });

    publishDomainEvent({
      type: 'TASK_CREATED',
      organizationId: user.organizationId,
      entityId: task.id,
      actorId: user.id,
      payload: { ...fullTask, creatorId: user.id },
    });

    // No assignee yet — nothing to sync availability for.
    return fullTask;
  }

  static async updateTaskStatus(idOrDisplayId: string, input: UpdateTaskStatusInput, requester: AuthUserPayload) {
    const task = await this.findRawTask(idOrDisplayId);
    if (!task) throw new TaskNotFoundError(`Task ${idOrDisplayId} not found`);

    const actor = await this.buildActorContext(requester);
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

    // task already carries the full TASK_INCLUDE relations (assignee/creator/
    // campaign/childTasks are untouched by a status change) — merge in just
    // the updated scalar fields instead of re-querying them.
    const fullTask = await this.formatTaskDetail({ ...task, ...updated });

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

    const actor = await this.buildActorContext(requester);
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

    const fullTask = await this.formatTaskDetail({ ...task, ...updated });

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
      include: { room: true, subroom: true },
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

    const actor = await this.buildActorContext(requester);
    const scope = this.toScope(task);
    const isUnassignedTeamTask = task.taskType === TaskType.TEAM && task.assigneeId == null;
    const authorized = isUnassignedTeamTask
      ? canManageTeamTask(actor, scope)
      : canReassignTask(actor, scope, newAssignee.roomId);
    if (!authorized) {
      throw new TaskForbiddenError('You are not authorized to reassign this task.');
    }

    if (newAssignee.id === task.assigneeId) {
      throw new TaskConflictError(`Task is already assigned to ${newAssignee.name}.`);
    }

    if (task.taskType === TaskType.TEAM) {
      const availability = deriveAvailability({
        presenceState: newAssignee.presenceState,
        storedState: availabilityFromUserStatus(newAssignee.status),
      });
      if (availability.state === 'UNAVAILABLE') {
        throw new TaskConflictError(`${newAssignee.name} is currently unavailable and cannot be assigned this team task.`);
      }
    }

    const previousAssigneeId = task.assigneeId;
    const previousAssigneeName = task.assignee?.name || null;

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.task.update({
        where: { id: task.id },
        data: {
          assigneeId: newAssignee.id,
          // First-time assignment of an unassigned team task also leaves DRAFT.
          status: isUnassignedTeamTask ? TaskStatus.ASSIGNED : task.status,
        },
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

    // creator/campaign/childTasks are unchanged by a reassignment — only the
    // assignee relation needs replacing, with the newAssignee row already
    // fetched above (including room/subroom, so formatTask's fields resolve
    // without another query).
    const fullTask = await this.formatTaskDetail({ ...task, ...updated, assignee: newAssignee });

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

  /**
   * Divides an unassigned TEAM task into several new INDIVIDUAL child tasks,
   * one per member — the original team task is never deleted or duplicated;
   * it stays as the parent record, and its "distributed" state is derived
   * purely from whether it now has child tasks.
   */
  static async splitTeamTask(idOrDisplayId: string, input: SplitTeamTaskInput, requester: AuthUserPayload) {
    const task = await this.findRawTask(idOrDisplayId);
    if (!task) throw new TaskNotFoundError(`Task ${idOrDisplayId} not found`);

    if (task.taskType !== TaskType.TEAM || task.assigneeId != null) {
      throw new TaskConflictError('Only an unassigned team task can be split among members.');
    }

    const actor = await this.buildActorContext(requester);
    if (!canManageTeamTask(actor, this.toScope(task))) {
      throw new TaskForbiddenError('You are not authorized to split this team task.');
    }

    // Resolve every candidate in one batched lookup instead of one query per
    // assignment, then validate each in the original per-assignment order so
    // error messages/precedence are unchanged.
    const candidateKeys = input.assignments.map((a) => a.assigneeId);
    const candidateRows = await prisma.user.findMany({
      where: {
        organizationId: task.organizationId,
        OR: [{ id: { in: candidateKeys } }, { email: { in: candidateKeys } }],
      },
      include: { room: true, subroom: true },
    });
    const candidateByKey = new Map<string, (typeof candidateRows)[number]>();
    for (const c of candidateRows) {
      candidateByKey.set(c.id, c);
      candidateByKey.set(c.email, c);
    }

    const resolved: Array<{ assignment: (typeof input.assignments)[number]; candidate: (typeof candidateRows)[number] }> = [];
    for (const assignment of input.assignments) {
      const candidate = candidateByKey.get(assignment.assigneeId);
      if (!candidate) {
        throw new TaskValidationError(`Assignee ${assignment.assigneeId} not found in your organization.`);
      }
      if (candidate.accountStatus !== AccountStatus.ACTIVE) {
        throw new TaskValidationError(`${candidate.name} is currently ${candidate.accountStatus} and cannot receive task assignments.`);
      }
      if (!candidate.role || !TASK_ELIGIBLE_ASSIGNEE_ROLES.includes(candidate.role)) {
        throw new TaskValidationError(`${candidate.name}'s role is not eligible to receive task assignments.`);
      }
      const availability = deriveAvailability({
        presenceState: candidate.presenceState,
        storedState: availabilityFromUserStatus(candidate.status),
      });
      if (availability.state === 'UNAVAILABLE') {
        throw new TaskConflictError(`${candidate.name} is currently unavailable and cannot be assigned part of this team task.`);
      }
      resolved.push({ assignment, candidate });
    }

    const created = await prisma.$transaction(async (tx) => {
      const childRows: Array<{ child: any; candidate: (typeof candidateRows)[number] }> = [];

      for (const { assignment, candidate } of resolved) {
        const randomSuffix = Math.floor(1000 + Math.random() * 9000);
        const estimatedHours = assignment.estimatedHours ?? task.estimatedHours;

        const child = await tx.task.create({
          data: {
            organizationId: task.organizationId,
            taskIdDisplay: `TSK-${randomSuffix}`,
            title: assignment.title,
            description: assignment.description ?? task.description,
            priority: task.priority,
            taskType: TaskType.INDIVIDUAL,
            parentTaskId: task.id,
            status: TaskStatus.ASSIGNED,
            progress: 0,
            estimatedHours,
            allocatedHours: 0,
            dueDate: task.dueDate,
            assigneeId: candidate.id,
            creatorId: requester.id,
            campaignId: task.campaignId,
            tags: task.tags,
          },
        });

        await tx.user.update({
          where: { id: candidate.id },
          data: { currentAllocatedHours: { increment: Math.round(estimatedHours) } },
        });

        if (typeof (tx as any).auditEvent?.create === 'function') {
          await (tx as any).auditEvent.create({
            data: {
              organizationId: task.organizationId,
              userId: requester.id,
              action: 'TASK_CREATED',
              entityType: 'Task',
              entityId: child.id,
              details: { title: child.title, assigneeId: candidate.id, assigneeName: candidate.name, parentTaskId: task.id },
            },
          });
        }

        childRows.push({ child, candidate });
      }

      if (typeof (tx as any).auditEvent?.create === 'function') {
        await (tx as any).auditEvent.create({
          data: {
            organizationId: task.organizationId,
            userId: requester.id,
            action: 'TASK_SPLIT',
            entityType: 'Task',
            entityId: task.id,
            details: {
              childTaskIds: childRows.map((c) => c.child.id),
              childAssigneeNames: childRows.map((c) => c.candidate.name),
            },
          },
        });
      }

      return childRows;
    });

    // Built directly from the transaction's own results instead of a
    // getTaskById-per-child re-fetch — each child is milliseconds old with
    // no comments and only the TASK_CREATED entry formatTaskDetail's own
    // history query below picks up.
    const children = await Promise.all(
      created.map(({ child, candidate }) =>
        this.formatTaskDetail({
          ...child,
          assignee: candidate,
          creator: { name: requester.name },
          campaign: task.campaign,
          childTasks: [],
        })
      )
    );

    for (let i = 0; i < children.length; i++) {
      const fullChild = children[i];
      const candidateId = created[i].candidate.id;

      publishDomainEvent({
        type: 'TASK_CREATED',
        organizationId: task.organizationId,
        entityId: fullChild.dbId,
        targetUserId: candidateId,
        actorId: requester.id,
        payload: { ...fullChild, assigneeId: candidateId, creatorId: requester.id },
      });

      publishDomainEvent({
        type: 'TASK_ASSIGNED',
        organizationId: task.organizationId,
        entityId: fullChild.dbId,
        targetUserId: candidateId,
        actorId: requester.id,
        payload: {
          taskId: fullChild.dbId,
          taskIdDisplay: fullChild.id,
          title: fullChild.title,
          assigneeId: candidateId,
          assigneeName: fullChild.assigneeName,
          creatorId: requester.id,
        },
      });

      await AvailabilityService.syncAvailabilityWithTasks(candidateId, requester.id).catch(() => null);
    }

    // Only childTasks changed on the parent (it now has the newly created
    // children) — reuse the already-loaded task row instead of a full
    // findRawTask re-fetch.
    const fullParent = await this.formatTaskDetail({
      ...task,
      childTasks: created.map(({ child }) => ({ id: child.id })),
    });

    publishDomainEvent({
      type: 'TASK_UPDATED',
      organizationId: task.organizationId,
      entityId: task.id,
      actorId: requester.id,
      payload: {
        taskId: task.id,
        taskIdDisplay: task.taskIdDisplay,
        assigneeId: task.assigneeId,
        creatorId: task.creatorId,
        task: fullParent,
      },
    });

    return { parent: fullParent, children };
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

    const actor = await this.buildActorContext(user);
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
