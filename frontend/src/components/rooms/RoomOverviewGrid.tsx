'use client';

import React, { useState } from 'react';
import { Room, Subroom } from '../../types/room';
import { SubroomCard } from './SubroomCard';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';

interface RoomOverviewGridProps {
  rooms: Room[];
  selectedRoomLetter?: string;
  onSelectRoom?: (letter: string) => void;
  userSubroomId?: string;
}

export function RoomOverviewGrid({
  rooms,
  selectedRoomLetter,
  onSelectRoom,
  // No default: the caller's real assignment decides which subroom is
  // highlighted, and an unassigned viewer highlights nothing.
  userSubroomId,
}: RoomOverviewGridProps) {
  const [activeLetter, setActiveLetter] = useState(selectedRoomLetter ?? rooms[0]?.letter ?? '');
  const [editingSubroom, setEditingSubroom] = useState<Subroom | null>(null);
  const [newCapacity, setNewCapacity] = useState('2');
  const [capacityError, setCapacityError] = useState<string | null>(null);

  const activeRoom = rooms.find((r) => r.letter === activeLetter) || rooms[0];

  if (!rooms || rooms.length === 0 || !activeRoom) {
    return (
      <div className="p-8 border border-surface-outline rounded bg-surface-container-low text-center text-xs text-on-surface-variant">
        Loading room and section data...
      </div>
    );
  }

  const handleOpenCapacityModal = (subroom: Subroom) => {
    setEditingSubroom(subroom);
    setNewCapacity(subroom.memberCapacity.toString());
    setCapacityError(null);
  };

  const handleSaveCapacity = () => {
    if (!editingSubroom) return;
    const val = parseInt(newCapacity, 10);

    // Business Rule: Reject capacity reductions below current occupancy
    if (val < editingSubroom.membersCount) {
      setCapacityError(
        `Cannot reduce capacity to ${val}. Current occupancy is ${editingSubroom.membersCount} active members.`
      );
      return;
    }

    editingSubroom.memberCapacity = val;
    setEditingSubroom(null);
  };

  return (
    <div className="space-y-6">
      {/* Room Letter Tabs (A through H) */}
      <div className="flex items-center gap-1.5 p-1.5 bg-surface-bright border border-surface-outline rounded overflow-x-auto">
        {rooms.map((room) => {
          const isActive = room.letter === activeLetter;
          return (
            <button
              key={room.letter}
              onClick={() => {
                setActiveLetter(room.letter);
                onSelectRoom?.(room.letter);
              }}
              className={`flex-1 min-w-[100px] py-2 px-3 rounded text-xs font-semibold flex flex-col items-center transition-all ${
                isActive
                  ? 'bg-primary text-on-primary shadow-xs'
                  : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
              }`}
            >
              <div className="flex items-center gap-1">
                <span>Section {room.letter}</span>
                {room.letter === 'B' && <span className="w-1.5 h-1.5 rounded-full bg-status-available" />}
              </div>
              <span
                className={`text-[10px] font-mono font-normal mt-0.5 ${
                  isActive ? 'text-slate-300' : 'text-outline'
                }`}
              >
                {room.totalMembers}/{room.totalCapacity} ({room.occupancyPercentage}%)
              </span>
            </button>
          );
        })}
      </div>

      {/* Active Room Subrooms Grid (1 through 8) */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-bold text-primary">
              Section {activeRoom.letter} Subrooms (1 through 8)
            </h3>
            <p className="text-xs text-on-surface-variant">
              Lead Server: {activeRoom.leadServer ? activeRoom.leadServer.name : 'Assigned per section'} •
              Total Subrooms: {activeRoom.subrooms.length}
            </p>
          </div>
          <span className="font-mono text-xs text-primary font-semibold">
            {activeRoom.totalMembers} Total Active Members
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {activeRoom.subrooms.map((subroom) => (
            <SubroomCard
              key={subroom.id}
              subroom={subroom}
              isUserSubroom={subroom.id === userSubroomId}
              onManageCapacity={handleOpenCapacityModal}
            />
          ))}
        </div>
      </div>

      {/* Admin Capacity Adjustment Modal */}
      <Modal
        isOpen={!!editingSubroom}
        onClose={() => setEditingSubroom(null)}
        title={`Adjust Member Capacity — ${editingSubroom?.name}`}
        description="Modify maximum concurrent member seats for this subroom. Capacity cannot be reduced below current active occupancy."
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setEditingSubroom(null)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleSaveCapacity}>
              Save Capacity
            </Button>
          </>
        }
      >
        <div className="space-y-4 text-xs">
          <div className="p-3 bg-surface-container-low border border-surface-outline rounded">
            <div className="flex justify-between mb-1">
              <span className="text-on-surface-variant">Current Active Occupancy:</span>
              <span className="font-bold text-primary font-mono">{editingSubroom?.membersCount} Members</span>
            </div>
            <div className="flex justify-between">
              <span className="text-on-surface-variant">Server Lead Seat:</span>
              <span className="font-bold text-emerald-700 font-mono">1 Lead Reserved</span>
            </div>
          </div>

          <Input
            label="New Member Capacity"
            type="number"
            min="1"
            max="10"
            value={newCapacity}
            onChange={(e) => {
              setNewCapacity(e.target.value);
              setCapacityError(null);
            }}
            error={capacityError || undefined}
          />
        </div>
      </Modal>
    </div>
  );
}
