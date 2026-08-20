export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'SERVER' | 'MEMBER';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatarUrl?: string;
  room?: string; // e.g. 'Room B'
  subroom?: string; // e.g. 'B3'
  title?: string; // e.g. 'Frontend Engineer', 'Team Lead'
  status: 'ONLINE' | 'OFFLINE' | 'BUSY' | 'AWAY';
  capacityLimitHours: number;
  currentAllocatedHours: number;
}

export interface AuthSession {
  user: User;
  token?: string;
  isAuthenticated: boolean;
}
