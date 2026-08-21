import { prisma } from '../db/client.js';
import { CreateTaskInput, UpdateTaskStatusInput, AddTaskCommentInput } from '../schemas/task.schema.js';
import { AuthUserPayload } from '../plugins/auth.js';
import { TaskPriority, TaskStatus, UserRole } from '@prisma/client';
import { publishDomainEvent } from '../events/domain-events.js';

export class TaskService {
  static async getTasks(filters: {
    status?: TaskStatus;
    priority?: TaskPriority;
    assigneeId?: string;
    roomLetter?: string;
    campaignId?: string;
    search?: string;
    organizationId?: string;
  }) {
    const where: any = {};

    if (filters.organizationId) where.organizationId = filters.organizationId;
    if (filters.status) where.status = filters.status;
    if (filters.priority) where.priority = filters.priority;
    if (filters.assigneeId) where.assigneeId = filters.assigneeId;
    if (filters.campaignId) where.campaignId = filters.campaignId;

    if (filters.roomLetter) {
      where.assignee = {
        room: { letter: filters.roomLetter.toUpperCase() },
      };
    }

    if (filters.search) {
      where.OR = [
        { title: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
        { taskIdDisplay: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const tasks = await prisma.task.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        assignee: {
          include: {
            room: true,
            subroom: true,
          },
        },
        creator: true,
        campaign: true,
        _count: {
          select: { comments: true },
        },
      },
    });

    return tasks.map((t) => ({
      id: t.taskIdDisplay || t.id,
      dbId: t.id,
      title: t.title,
      description: t.description || '',
      status: t.status,
      priority: t.priority,
      assigneeId: t.assigneeId || '',
      assigneeName: t.assignee?.name || 'Unassigned',
      assigneeAvatar: t.assignee?.avatarUrl || undefined,
      assigneeSubroom: t.assignee?.subroom?.code || '—',
      assigneeRoom: t.assignee?.room ? `Room ${t.assignee.room.letter}` : '—',
      creatorId: t.creatorId || '',
      creatorName: t.creator?.name || 'System',
      estimatedHours: t.estimatedHours,
      allocatedHours: t.allocatedHours,
      dueDate: t.dueDate ? t.dueDate.toISOString() : new Date().toISOString(),
      createdAt: t.createdAt.toISOString(),
      campaignId: t.campaignId || undefined,
      campaignTitle: t.campaign?.title || undefined,
      tags: t.tags,
      commentsCount: t._count.comments,
    }));
  }

  static async getTaskById(idOrDisplayId: string) {
    const task = await prisma.task.findFirst({
      where: {
        OR: [{ id: idOrDisplayId }, { taskIdDisplay: idOrDisplayId }],
      },
      include: {
        assignee: {
          include: {
            room: true,
            subroom: true,
          },
        },
        creator: true,
        campaign: true,
        comments: {
          orderBy: { createdAt: 'asc' },
          include: {
            author: true,
          },
        },
      },
    });

    if (!task) {
      throw new Error(`Task ${idOrDisplayId} not found`);
    }

    return {
      id: task.taskIdDisplay || task.id,
      dbId: task.id,
      title: task.title,
      description: task.description || '',
      status: task.status,
      priority: task.priority,
      assigneeId: task.assigneeId || '',
      assigneeName: task.assignee?.name || 'Unassigned',
      assigneeAvatar: task.assignee?.avatarUrl || undefined,
      assigneeSubroom: task.assignee?.subroom?.code || '—',
      assigneeRoom: task.assignee?.room ? `Room ${task.assignee.room.letter}` : '—',
      creatorId: task.creatorId || '',
      creatorName: task.creator?.name || 'System',
      estimatedHours: task.estimatedHours,
      allocatedHours: task.allocatedHours,
      dueDate: task.dueDate ? task.dueDate.toISOString() : new Date().toISOString(),
      createdAt: task.createdAt.toISOString(),
      campaignId: task.campaignId || undefined,
      campaignTitle: task.campaign?.title || undefined,
      tags: task.tags,
      commentsCount: task.comments.length,
      comments: task.comments.map((c) => ({
        id: c.id,
        authorId: c.authorId,
        authorName: c.author.name,
        authorAvatar: c.author.avatarUrl || undefined,
        content: c.content,
        createdAt: c.createdAt.toISOString(),
      })),
    };
  }

  static async createTask(input: CreateTaskInput, user: AuthUserPayload) {
    // 1. Verify Assignee exists
    const assignee = await prisma.user.findFirst({
      where: {
        OR: [{ id: input.assigneeId }, { email: input.assigneeId }],
      },
      include: { room: true },
    });

    if (!assignee) {
      throw new Error(`Assignee ${input.assigneeId} not found`);
    }

    // 2. Server Hierarchy Enforcement:
    // If creator is SERVER, assignee must be in the Server's room
    if (user.role === UserRole.SERVER) {
      if (!user.roomId || assignee.roomId !== user.roomId) {
        throw new Error(
          `Permission Denied: As a Server/Lead, you can only assign tasks to members in your own room.`
        );
      }
    }

    // 3. Generate unique Task Display ID
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const taskIdDisplay = `TSK-${randomSuffix}`;

    const task = await prisma.task.create({
      data: {
        organizationId: user.organizationId,
        taskIdDisplay,
        title: input.title,
        description: input.description,
        priority: input.priority,
        status: TaskStatus.ASSIGNED,
        estimatedHours: input.estimatedHours,
        allocatedHours: 0,
        dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
        assigneeId: assignee.id,
        creatorId: user.id,
        campaignId: input.campaignId,
        tags: input.tags,
      },
      include: {
        assignee: {
          include: { room: true, subroom: true },
        },
        creator: true,
      },
    });

    // Update user allocated hours
    await prisma.user.update({
      where: { id: assignee.id },
      data: {
        currentAllocatedHours: {
          increment: Math.round(input.estimatedHours),
        },
      },
    });

    const fullTask = await this.getTaskById(task.id);

    // Publish Real-Time Domain Events (Organization Scoped)
    publishDomainEvent({
      type: 'TASK_CREATED',
      organizationId: user.organizationId,
      entityId: task.id,
      targetUserId: assignee.id,
      actorId: user.id,
      payload: fullTask,
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
      },
    });

    return fullTask;
  }

