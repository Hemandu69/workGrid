'use client';

import React from 'react';
import { AppShell } from '../../../components/layout/AppShell';
import { RoomOverviewGrid } from '../../../components/rooms/RoomOverviewGrid';
import { MOCK_ROOMS } from '../../../lib/mock-data';

export default function AdminRoomsPage() {
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
            Rooms & Subrooms Topology (Sectors A–H)
          </h1>
          <p className="text-xs text-on-surface-variant mt-1">
            Monitor real-time capacity and occupancy across all 64 subrooms. Default capacity is 2 members + 1 lead server per subroom.
          </p>
        </div>

        {/* Room Topology Grid */}
        <RoomOverviewGrid rooms={MOCK_ROOMS} selectedRoomLetter="B" />
      </div>
    </AppShell>
  );
}
