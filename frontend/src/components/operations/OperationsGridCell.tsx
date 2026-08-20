'use client';

import React from 'react';
import { GridSubroomCell } from '../../lib/api-client';
import { Avatar } from '../ui/Avatar';

interface OperationsGridCellProps {
  subroom: GridSubroomCell;
  onSelectPerson: (userId: string) => void;
  onSelectEvent?: (eventId: string) => void;
  presenceFilter: string;
  roleFilter: string;
}

export function OperationsGridCell({
  subroom,
  onSelectPerson,
  onSelectEvent,
  presenceFilter,
  roleFilter,
}: OperationsGridCellProps) {
  // Filter members based on filter state
  const filteredMembers = subroom.members.filter((m) => {
    if (presenceFilter !== 'ALL' && m.presenceState !== presenceFilter) return false;
    if (roleFilter === 'SERVERS') return false;
    return true;
  });

  const filteredServers = subroom.serversPresent.filter((s) => {
    if (presenceFilter !== 'ALL' && s.presenceState !== presenceFilter) return false;
    if (roleFilter === 'MEMBERS') return false;
    return true;
  });

  const hasEvent = Boolean(subroom.activeRoomEvent);

  return (
    <div
      className={`p-2.5 rounded border transition-all text-xs flex flex-col justify-between min-h-[140px] ${
        hasEvent
          ? 'bg-blue-50/50 border-blue-300 ring-1 ring-blue-400/20 shadow-xs'
          : subroom.occupancyCount > 0
          ? 'bg-surface-bright border-surface-outline hover:border-primary/40 shadow-2xs'
          : 'bg-surface-container-low/40 border-surface-outline/60'
      }`}
    >
      {/* Header: Subroom Code + Badges */}
      <div className="flex items-center justify-between gap-1 pb-1.5 border-b border-surface-outline/50">
        <span className="font-mono font-bold text-primary text-xs tracking-tight">
          {subroom.code}
        </span>

        <div className="flex items-center gap-1">
          {hasEvent && (
            <button
              onClick={() => onSelectEvent?.(subroom.activeRoomEvent!.id)}
              className="px-1.5 py-0.2 bg-blue-600 text-white rounded text-[9px] font-bold uppercase tracking-wider flex items-center gap-0.5 hover:bg-blue-700 transition-colors"
              title={`Live Event: ${subroom.activeRoomEvent?.title}`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              <span>Event</span>
            </button>
          )}

          <span
            className={`font-mono text-[10px] tabular-nums font-semibold px-1 rounded ${
              subroom.occupancyCount >= subroom.memberCapacity
                ? 'bg-amber-100 text-amber-800'
                : subroom.occupancyCount > 0
                ? 'bg-emerald-100 text-emerald-800'
                : 'text-outline'
            }`}
          >
            {subroom.occupancyCount}/{subroom.memberCapacity}
          </span>
        </div>
      </div>

      {/* Body: Members list */}
      <div className="space-y-1.5 my-1.5 flex-1 overflow-y-auto max-h-[120px]">
        {/* Occupying Members */}
        {filteredMembers.length > 0 ? (
          <div className="space-y-1">
            {filteredMembers.map((member) => (
              <button
                key={member.id}
                onClick={() => onSelectPerson(member.id)}
                className="w-full text-left p-1 rounded hover:bg-surface-container flex items-center justify-between gap-1.5 transition-colors group"
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <div className="relative shrink-0">
                    <Avatar src={member.avatarUrl} name={member.name} size="sm" />
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-white ${
                        member.presenceState === 'IN'
                          ? 'bg-status-available'
                          : member.presenceState === 'OUT'
                          ? 'bg-status-blocked'
                          : 'bg-slate-400'
                      }`}
                      title={`Presence: ${member.presenceLabel}`}
                    />
                  </div>
                  <span className="truncate text-[11px] font-medium text-on-surface group-hover:text-primary">
                    {member.name.split(' ')[0]}
                  </span>
                </div>

                {member.activeTaskId && (
                  <span className="font-mono text-[9px] text-on-surface-variant bg-surface-container px-1 rounded truncate max-w-[50px]">
                    {member.activeTaskId}
                  </span>
                )}
              </button>
            ))}
          </div>
        ) : (
          <div className="text-[10px] text-outline text-center py-2 italic">
            No active members
          </div>
        )}

        {/* Supervisory Servers Present in this Subroom */}
        {filteredServers.length > 0 && (
          <div className="pt-1.5 border-t border-surface-outline/50 space-y-1">
            <div className="text-[9px] font-bold uppercase tracking-wider text-secondary flex items-center gap-1">
              <span className="material-symbols-outlined text-[11px]">shield_person</span>
              <span>Server Present</span>
            </div>
            {filteredServers.map((srv) => (
              <button
                key={srv.id}
                onClick={() => onSelectPerson(srv.id)}
                className="w-full text-left p-1 rounded bg-secondary-container/40 border border-secondary/20 hover:bg-secondary-container flex items-center justify-between gap-1 transition-colors"
              >
                <span className="text-[11px] font-semibold text-secondary-dim truncate">
                  {srv.name.split(' ')[0]}
                </span>
                <span className="w-1.5 h-1.5 rounded-full bg-status-available animate-pulse" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Footer: Live Event Summary if present */}
      {subroom.activeRoomEvent && (
        <div className="pt-1 border-t border-blue-200/60 text-[9px] font-mono text-blue-900 truncate">
          {subroom.activeRoomEvent.title}
        </div>
      )}
    </div>
  );
}
