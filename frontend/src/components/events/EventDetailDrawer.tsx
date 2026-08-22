'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient, ApiError } from '../../lib/api-client';
import { useDomainEvent } from '../../lib/realtime-context';
import { useAuth } from '../../lib/auth-context';
import { OrgEvent, OrgEventAnalytics, OrgEventResponseBreakdown } from '../../types/org-event';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { EventAnalyticsSummary } from './EventAnalyticsSummary';
import { EventFormModal } from './EventFormModal';

interface EventDetailDrawerProps {
  eventId: string | null;
  onClose: () => void;
  onEventChanged?: (event: OrgEvent) => void;
}

const RESPONSE_SECTIONS: Array<{ key: keyof OrgEventResponseBreakdown; label: string; style: string }> = [
  { key: 'ATTENDING', label: 'Attending', style: 'text-emerald-700' },
  { key: 'MAYBE', label: 'Maybe', style: 'text-amber-700' },
  { key: 'NOT_ATTENDING', label: 'Not Attending', style: 'text-rose-700' },
  { key: 'NO_RESPONSE', label: 'No Response', style: 'text-on-surface-variant' },
];

const STATUS_STYLES: Record<OrgEvent['status'], string> = {
  UPCOMING: 'bg-blue-100 text-blue-800',
  LIVE: 'bg-emerald-100 text-emerald-800',
  AWAITING_COMPLETION: 'bg-amber-100 text-amber-800',
  COMPLETED: 'bg-slate-100 text-slate-600',
  CANCELLED: 'bg-rose-100 text-rose-700',
};

