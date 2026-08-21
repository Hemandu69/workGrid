'use client';

import React, { useState } from 'react';
import { OrgEvent, EventResponseChoice } from '../../types/org-event';
import { apiClient, ApiError } from '../../lib/api-client';

interface EventCardProps {
  event: OrgEvent;
  onResponseChange?: (event: OrgEvent) => void;
}

const STATUS_STYLES: Record<OrgEvent['status'], string> = {
  UPCOMING: 'bg-blue-50 text-blue-800 border-blue-200',
  LIVE: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  COMPLETED: 'bg-slate-100 text-slate-600 border-slate-200',
  CANCELLED: 'bg-rose-50 text-rose-700 border-rose-200',
};

const RESPONSE_OPTIONS: Array<{ value: EventResponseChoice; label: string; activeStyle: string }> = [
  { value: 'ATTENDING', label: 'Attending', activeStyle: 'bg-emerald-600 text-white border-emerald-600' },
  { value: 'MAYBE', label: 'Maybe', activeStyle: 'bg-amber-500 text-white border-amber-500' },
  { value: 'NOT_ATTENDING', label: 'Not Attending', activeStyle: 'bg-rose-600 text-white border-rose-600' },
];

export function EventCard({ event, onResponseChange }: EventCardProps) {
  const [isSaving, setIsSaving] = useState<EventResponseChoice | null>(null);
  const [localEvent, setLocalEvent] = useState(event);

  React.useEffect(() => {
    setLocalEvent(event);
  }, [event]);

  const handleRespond = async (response: EventResponseChoice) => {
    if (isSaving || localEvent.status === 'CANCELLED') return;
    setIsSaving(response);
    try {
      await apiClient.updateEventResponse(localEvent.id, response);
      const updated = { ...localEvent, currentUserResponse: response };
      setLocalEvent(updated);
      onResponseChange?.(updated);
    } catch (err) {
      // Keep prior selection visible; a toast/inline error isn't critical for this control
      console.error(err instanceof ApiError ? err.message : 'Failed to save response', err);
    } finally {
      setIsSaving(null);
    }
  };

  return (
    <div className="bg-surface-bright border border-surface-outline rounded p-5 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border bg-secondary-container text-on-secondary-container border-transparent">
          Event
        </span>
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${STATUS_STYLES[localEvent.status]}`}>
          {localEvent.status}
        </span>
      </div>

      <div>
        <h3 className="text-base font-bold text-primary leading-snug">{localEvent.title}</h3>
        <p className="text-xs text-on-surface leading-relaxed mt-2 bg-surface-container-low/60 p-3 rounded border border-surface-outline">
          {localEvent.description}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-on-surface-variant">
        <span className="flex items-center gap-1">
          <span className="material-symbols-outlined text-[14px]">event</span>
          {localEvent.dateIST}
        </span>
        <span className="flex items-center gap-1">
          <span className="material-symbols-outlined text-[14px]">schedule</span>
          {localEvent.timeIST}
        </span>
        <span className="flex items-center gap-1">
          <span className="material-symbols-outlined text-[14px]">person</span>
          Created by {localEvent.createdByName}
        </span>
      </div>

      {localEvent.status !== 'CANCELLED' ? (
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-surface-outline">
          {RESPONSE_OPTIONS.map((opt) => {
            const isActive = localEvent.currentUserResponse === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleRespond(opt.value)}
                disabled={isSaving !== null}
                className={`px-3 py-1.5 rounded text-xs font-semibold border transition-all disabled:opacity-60 ${
                  isActive ? opt.activeStyle : 'bg-surface-bright text-on-surface border-surface-outline hover:bg-surface-container'
                }`}
              >
                {isSaving === opt.value ? 'Saving…' : opt.label}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="pt-2 border-t border-surface-outline text-xs text-rose-700 font-medium">
          This event has been cancelled.
        </div>
      )}
    </div>
  );
}
