'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './api-client';
import { useDomainEvent, DomainEventType } from './realtime-context';
import { Announcement } from '../types/announcement';
import { PaginatedResult } from '../types/pagination';

export interface AnnouncementFilters {
  status?: string;
  scope?: string;
  limit?: number;
  offset?: number;
}

export const ANNOUNCEMENTS_QUERY_KEY_PREFIX = 'announcements' as const;

export function announcementQueryKey(filters: AnnouncementFilters = {}) {
  return [ANNOUNCEMENTS_QUERY_KEY_PREFIX, filters] as const;
}

const ANNOUNCEMENT_EVENT_TYPES: DomainEventType[] = ['ANNOUNCEMENT_CREATED'];

function useAnnouncementRealtimeSync() {
  const queryClient = useQueryClient();
  useDomainEvent(ANNOUNCEMENT_EVENT_TYPES, () => {
    queryClient.invalidateQueries({ queryKey: [ANNOUNCEMENTS_QUERY_KEY_PREFIX] });
  });
}

export function useAnnouncements(filters: AnnouncementFilters = {}) {
  useAnnouncementRealtimeSync();
  return useQuery<PaginatedResult<Announcement>>({
    queryKey: announcementQueryKey(filters),
    queryFn: () => apiClient.getAnnouncements(filters),
  });
}
