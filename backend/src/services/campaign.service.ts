import { prisma } from '../db/client.js';
import { CreateTaskCampaignInput } from '../schemas/task.schema.js';
import { AuthUserPayload } from '../plugins/auth.js';
import { TaskStatus } from '@prisma/client';

export class CampaignService {
  static async getCampaigns(organizationId?: string) {
    const campaigns = await prisma.taskCampaign.findMany({
      where: organizationId ? { organizationId } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        tasks: {
          select: { status: true },
        },
      },
    });

    return campaigns.map((c) => {
      const completedCount = c.tasks.filter((t) => t.status === TaskStatus.COMPLETED).length;
      return {
        id: c.id,
        title: c.title,
        description: c.description || '',
        priority: c.priority,
        targetRoom: c.targetRoom || undefined,
        tasksCount: c.tasks.length,
        completedCount,
        dueDate: c.dueDate ? c.dueDate.toISOString() : new Date().toISOString(),
        createdAt: c.createdAt.toISOString(),
      };
    });
  }

  static async createCampaign(input: CreateTaskCampaignInput, user: AuthUserPayload) {
    const campaign = await prisma.taskCampaign.create({
      data: {
        organizationId: user.organizationId,
        title: input.title,
        description: input.description,
        priority: input.priority,
        targetRoom: input.targetRoom,
        dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
        createdById: user.id,
      },
      include: {
        tasks: true,
      },
    });

    return {
      id: campaign.id,
      title: campaign.title,
      description: campaign.description || '',
      priority: campaign.priority,
      targetRoom: campaign.targetRoom || undefined,
      tasksCount: 0,
      completedCount: 0,
      dueDate: campaign.dueDate ? campaign.dueDate.toISOString() : new Date().toISOString(),
      createdAt: campaign.createdAt.toISOString(),
    };
  }
}
