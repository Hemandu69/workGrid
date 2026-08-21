'use client';

import React from 'react';
import { GridRoomColumn } from '../../lib/api-client';

interface ServerCoverageCardProps {
  rooms: GridRoomColumn[];
  onSelectServer?: (serverId: string) => void;
  onToggleSimulated?: (id: string, presenceState?: 'IN' | 'OUT') => void;
}

export function ServerCoverageCard({ rooms, onSelectServer, onToggleSimulated }: ServerCoverageCardProps) {
  return (
    <div className="p-4 bg-surface-bright border border-surface-outline rounded shadow-2xs space-y-3">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-outline pb-3">
        <div className="flex items-center gap-2">
          <span className="p-1.5 bg-primary-container text-primary rounded flex items-center justify-center">
            <span className="material-symbols-outlined text-[18px]">shield_person</span>
          </span>
          <div>
            <h3 className="text-xs font-bold text-primary uppercase tracking-wider">
              Section Server Presence & Supervisory Positions
            </h3>
            <p className="text-[11px] text-on-surface-variant">
              Section-level supervisors occupying operational positions 1, 3, and 5 (Up to 3 Servers per Section).
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
                  Section {room.letter}
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
                  room.assignedServers.map((srv) => {
                    const isPresent = srv.presenceState === 'IN';
                    return (
                      <div
                        key={srv.id}
                        onClick={() => onSelectServer?.(srv.id)}
                        className="w-full p-1 rounded hover:bg-surface-container flex items-center justify-between text-[11px] transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-1.5 truncate">
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              isPresent
                                ? 'bg-status-available'
                                : srv.presenceState === 'OUT'
                                ? 'bg-status-blocked'
                                : 'bg-slate-400'
                            }`}
                          />
                          <span className="text-on-surface truncate font-medium">{srv.name}</span>
                          {srv.assignedPosition && isPresent && (
                            <span className="px-1 py-0.2 bg-secondary/15 text-secondary text-[9px] font-mono font-bold rounded">
                              Pos {srv.assignedPosition}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="font-mono text-[10px] text-on-surface-variant font-semibold">
                            {isPresent ? `Loc: ${srv.currentLocation}` : srv.presenceState}
                          </span>

                          {/* Simulation Quick Toggle */}
                          {srv.isSimulated && onToggleSimulated && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onToggleSimulated(srv.id, isPresent ? 'OUT' : 'IN');
                              }}
                              className={`px-1 py-0.2 rounded text-[9px] font-mono font-bold transition-all border ${
                                isPresent
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                                  : 'bg-rose-50 text-rose-700 border-rose-300 hover:bg-rose-100'
                              }`}
                              title={`Toggle server test presence (currently ${srv.presenceState})`}
                            >
                              {isPresent ? 'IN' : 'OUT'}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
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
