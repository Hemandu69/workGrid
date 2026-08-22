export type TaskStatus =
  | 'DRAFT'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'BLOCKED'
  | 'SUBMITTED'
  | 'COMPLETED'
  | 'CANCELLED';

export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface TaskComment {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  content: string;
  createdAt: string;
}

export interface TaskHistoryEntry {
  id: string;
  action: string;
  changedById?: string;
  changedByName: string;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface Task {
  id: string;
  dbId?: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  progress: number;
  assigneeId: string;
  assigneeName: string;
  assigneeAvatar?: string;
  assigneeSubroom: string; // e.g. 'B3'
  assigneeRoom: string; // e.g. 'Room B'
  assigneeRoomId?: string;
  creatorId: string;
  creatorName: string;
  estimatedHours: number;
  allocatedHours: number;
  dueDate: string;
  createdAt: string;
  completedAt?: string;
  campaignId?: string;
  campaignTitle?: string;
  tags?: string[];
  commentsCount: number;
  comments?: TaskComment[];
  history?: TaskHistoryEntry[];
  dependencies?: string[];
}

export interface TaskAnalytics {
  totalTasks: number;
  byStatus: Record<TaskStatus, number>;
  overdueCount: number;
  completionRate: number;
  averageCompletionHours: number;
  tasksPerPerson: Array<{
    assigneeId: string;
    assigneeName: string;
    totalTasks: number;
    completedTasks: number;
  }>;
}

export interface TaskCampaign {
  id: string;
  title: string;
  description: string;
  priority: TaskPriority;
  targetRole?: string;
  targetRoom?: string;
  tasksCount: number;
  completedCount: number;
  createdAt: string;
  dueDate: string;
}
