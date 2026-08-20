import { prisma } from '../db/client.js';
import { RoomService } from './room.service.js';
import { TaskStatus } from '@prisma/client';

export class DashboardService {
  static async getSummary(organizationId?: string) {
    const [
      totalUsers,
      roomsData,
      tasks,
      campaignsCount,
      announcementsCount,
    ] = await Promise.all([
      prisma.user.count({ where: organizationId ? { organizationId } : undefined }),
      RoomService.getAllRooms(organizationId),
      prisma.task.findMany({
        where: organizationId ? { organizationId } : undefined,
        select: {
          status: true,
          priority: true,
          dueDate: true,
        },
      }),
      prisma.taskCampaign.count({ where: organizationId ? { organizationId } : undefined }),
      prisma.announcement.count({ where: organizationId ? { organizationId } : undefined }),
    ]);

    const totalSubroomCapacity = roomsData.reduce((acc, r) => acc + r.totalCapacity, 0);
    const totalRoomMembers = roomsData.reduce((acc, r) => acc + r.totalMembers, 0);
    const globalSaturationPercentage =
      totalSubroomCapacity > 0 ? Math.round((totalRoomMembers / totalSubroomCapacity) * 100) : 0;

    const inProgressTasks = tasks.filter((t) => t.status === TaskStatus.IN_PROGRESS).length;
    const assignedTasks = tasks.filter((t) => t.status === TaskStatus.ASSIGNED).length;
    const submittedTasks = tasks.filter((t) => t.status === TaskStatus.SUBMITTED).length;
    const completedTasks = tasks.filter((t) => t.status === TaskStatus.COMPLETED).length;
    const blockedTasks = tasks.filter((t) => t.status === TaskStatus.BLOCKED).length;

    // Compute overdue risk percentage
    const now = new Date();
    const overdueOrAtRisk = tasks.filter(
      (t) =>
        t.status !== TaskStatus.COMPLETED &&
        t.status !== TaskStatus.CANCELLED &&
        ((t.dueDate && t.dueDate < now) || t.status === TaskStatus.BLOCKED)
    ).length;

    const overdueRiskPercentage = tasks.length > 0 ? Math.round((overdueOrAtRisk / tasks.length) * 100) : 0;

    return {
      organizationScale: totalUsers || 2048,
      totalMembers: totalRoomMembers,
      totalCapacity: totalSubroomCapacity,
      globalSaturationPercentage,
      activeTasks: tasks.length,
      tasksBreakdown: {
        inProgress: inProgressTasks,
        assigned: assignedTasks,
        submitted: submittedTasks,
        completed: completedTasks,
        blocked: blockedTasks,
      },
      activeCampaigns: campaignsCount,
      announcementsCount,
      overdueRiskPercentage,
      sectorBreakdown: roomsData.map((r) => ({
        letter: r.letter,
        name: r.name,
        totalMembers: r.totalMembers,
        totalCapacity: r.totalCapacity,
        occupancyPercentage: r.occupancyPercentage,
      })),
    };
  }
}
