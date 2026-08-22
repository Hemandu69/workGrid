'use client';

import React from 'react';

interface OperationsFiltersProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  presenceFilter: string;
  onPresenceFilterChange: (p: string) => void;
  roleFilter: string;
  onRoleFilterChange: (r: string) => void;
  roomFilter: string;
  onRoomFilterChange: (room: string) => void;
  isServer?: boolean;
  serverRoomLetter?: string | null;
}

export function OperationsFilters({
  searchQuery,
  onSearchChange,
  presenceFilter,
  onPresenceFilterChange,
  roleFilter,
  onRoleFilterChange,
  roomFilter,
  onRoomFilterChange,
  isServer,
  serverRoomLetter,
}: OperationsFiltersProps) {
  return (
    <div className="p-3.5 bg-surface-bright border border-surface-outline rounded shadow-2xs flex flex-wrap items-center justify-between gap-3 text-xs">
      {/* Search Input */}
      <div className="flex items-center relative flex-1 min-w-[200px] max-w-md">
        <span className="material-symbols-outlined absolute left-2.5 text-on-surface-variant text-[16px] pointer-events-none">
          search
        </span>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Filter people, servers, subrooms..."
          className="w-full pl-8 pr-3 py-1.5 bg-surface-container-low border border-surface-outline rounded text-xs text-on-surface placeholder:text-outline focus:outline-none focus:border-primary"
        />
      </div>

      {/* Filter Selects */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Presence Filter */}
        <select
          value={presenceFilter}
          onChange={(e) => onPresenceFilterChange(e.target.value)}
          className="px-3 py-1.5 bg-surface-container-low border border-surface-outline rounded text-xs text-on-surface focus:outline-none focus:border-primary"
        >
          <option value="ALL">All Presence States</option>
          <option value="IN">● Present (IN)</option>
          <option value="OUT">○ Outside (OUT)</option>
          <option value="UNKNOWN">? Unknown</option>
        </select>

        {/* Role Filter */}
        <select
          value={roleFilter}
          onChange={(e) => onRoleFilterChange(e.target.value)}
          className="px-3 py-1.5 bg-surface-container-low border border-surface-outline rounded text-xs text-on-surface focus:outline-none focus:border-primary"
        >
          <option value="ALL">All Roles</option>
          <option value="MEMBERS">Members Only</option>
          <option value="SERVERS">Servers Only</option>
        </select>

        {/* Section Filter */}
        {isServer ? (
          <div className="px-3 py-1.5 bg-surface-container-low border border-surface-outline rounded text-xs font-semibold text-primary flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[15px] text-secondary">meeting_room</span>
            <span>Section {serverRoomLetter} (Your Section)</span>
          </div>
        ) : (
          <select
            value={roomFilter}
            onChange={(e) => onRoomFilterChange(e.target.value)}
            className="px-3 py-1.5 bg-surface-container-low border border-surface-outline rounded text-xs text-on-surface focus:outline-none focus:border-primary"
          >
            <option value="ALL">All Sections (A–H)</option>
            <option value="A">Section A</option>
            <option value="B">Section B</option>
            <option value="C">Section C</option>
            <option value="D">Section D</option>
            <option value="E">Section E</option>
            <option value="F">Section F</option>
            <option value="G">Section G</option>
            <option value="H">Section H</option>
          </select>
        )}
      </div>
    </div>
  );
}
