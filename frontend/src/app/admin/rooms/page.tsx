'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { AppShell } from '../../../components/layout/AppShell';
import { RoomOverviewGrid } from '../../../components/rooms/RoomOverviewGrid';
import { Room } from '../../../types/room';
import { apiClient } from '../../../lib/api-client';
import { useDomainEvent } from '../../../lib/realtime-context';

export default function AdminRoomsPage() {
  const [rooms, setRooms] = useState<Room[]>([]);

  const fetchRooms = useCallback(async () => {
    try {
      const data = await apiClient.getRooms();
      if (data && Array.isArray(data)) {
        setRooms(data);
      }
    } catch {
      // Fallback
    }
  }, []);

  useEffect(() => {
    fetchRooms();
  }, [fetchRooms]);

  // Real-Time Room & Subroom Domain Events
  useDomainEvent(
    ['ROOM_STATUS_CHANGED', 'SUBROOM_STATUS_CHANGED', 'ROOM_ASSIGNMENT_CHANGED', 'LOCATION_CHANGED'],
    () => {
      fetchRooms();
    }
  );

  return (
    <AppShell
      breadcrumbs={[
        { label: 'WorkGrid', href: '/' },
        { label: 'Admin Operations', href: '/admin' },
        { label: 'Room & Subroom Management' },
      ]}
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="border-b border-surface-outline pb-4">
          <h1 className="text-xl font-bold text-primary tracking-tight">
            Rooms & Subrooms Topology (Sections A–H)
          </h1>
          <p className="text-xs text-on-surface-variant mt-1">
            Monitor real-time capacity and occupancy across all 64 subrooms. Default capacity is 2 members + 1 lead server per subroom.
          </p>
        </div>

        {/* Room Topology Grid */}
        <RoomOverviewGrid rooms={rooms} selectedRoomLetter="B" />
      </div>
    </AppShell>
  );
}