const STATUS_LABELS: Record<OrgEvent['status'], string> = {
  UPCOMING: 'Upcoming',
  LIVE: 'Live',
  AWAITING_COMPLETION: 'Awaiting Completion',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

export function EventDetailDrawer({ eventId, onClose, onEventChanged }: EventDetailDrawerProps) {
  const { role } = useAuth();
  const [event, setEvent] = useState<OrgEvent | null>(null);
  const [analytics, setAnalytics] = useState<OrgEventAnalytics | null>(null);
  const [breakdown, setBreakdown] = useState<OrgEventResponseBreakdown | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onEventChangedRef = useRef(onEventChanged);
  useEffect(() => {
    onEventChangedRef.current = onEventChanged;
  });

  const load = useCallback(async (silent = false) => {
    if (!eventId) return;
    if (!silent) setIsLoading(true);
    try {
      const [eventRes, analyticsRes, responsesRes] = await Promise.all([
        apiClient.getEvent(eventId),
        apiClient.getEventAnalytics(eventId),
        apiClient.getEventResponses(eventId),
      ]);
      setEvent(eventRes);
      setAnalytics(analyticsRes);
      setBreakdown(responsesRes);
      onEventChangedRef.current?.(eventRes);
    } catch {
      // Silent refreshes should not blank the panel on a transient failure
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    if (!eventId) {
      setEvent(null);
      setAnalytics(null);
      setBreakdown(null);
      return;
    }
    load(false);
  }, [eventId, load]);

  // Live reconciliation: always re-fetch authoritative analytics rather than
  // trusting/incrementing local counters from the event payload.
  useDomainEvent<{ eventId: string }>(
    ['ORG_EVENT_UPDATED', 'ORG_EVENT_CANCELLED', 'ORG_EVENT_COMPLETED', 'ORG_EVENT_RESPONSE_CHANGED'],
    (domainEvent) => {
      if (eventId && domainEvent.payload?.eventId === eventId) {
        load(true);
      }
    }
  );

  if (!eventId) return null;

  const handleCancel = async () => {
    if (!event || isCancelling) return;
    setIsCancelling(true);
    setError(null);
    try {
      const updated = await apiClient.cancelEvent(event.id);
      setEvent(updated);
      onEventChanged?.(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to cancel event.');
    } finally {
      setIsCancelling(false);
    }
  };

  const handleComplete = async () => {
    if (!event || isCompleting) return;
    setIsCompleting(true);
    setError(null);
    try {
      const updated = await apiClient.completeEvent(event.id);
      setEvent(updated);
      onEventChanged?.(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to mark event as done.');
    } finally {
      setIsCompleting(false);
    }
  };

  const canManage = event && event.status !== 'COMPLETED' && event.status !== 'CANCELLED';
  const canMarkDone =
    canManage &&
    (role === 'SUPER_ADMIN' || role === 'ADMIN') &&
    (event?.status === 'LIVE' || event?.status === 'AWAITING_COMPLETION');

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex justify-end animate-in fade-in duration-200">
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs" onClick={onClose} />

      <aside className="relative w-full max-w-lg bg-surface-bright border-l border-surface-outline shadow-xl h-full flex flex-col z-10 overflow-y-auto">
        <div className="p-4 border-b border-surface-outline bg-surface-container-low flex items-center justify-between sticky top-0 z-20">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[20px]">event_upcoming</span>
            <h2 className="text-sm font-bold text-primary tracking-tight">Event Details & Analytics</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <div className="p-5 space-y-6 flex-1">
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-16 text-xs text-on-surface-variant space-y-3">
              <span className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span>Loading event details...</span>
            </div>
          )}

          {error && (
            <div className="p-2.5 rounded border border-status-blocked bg-rose-50 text-status-blocked text-xs font-medium">
              {error}
            </div>
          )}

          {!isLoading && event && (
            <>
              {/* Identity */}
              <div className="p-4 bg-surface-container-low border border-surface-outline rounded space-y-3">
                <div className="flex items-center justify-between">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${STATUS_STYLES[event.status]}`}>
                    {STATUS_LABELS[event.status]}
                  </span>
                  <span className="text-xs font-mono text-on-surface-variant font-semibold">
                    {event.dateIST} • {event.timeIST}–{event.endTimeIST}
                  </span>
                </div>

                <div>
                  <h3 className="text-base font-bold text-primary">{event.title}</h3>
                  <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">{event.description}</p>
                </div>

                <div className="pt-2 border-t border-surface-outline/60 text-xs text-on-surface-variant">
                  Created by <span className="font-semibold text-primary">{event.createdByName}</span>
                </div>

                {event.status === 'COMPLETED' && event.completedAt && (
                  <div className="text-xs text-on-surface-variant">
                    Marked done on <span className="font-semibold text-primary">{new Date(event.completedAt).toLocaleString()}</span>
                  </div>
                )}

                {canManage && (
                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-surface-outline/60">
                    <Button variant="outline" size="sm" onClick={() => setIsEditOpen(true)}>
                      Edit Event
                    </Button>
                    {canMarkDone && (
                      <Button variant="primary" size="sm" onClick={handleComplete} isLoading={isCompleting}>
                        Mark as Done
                      </Button>
                    )}
                    <Button variant="danger" size="sm" onClick={handleCancel} isLoading={isCancelling}>
                      Cancel Event
                    </Button>
                  </div>
                )}
              </div>

              {/* Analytics */}
              {analytics && (
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[16px] text-secondary">analytics</span>
                    <span>Attendance Analytics</span>
                  </h4>
                  <EventAnalyticsSummary analytics={analytics} />
                </div>
              )}

              {/* Response Breakdown */}
              {breakdown && (
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[16px] text-secondary">groups</span>
                    <span>Response Breakdown</span>
                  </h4>

                  <div className="space-y-4">
                    {RESPONSE_SECTIONS.map((section) => (
                      <div key={section.key} className="space-y-1.5">
                        <div className={`text-[11px] font-bold uppercase tracking-wider ${section.style}`}>
                          {section.label} ({breakdown[section.key].length})
                        </div>
                        {breakdown[section.key].length === 0 ? (
                          <p className="text-[11px] text-on-surface-variant pl-1">No one in this group.</p>
                        ) : (
                          <div className="space-y-1">
                            {breakdown[section.key].map((u) => (
                              <div
                                key={u.id}
                                className="flex items-center gap-2 p-1.5 rounded border border-surface-outline bg-surface-bright text-xs"
                              >
                                <Avatar src={u.avatarUrl} name={u.name} size="sm" />
                                <span className="font-medium text-on-surface">{u.name}</span>
                                <span className="text-[10px] text-on-surface-variant ml-auto font-mono">{u.role || ''}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </aside>

      <EventFormModal
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        event={event}
        onSaved={(updated) => {
          setEvent(updated);
          onEventChanged?.(updated);
        }}
      />
    </div>
  );
}
