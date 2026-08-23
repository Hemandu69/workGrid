export type DayOfWeek =
  | 'MONDAY'
  | 'TUESDAY'
  | 'WEDNESDAY'
  | 'THURSDAY'
  | 'FRIDAY'
  | 'SATURDAY'
  | 'SUNDAY';

export type SlotState =
  | 'AVAILABLE'
  | 'UNAVAILABLE'
  | 'BUSY'; // task-allocated (has taskId) or user-painted recurring Busy

export interface HourlySlot {
  hour: number; // 0 - 23 (e.g. 9 for 09:00-10:00)
  state: SlotState;
  taskId?: string;
  taskTitle?: string;
}

export interface DayAvailability {
  day: DayOfWeek;
  slots: HourlySlot[];
  availableHoursCount: number;
  busyHoursCount: number;
}

export interface WeeklyAvailabilitySchedule {
  userId: string;
  timezone: string; // e.g. 'UTC', 'America/New_York'
  days: Record<DayOfWeek, HourlySlot[]>;
  totalCapacityHours: number;
  allocatedHours: number;
  remainingAvailableHours: number;
}
