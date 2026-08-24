'use client';

import React, { useState } from 'react';
import { OrgEvent, EventResponseChoice } from '../../types/org-event';
import { apiClient, ApiError } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';

interface EventCardProps {
  event: OrgEvent;
  onResponseChange?: (event: OrgEvent) => void;
  allowResponse?: boolean;
}

const STATUS_STYLES: Record<OrgEvent['status'], string> = {
  UPCOMING: 'bg-blue-50 text-blue-800 border-blue-200',
  LIVE: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  AWAITING_COMPLETION: 'bg-amber-50 text-amber-800 border-amber-200',
  COMPLETED: 'bg-slate-100 text-slate-600 border-slate-200',
  CANCELLED: 'bg-rose-50 text-rose-700 border-rose-200',
};

const STATUS_LABELS: Record<OrgEvent['status'], string> = {
  UPCOMING: 'Upcoming',
  LIVE: 'Live',
  AWAITING_COMPLETION: 'Awaiting Completion',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

const RESPONSE_OPTIONS: Array<{ value: EventResponseChoice; label: string; activeStyle: string }> = [
  { value: 'ATTENDING', label: 'Attending', activeStyle: 'bg-emerald-600 text-white border-emerald-600' },
  { value: 'MAYBE', label: 'Maybe', activeStyle: 'bg-amber-500 text-white border-amber-500' },
  { value: 'NOT_ATTENDING', label: 'Not Attending', activeStyle: 'bg-rose-600 text-white border-rose-600' },
];

const RESPONSE_LABELS: Record<EventResponseChoice, string> = {
  ATTENDING: 'Attending',
  MAYBE: 'Maybe',
  NOT_ATTENDING: 'Not Attending',
};

export function EventCard({ event, onResponseChange, allowResponse }: EventCardProps) {
  const { role } = useAuth();
  const canRespond = allowResponse !== undefined ? allowResponse : (role !== 'SUPER_ADMIN' && role !== 'ADMIN');

  const [isSaving, setIsSaving] = useState<EventResponseChoice | null>(null);
  const [localEvent, setLocalEvent] = useState(event);
  // Open by default until the user has responded — once they have, the card
  // starts compact so the notification feed stays scannable.
  const [isExpanded, setIsExpanded] = useState(() => event.currentUserResponse == null);

  React.useEffect(() => {
    setLocalEvent(event);
  }, [event]);

  const isOpenForResponses = localEvent.status !== 'CANCELLED' && localEvent.status !== 'COMPLETED';

  const handleRespond = async (response: EventResponseChoice) => {
    if (isSaving || !isOpenForResponses || !canRespond) return;
    setIsSaving(response);
    try {
      await apiClient.updateEventResponse(localEvent.id, response);
      const updated = { ...localEvent, currentUserResponse: response };
      setLocalEvent(updated);
      onResponseChange?.(updated);
      setIsExpanded(false);
    } catch (err) {
      // Keep prior selection visible; a toast/inline error isn't critical for this control
      console.error(err instanceof ApiError ? err.message : 'Failed to save response', err);
    } finally {
      setIsSaving(null);
    }
  };

  // Organizers (SUPER_ADMIN / ADMIN) observe events without participant RSVP controls
  if (!canRespond) {
    return (
      <div className="bg-surface-bright border border-surface-outline rounded p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border bg-secondary-container text-on-secondary-container border-transparent">
              Event
            </span>
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${STATUS_STYLES[localEvent.status]}`}>
              {STATUS_LABELS[localEvent.status]}
            </span>
          </div>
        </div>

        <div>
          <h3 className="text-base font-bold text-primary leading-snug">{localEvent.title}</h3>
          {localEvent.description && (
            <p className="text-xs text-on-surface leading-relaxed mt-2 bg-surface-container-low/60 p-3 rounded border border-surface-outline">
              {localEvent.description}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-on-surface-variant">
          <span className="flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px]">event</span>
            {localEvent.dateIST}
          </span>
          <span className="flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px]">schedule</span>
            {localEvent.timeIST} – {localEvent.endTimeIST}
          </span>
          <span className="flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px]">person</span>
            Created by {localEvent.createdByName}
          </span>
        </div>
      </div>
    );
  }

  // Terminal states (Completed/Cancelled) are always shown as a compact,
  // read-only summary — there's nothing left to change or expand into.
  if (!isOpenForResponses) {
    return (
      <div className="bg-surface-bright border border-surface-outline rounded p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${STATUS_STYLES[localEvent.status]}`}>
                {STATUS_LABELS[localEvent.status]}
              </span>
            </div>
            <h3 className="text-sm font-bold text-primary truncate">{localEvent.title}</h3>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[10px] text-on-surface-variant uppercase tracking-wide">Your response</p>
            <p className="text-xs font-semibold text-primary">
              {localEvent.currentUserResponse ? RESPONSE_LABELS[localEvent.currentUserResponse] : 'No response'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!isExpanded) {
    return (
      <button
        type="button"
        onClick={() => setIsExpanded(true)}
        className="w-full text-left bg-surface-bright border border-surface-outline rounded p-4 hover:border-primary/40 transition-colors"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex items-center gap-2">
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border shrink-0 ${STATUS_STYLES[localEvent.status]}`}>
              {STATUS_LABELS[localEvent.status]}
            </span>
            <h3 className="text-sm font-bold text-primary truncate">{localEvent.title}</h3>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-semibold text-primary">
              Your response: {localEvent.currentUserResponse ? RESPONSE_LABELS[localEvent.currentUserResponse] : '—'}
            </span>
            <span className="material-symbols-outlined text-[18px] text-on-surface-variant">expand_more</span>
          </div>
        </div>
      </button>
    );
  }

  return (
    <div className="bg-surface-bright border border-surface-outline rounded p-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border bg-secondary-container text-on-secondary-container border-transparent">
            Event
          </span>
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${STATUS_STYLES[localEvent.status]}`}>
            {STATUS_LABELS[localEvent.status]}
          </span>
        </div>
        {localEvent.currentUserResponse != null && (
          <button
            type="button"
            onClick={() => setIsExpanded(false)}
            className="flex items-center gap-1 text-xs text-on-surface-variant hover:text-primary"
          >
            Collapse
            <span className="material-symbols-outlined text-[18px]">expand_less</span>
          </button>
        )}
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
          {localEvent.timeIST} – {localEvent.endTimeIST}
        </span>
        <span className="flex items-center gap-1">
          <span className="material-symbols-outlined text-[14px]">person</span>
          Created by {localEvent.createdByName}
        </span>
      </div>

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
    </div>
  );
}
