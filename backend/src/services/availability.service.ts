import { prisma } from '../db/client.js';
import { UpdateWeeklyScheduleInput } from '../schemas/availability.schema.js';
import { DayOfWeek, SlotState } from '@prisma/client';

export class AvailabilityService {
  static async getUserAvailability(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error(`User with ID ${userId} not found`);
    }

    const slots = await prisma.availabilitySlot.findMany({
      where: { userId },
      orderBy: [{ day: 'asc' }, { hour: 'asc' }],
    });

    const dayOrder: Record<DayOfWeek, number> = {
      MONDAY: 0,
      TUESDAY: 1,
      WEDNESDAY: 2,
      THURSDAY: 3,
      FRIDAY: 4,
      SATURDAY: 5,
      SUNDAY: 6,
    };

    const daysMap: Record<DayOfWeek, any[]> = {
      MONDAY: [],
      TUESDAY: [],
      WEDNESDAY: [],
      THURSDAY: [],
      FRIDAY: [],
      SATURDAY: [],
      SUNDAY: [],
    };

    for (const slot of slots) {
      daysMap[slot.day].push({
        hour: slot.hour,
        state: slot.state,
        taskId: slot.taskId || undefined,
      });
    }

    // Ensure all 24 hours exist for each day
    const formattedDays = Object.entries(daysMap).map(([dayKey, daySlots]) => {
      const fullHours = Array.from({ length: 24 }, (_, h) => {
        const found = daySlots.find((s) => s.hour === h);
        return found || { hour: h, state: SlotState.UNAVAILABLE };
      });

      return {
        day: dayKey as DayOfWeek,
        slots: fullHours,
      };
    });

    formattedDays.sort((a, b) => dayOrder[a.day] - dayOrder[b.day]);

    const totalAvailableHours = slots.filter(
      (s) => s.state === SlotState.AVAILABLE || s.state === SlotState.PREFERRED
    ).length;

    const allocatedHours = user.currentAllocatedHours;
    const remainingAvailableHours = Math.max(0, totalAvailableHours - allocatedHours);

    return {
      userId: user.id,
      timezone: 'UTC',
      allocatedHours,
      totalCapacityHours: totalAvailableHours || user.capacityLimitHours,
      remainingAvailableHours,
      days: formattedDays,
    };
  }

  static async updateWeeklySchedule(userId: string, input: UpdateWeeklyScheduleInput) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error(`User with ID ${userId} not found`);
    }

    // Transactionally update slots
    await prisma.$transaction(async (tx) => {
      for (const slot of input.slots) {
        await tx.availabilitySlot.upsert({
          where: {
            userId_day_hour: {
              userId,
              day: slot.day,
              hour: slot.hour,
            },
          },
          update: {
            state: slot.state,
            taskId: slot.taskId,
          },
          create: {
            userId,
            day: slot.day,
            hour: slot.hour,
            state: slot.state,
            taskId: slot.taskId,
          },
        });
      }
    });

    return this.getUserAvailability(userId);
  }
}
