import React from 'react';
import { Subroom } from '../../types/room';
import { Badge } from '../ui/Badge';
import { Avatar } from '../ui/Avatar';

interface SubroomCardProps {
  subroom: Subroom;
  onManageCapacity?: (subroom: Subroom) => void;
  isUserSubroom?: boolean;
}

export function SubroomCard({ subroom, onManageCapacity, isUserSubroom }: SubroomCardProps) {
  const isFull = subroom.membersCount >= subroom.memberCapacity;
  const occupancyPercentage = Math.round((subroom.membersCount / subroom.memberCapacity) * 100);

  return (
    <div
      className={`bg-surface-bright border rounded p-4 relative overflow-hidden transition-all flex flex-col justify-between ${
        isUserSubroom
          ? 'border-primary shadow-xs ring-1 ring-primary/20'
          : 'border-surface-outline hover:border-slate-400'
      }`}
    >
      {/* Top Banner */}
      <div className="flex items-center justify-between pb-2 border-b border-surface-outline">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-bold text-primary">{subroom.id}</span>
          {isUserSubroom && (
            <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 bg-primary text-on-primary rounded">
              Your Subroom
            </span>
          )}
        </div>

        <Badge
          status={isFull ? 'BLOCKED' : subroom.membersCount > 0 ? 'AVAILABLE' : 'UNAVAILABLE'}
        >
          {subroom.membersCount}/{subroom.memberCapacity} Members
        </Badge>
      </div>

      {/* Seats Layout (1 Server Lead Seat + Member Seats) */}
      <div className="py-3 space-y-3">
        {/* Server Seat */}
        <div className="p-2 rounded bg-surface-container-low border border-surface-outline flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px] text-secondary">
              military_tech
            </span>
            <div>
              <span className="text-[10px] text-on-surface-variant uppercase font-bold block">
                Server / Team Lead
              </span>
              <span className="font-semibold text-primary">
                {subroom.serverPresent && subroom.serverUser
                  ? subroom.serverUser.name
                  : 'Lead Seat Active'}
              </span>
            </div>
          </div>
          <span className="w-2 h-2 rounded-full bg-status-available" title="Lead Seat Allocated" />
        </div>

        {/* Member Seats */}
        <div>
          <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block mb-1.5">
            Member Capacity ({subroom.membersCount}/{subroom.memberCapacity})
          </span>

          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: subroom.memberCapacity }).map((_, idx) => {
              const member = subroom.members[idx];
              return (
                <div
                  key={idx}
                  className={`p-2 rounded border text-xs flex items-center gap-2 ${
                    member
                      ? 'bg-surface-container-low border-surface-outline'
                      : 'border-dashed border-slate-300 text-outline bg-transparent'
                  }`}
                >
                  {member ? (
                    <>
                      <Avatar src={member.avatarUrl} name={member.name} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-primary truncate text-[11px]">{member.name}</p>
                        <p className="text-[9px] text-on-surface-variant truncate font-mono">
                          {member.currentAllocatedHours}h busy
                        </p>
                      </div>
                    </>
                  ) : (
                    <div className="w-full text-center py-1 text-[10px] font-mono">
                      Seat {idx + 1} Empty
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Footer Controls */}
      <div className="pt-2 border-t border-surface-outline flex items-center justify-between text-[11px] text-on-surface-variant">
        <span className="font-mono">{occupancyPercentage}% Occupied</span>
        {onManageCapacity && (
          <button
            onClick={() => onManageCapacity(subroom)}
            className="text-secondary hover:text-primary font-medium hover:underline text-xs"
          >
            Adjust Capacity
          </button>
        )}
      </div>
    </div>
  );
}
