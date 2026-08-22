'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './api-client';
import { useDomainEvent, DomainEventType } from './realtime-context';
import { Task } from '../types/task';
import { PaginatedResult } from '../types/pagination';

export interface TaskFilters {
  status?: string;
  priority?: string;
  assigneeId?: string;
  roomLetter?: string;
  campaignId?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export const TASKS_QUERY_KEY_PREFIX = 'tasks' as const;

export function taskQueryKey(filters: TaskFilters = {}) {
  return [TASKS_QUERY_KEY_PREFIX, filters] as const;
}

const TASK_EVENT_TYPES: DomainEventType[] = [
  'TASK_CREATED',
  'TASK_ASSIGNED',
  'TASK_REASSIGNED',
  'TASK_UPDATED',
  'TASK_COMPLETED',
  'TASK_CANCELLED',
  'TASK_STATUS_CHANGED',
  'TASK_PROGRESS_CHANGED',
];

/**
 * Subscribes to every TASK_* domain event and invalidates the shared
 * ['tasks', ...] query cache so React Query refetches in the background —
 * existing data stays visible while refetching (isFetching, not isLoading),
 * so a task changing elsewhere never blanks or full-page-spinners any page
 * currently showing a task list. Safe to call from multiple concurrently
 * mounted useTasks() consumers — the underlying invalidate/refetch is
 * de-duplicated per query key by React Query itself.
 */
function useTaskRealtimeSync() {
  const queryClient = useQueryClient();
  useDomainEvent(TASK_EVENT_TYPES, () => {
    queryClient.invalidateQueries({ queryKey: [TASKS_QUERY_KEY_PREFIX] });
  });
}

export function useTasks(filters: TaskFilters = {}) {
  useTaskRealtimeSync();
  return useQuery<PaginatedResult<Task>>({
    queryKey: taskQueryKey(filters),
    queryFn: () => apiClient.getTasks(filters),
  });
}
