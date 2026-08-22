'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './api-client';
import { useDomainEvent, DomainEventType } from './realtime-context';
import { Room } from '../types/room';

export const ROOMS_QUERY_KEY = ['rooms'] as const;

const ROOM_EVENT_TYPES: DomainEventType[] = ['ROOM_STATUS_CHANGED', 'SUBROOM_STATUS_CHANGED', 'ROOM_ASSIGNMENT_CHANGED'];

function useRoomRealtimeSync() {
  const queryClient = useQueryClient();
  useDomainEvent(ROOM_EVENT_TYPES, () => {
    queryClient.invalidateQueries({ queryKey: ROOMS_QUERY_KEY });
  });
}

export function useRooms() {
  useRoomRealtimeSync();
  return useQuery<Room[]>({
    queryKey: ROOMS_QUERY_KEY,
    queryFn: () => apiClient.getRooms(),
  });
}