  static async updateTaskStatus(idOrDisplayId: string, input: UpdateTaskStatusInput) {
    const task = await prisma.task.findFirst({
      where: {
        OR: [{ id: idOrDisplayId }, { taskIdDisplay: idOrDisplayId }],
      },
    });

    if (!task) {
      throw new Error(`Task ${idOrDisplayId} not found`);
    }

    const updated = await prisma.task.update({
      where: { id: task.id },
      data: {
        status: input.status,
        allocatedHours: input.allocatedHours !== undefined ? input.allocatedHours : task.allocatedHours,
      },
    });

    const fullTask = await this.getTaskById(updated.id);

    // Publish Real-Time Domain Events (Organization Scoped)
    publishDomainEvent({
      type: input.status === TaskStatus.COMPLETED ? 'TASK_COMPLETED' : 'TASK_STATUS_CHANGED',
      organizationId: task.organizationId,
      entityId: task.id,
      targetUserId: task.assigneeId,
      payload: {
        taskId: task.id,
        taskIdDisplay: task.taskIdDisplay,
        previousStatus: task.status,
        newStatus: input.status,
        task: fullTask,
      },
    });

    return fullTask;
  }

  static async addTaskComment(idOrDisplayId: string, input: AddTaskCommentInput, user: AuthUserPayload) {
    const task = await prisma.task.findFirst({
      where: {
        OR: [{ id: idOrDisplayId }, { taskIdDisplay: idOrDisplayId }],
      },
    });

    if (!task) {
      throw new Error(`Task ${idOrDisplayId} not found`);
    }

    const comment = await prisma.taskComment.create({
      data: {
        taskId: task.id,
        authorId: user.id,
        content: input.content,
      },
      include: {
        author: true,
      },
    });

    return {
      id: comment.id,
      authorId: comment.authorId,
      authorName: comment.author.name,
      authorAvatar: comment.author.avatarUrl || undefined,
      content: comment.content,
      createdAt: comment.createdAt.toISOString(),
    };
  }
}
