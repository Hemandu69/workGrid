'use client';

import React from 'react';
import { GridRoomColumn } from '../../lib/api-client';

interface ServerCoverageCardProps {
  rooms: GridRoomColumn[];
  onSelectServer?: (serverId: string) => void;
}

export function ServerCoverageCard({ rooms, onSelectServer }: ServerCoverageCardProps) {
  return (
    <div className="p-4 bg-surface-bright border border-surface-outline rounded shadow-2xs space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-surface-outline pb-2.5">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-secondary text-[20px]">
            shield_person
          </span>
          <div>
            <h3 className="text-xs font-bold text-primary uppercase tracking-wider">
              Room Server Presence & Coverage
            </h3>
            <p className="text-[11px] text-on-surface-variant">
              Room-level supervisors responsible for overseeing rooms and live event coverage (Up to 3 Servers per Sector).
            </p>
          </div>
        </div>
      </div>

      {/* Room Coverage Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {rooms.map((room) => {
          const hasFullCoverage =
            room.serverTotalCount > 0 && room.serverPresenceCount === room.serverTotalCount;
          const hasPartialCoverage =
            room.serverPresenceCount > 0 && room.serverPresenceCount < room.serverTotalCount;

          return (
            <div
              key={room.id}
              className="p-3 bg-surface-container-low border border-surface-outline rounded text-xs space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-primary text-xs">
                  Sector {room.letter}
                </span>
                <span
                  className={`font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                    hasFullCoverage
                      ? 'bg-emerald-100 text-emerald-800'
                      : hasPartialCoverage
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-rose-100 text-rose-800'
                  }`}
                >
                  {room.serverCoverageSummary}
                </span>
              </div>

              {/* Server Items */}
              <div className="space-y-1 pt-1 border-t border-surface-outline/50">
                {room.assignedServers.length > 0 ? (
                  room.assignedServers.map((srv) => (
                    <button
                      key={srv.id}
                      onClick={() => onSelectServer?.(srv.id)}
                      className="w-full text-left p-1 rounded hover:bg-surface-container flex items-center justify-between text-[11px] transition-colors"
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            srv.presenceState === 'IN'
                              ? 'bg-status-available'
                              : srv.presenceState === 'OUT'
                              ? 'bg-status-blocked'
                              : 'bg-slate-400'
                          }`}
                        />
                        <span className="text-on-surface truncate font-medium">{srv.name}</span>
                      </div>
                      <span className="font-mono text-[10px] text-on-surface-variant font-semibold shrink-0">
                        {srv.presenceState === 'IN' ? `Loc: ${srv.currentLocation}` : srv.presenceState}
                      </span>
                    </button>
                  ))
                ) : (
                  <div className="text-[10px] text-outline italic">No servers assigned</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
