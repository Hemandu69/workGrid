'use client';

import React, { useState } from 'react';
import { WeeklyAvailabilitySchedule, DayOfWeek, SlotState } from '../../types/availability';
import { Button } from '../ui/Button';

interface AvailabilityGridProps {
  initialSchedule: WeeklyAvailabilitySchedule;
  onSave?: (schedule: WeeklyAvailabilitySchedule) => Promise<void>;
  readOnly?: boolean;
}

const DAYS: Array<{ key: DayOfWeek; label: string; short: string }> = [
  { key: 'MONDAY', label: 'Monday', short: 'Mon' },
  { key: 'TUESDAY', label: 'Tuesday', short: 'Tue' },
  { key: 'WEDNESDAY', label: 'Wednesday', short: 'Wed' },
  { key: 'THURSDAY', label: 'Thursday', short: 'Thu' },
  { key: 'FRIDAY', label: 'Friday', short: 'Fri' },
  { key: 'SATURDAY', label: 'Saturday', short: 'Sat' },
  { key: 'SUNDAY', label: 'Sunday', short: 'Sun' },
];

const DISPLAY_HOURS = Array.from({ length: 14 }, (_, i) => i + 7); // 07:00 to 20:00

export function AvailabilityGrid({
  initialSchedule,
  onSave,
  readOnly = false,
}: AvailabilityGridProps) {
  const [schedule, setSchedule] = useState<WeeklyAvailabilitySchedule>(initialSchedule);
  const [selectedToolState, setSelectedToolState] = useState<SlotState>('AVAILABLE');
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const toggleSlot = (day: DayOfWeek, hour: number) => {
    if (readOnly) return;

    const currentSlot = schedule.days[day].find((s) => s.hour === hour);
    if (!currentSlot || currentSlot.state === 'BUSY') return; // Cannot override active task assignments without Admin overload

    const nextState: SlotState = currentSlot.state === selectedToolState ? 'UNAVAILABLE' : selectedToolState;

    const updatedDays = {
      ...schedule.days,
      [day]: schedule.days[day].map((s) =>
        s.hour === hour ? { ...s, state: nextState } : s
      ),
    };

    // Recompute total available hours
    let availableCount = 0;
    Object.values(updatedDays).forEach((slots) => {
      slots.forEach((s) => {
        if (s.state === 'AVAILABLE' || s.state === 'PREFERRED') {
          availableCount++;
        }
      });
    });

    setSchedule({
      ...schedule,
      days: updatedDays,
      totalCapacityHours: availableCount,
      remainingAvailableHours: Math.max(0, availableCount - schedule.allocatedHours),
    });
    setHasChanges(true);
  };

  const getSlotStyle = (state: SlotState) => {
    switch (state) {
      case 'AVAILABLE':
        return 'bg-emerald-100 hover:bg-emerald-200 border-emerald-300 text-emerald-800 font-medium';
      case 'PREFERRED':
        return 'bg-purple-100 hover:bg-purple-200 border-purple-300 text-purple-800 font-medium';
      case 'BUSY':
        return 'bg-amber-200 border-amber-400 text-amber-900 font-semibold cursor-not-allowed';
      case 'UNAVAILABLE':
      default:
        return 'bg-surface-container-low hover:bg-surface-container border-surface-outline text-outline';
    }
  };

  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      await onSave?.(schedule);
      setHasChanges(false);
    } catch {
      // Leave hasChanges=true so the Save button stays visible and the
      // user's edits are never lost — the parent surfaces the error.
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Interactive Toolbar & Capacity Summary */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-surface-bright border border-surface-outline rounded shadow-xs">
        {/* State Paint Selector */}
        {!readOnly && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-on-surface uppercase tracking-wider mr-1">
              Select Paint Mode:
            </span>
            <button
              type="button"
              onClick={() => setSelectedToolState('AVAILABLE')}
              className={`px-3 py-1 rounded text-xs font-medium border transition-all ${
                selectedToolState === 'AVAILABLE'
                  ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                  : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
              }`}
            >
              Available
            </button>
            <button
              type="button"
              onClick={() => setSelectedToolState('PREFERRED')}
              className={`px-3 py-1 rounded text-xs font-medium border transition-all ${
                selectedToolState === 'PREFERRED'
                  ? 'bg-purple-600 text-white border-purple-700 shadow-xs'
                  : 'bg-purple-50 text-purple-800 border-purple-200 hover:bg-purple-100'
              }`}
            >
              Preferred
            </button>
            <button
              type="button"
              onClick={() => setSelectedToolState('UNAVAILABLE')}
              className={`px-3 py-1 rounded text-xs font-medium border transition-all ${
                selectedToolState === 'UNAVAILABLE'
                  ? 'bg-slate-700 text-white border-slate-800 shadow-xs'
                  : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
              }`}
            >
              Unavailable
            </button>
          </div>
        )}

        {/* Capacity Metrics */}
        <div className="flex items-center gap-4 text-xs tabular-nums">
          <div className="flex items-center gap-1.5">
            <span className="text-on-surface-variant">Allocated Tasks:</span>
            <span className="font-semibold text-primary font-mono">{schedule.allocatedHours}h</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-on-surface-variant">Total Available:</span>
            <span className="font-semibold text-emerald-700 font-mono">{schedule.totalCapacityHours}h</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-on-surface-variant">Remaining Free:</span>
            <span className="font-bold text-primary font-mono">{schedule.remainingAvailableHours}h</span>
          </div>
        </div>

        {hasChanges && (
          <Button size="sm" variant="primary" onClick={handleSave} isLoading={isSaving} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save Schedule'}
          </Button>
        )}
      </div>

      {/* 7-Day Matrix Table */}
      <div className="overflow-x-auto border border-surface-outline rounded bg-surface-bright">
        <table className="w-full text-center text-xs border-collapse">
          <thead>
            <tr className="bg-surface-container-low border-b border-surface-outline text-on-surface select-none">
              <th className="py-2.5 px-3 font-semibold text-left w-24 uppercase tracking-wider text-[11px] text-on-surface-variant">
                Day
              </th>
              {DISPLAY_HOURS.map((hour) => (
                <th
                  key={hour}
                  className="py-2 px-1 font-mono text-[11px] text-on-surface-variant border-l border-surface-outline font-normal"
                >
                  {hour.toString().padStart(2, '0')}:00
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DAYS.map(({ key, label }) => {
              const daySlots = schedule.days[key] || [];

              return (
                <tr key={key} className="border-b border-surface-outline">
                  <td className="py-2 px-3 font-semibold text-left text-xs text-primary bg-surface-container-low/40 whitespace-nowrap">
                    {label}
                  </td>
                  {DISPLAY_HOURS.map((hour) => {
                    const slot = daySlots.find((s) => s.hour === hour) || {
                      hour,
                      state: 'UNAVAILABLE',
                    };

                    return (
                      <td
                        key={hour}
                        onClick={() => toggleSlot(key, hour)}
                        className={`p-1 border-l border-surface-outline transition-colors select-none ${
                          readOnly ? '' : 'cursor-pointer'
                        }`}
                        title={`${label} ${hour}:00 - ${slot.state}${
                          slot.taskTitle ? ` (${slot.taskTitle})` : ''
                        }`}
                      >
                        <div
                          className={`h-7 rounded-xs border flex items-center justify-center text-[10px] tabular-nums transition-all ${getSlotStyle(
                            slot.state
                          )}`}
                        >
                          {slot.state === 'BUSY' ? 'BUSY' : slot.state === 'PREFERRED' ? '★' : ''}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-6 p-3 bg-surface-container-low border border-surface-outline rounded text-xs text-on-surface-variant">
        <span className="font-semibold text-primary text-[11px] uppercase tracking-wider">Legend:</span>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-xs bg-emerald-200 border border-emerald-400" />
          <span>Available Slot</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-xs bg-purple-200 border border-purple-400" />
          <span>Preferred Slot</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-xs bg-amber-200 border border-amber-400" />
          <span>Busy (Task Allocated)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-xs bg-slate-200 border border-slate-300" />
          <span>Unavailable</span>
        </div>
        <span className="ml-auto font-mono text-[10px] text-outline">
          Timezone: {schedule.timezone} (Evaluated UTC)
        </span>
      </div>
    </div>
  );
}
