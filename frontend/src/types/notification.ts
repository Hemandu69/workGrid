export type NotificationType =
  | 'TASK_ASSIGNED'
  | 'TASK_STATUS_CHANGED'
  | 'TASK_COMMENT'
  | 'ANNOUNCEMENT'
  | 'EVENT'
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

/**
 * The server-persisted read state for this user's feed. `read` on an
 * AppNotification is derived from this — a notification is read when its key
 * has an explicit receipt, or when it was created at/before `readAllAt`.
 */
export interface NotificationReadState {
  readKeys: string[];
  readAllAt: string | null;
}
