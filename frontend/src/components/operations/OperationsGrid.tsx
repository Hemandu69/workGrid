'use client';

import React from 'react';
import { GridRoomColumn } from '../../lib/api-client';
import { OperationsGridCell } from './OperationsGridCell';

interface OperationsGridProps {
  rooms: GridRoomColumn[];
  onSelectPerson: (userId: string) => void;
  onSelectEvent?: (eventId: string) => void;
  presenceFilter: string;
  roleFilter: string;
}

export function OperationsGrid({
  rooms,
  onSelectPerson,
  onSelectEvent,
  presenceFilter,
  roleFilter,
}: OperationsGridProps) {
  if (rooms.length === 0) {
    return (
      <div className="p-12 text-center bg-surface-bright border border-surface-outline rounded text-on-surface-variant space-y-2">
        <span className="material-symbols-outlined text-[32px]">grid_off</span>
        <p className="text-xs font-medium">No room data found for current filter.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 8-Column Responsive Room Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 overflow-x-auto pb-2">
        {rooms.map((room) => (
          <div
            key={room.id}
            className="flex flex-col space-y-2.5 min-w-[140px] bg-surface-container-low/30 p-2 rounded border border-surface-outline"
          >
            {/* Room Column Header */}
            <div className="flex items-center justify-between px-1 pb-1 border-b border-surface-outline">
              <div className="flex items-center gap-1">
                <span className="font-bold text-primary text-xs">Section {room.letter}</span>
              </div>
              <span className="font-mono text-[10px] text-on-surface-variant font-semibold">
                {room.serverPresenceCount}/{room.serverTotalCount} 🛡
              </span>
            </div>

            {/* Subrooms (1 through 8) */}
            <div className="space-y-2">
              {room.subrooms.map((subroom) => (
                <OperationsGridCell
                  key={subroom.id}
                  subroom={subroom}
                  onSelectPerson={onSelectPerson}
                  onSelectEvent={onSelectEvent}
                  presenceFilter={presenceFilter}
                  roleFilter={roleFilter}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
