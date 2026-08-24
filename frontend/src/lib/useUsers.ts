'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './api-client';
import { useDomainEvent, DomainEventType } from './realtime-context';
import { User } from '../types/auth';
import { PaginatedResult } from '../types/pagination';

export interface UserFilters {
  role?: string;
  status?: string;
  search?: string;
  teamId?: string;
  limit?: number;
  offset?: number;
}

export const USERS_QUERY_KEY_PREFIX = 'users' as const;

export function userQueryKey(filters: UserFilters = {}) {
  return [USERS_QUERY_KEY_PREFIX, filters] as const;
}

// AVAILABILITY_CHANGED is deliberately excluded: it's now delivered only to
// admins, the affected user's own sessions, and the SERVER(s) overseeing
// their room (never broadcast org-wide, to avoid leaking one member's
// availability to unrelated peers) — so subscribing here would almost never
// fire for the MEMBER/TEAM_LEAD peer lists this hook backs. Those lists
// pick up availability changes on next navigation/refetch instead.
const USER_EVENT_TYPES: DomainEventType[] = [
  'EMPLOYEE_UPDATED',
  'EMPLOYEE_APPROVED',
  'EMPLOYEE_SUSPENDED',
  'EMPLOYEE_DEACTIVATED',
  'ROLE_CHANGED',
  'ACCOUNT_STATUS_CHANGED',
  'PRESENCE_CHANGED',
  'ROOM_ASSIGNMENT_CHANGED',
  'LOCATION_CHANGED',
  'EMPLOYEE_CHECKED_IN',
  'EMPLOYEE_CHECKED_OUT',
  'ATTENDANCE_UPDATED',
  'TEAM_EVENT_PLACEMENT_CHANGED',
];

function useUserRealtimeSync() {
  const queryClient = useQueryClient();
  useDomainEvent(USER_EVENT_TYPES, () => {
    queryClient.invalidateQueries({ queryKey: [USERS_QUERY_KEY_PREFIX] });
  });
}

export function useUsers(filters: UserFilters = {}) {
  useUserRealtimeSync();
  return useQuery<PaginatedResult<User>>({
    queryKey: userQueryKey(filters),
    queryFn: () => apiClient.getUsers(filters),
  });
}
