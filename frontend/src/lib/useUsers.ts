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
  limit?: number;
  offset?: number;
}

export const USERS_QUERY_KEY_PREFIX = 'users' as const;

export function userQueryKey(filters: UserFilters = {}) {
  return [USERS_QUERY_KEY_PREFIX, filters] as const;
}

const USER_EVENT_TYPES: DomainEventType[] = [
  'EMPLOYEE_UPDATED',
  'EMPLOYEE_APPROVED',
  'EMPLOYEE_SUSPENDED',
  'EMPLOYEE_DEACTIVATED',
  'ROLE_CHANGED',
  'ACCOUNT_STATUS_CHANGED',
  'AVAILABILITY_CHANGED',
  'PRESENCE_CHANGED',
  'ROOM_ASSIGNMENT_CHANGED',
  'LOCATION_CHANGED',
  'EMPLOYEE_CHECKED_IN',
  'EMPLOYEE_CHECKED_OUT',
  'ATTENDANCE_UPDATED',
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
