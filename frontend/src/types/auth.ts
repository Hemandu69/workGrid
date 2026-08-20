export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'HR' | 'TEAM_LEAD' | 'SERVER' | 'MEMBER';

export type AccountStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';

export interface User {
  id: string;
  name: string;
  email: string;
  role?: UserRole | null;
  accountStatus?: AccountStatus;
  avatarUrl?: string;
  room?: string; // e.g. 'Room B'
  subroom?: string; // e.g. 'B3'
  title?: string; // e.g. 'Frontend Engineer', 'Head of People'
  status?: 'ONLINE' | 'OFFLINE' | 'BUSY' | 'AWAY';
  capacityLimitHours?: number;
  currentAllocatedHours?: number;
  createdAt?: string;
}

export interface AuthSession {
  user: User;
  token?: string;
  isAuthenticated: boolean;
}

export interface RoleAuditLog {
  id: string;
  targetUserId: string;
  targetUserName: string;
  targetUserEmail: string;
  targetUserAvatar?: string;
  changedById: string;
  changedByName: string;
  changedByRole: UserRole;
  previousRole?: UserRole | null;
  newRole: UserRole;
  reason?: string;
  createdAt: string;
}

