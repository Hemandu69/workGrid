export type NotificationType =
  | 'TASK_ASSIGNED'
  | 'TASK_STATUS_CHANGED'
  | 'TASK_COMMENT'
  | 'ANNOUNCEMENT'
  | 'CAPACITY_WARNING'
  | 'ROOM_CHANGE';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  link?: string;
  priority?: 'NORMAL' | 'HIGH' | 'URGENT';
}
