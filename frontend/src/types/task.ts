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

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId: string;
  assigneeName: string;
  assigneeAvatar?: string;
  assigneeSubroom: string; // e.g. 'B3'
  assigneeRoom: string; // e.g. 'Room B'
  creatorId: string;
  creatorName: string;
  estimatedHours: number;
  allocatedHours: number;
  dueDate: string;
  createdAt: string;
  campaignId?: string;
  campaignTitle?: string;
  tags?: string[];
  commentsCount: number;
  comments?: TaskComment[];
  dependencies?: string[];
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
