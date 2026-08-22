'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { apiClient } from '../../lib/api-client';
import { useDomainEvent } from '../../lib/realtime-context';
import { OrgEvent, OrgEventAnalytics, OrgEventStatus } from '../../types/org-event';
import { Button } from '../ui/Button';
import { EventFormModal } from './EventFormModal';
import { EventDetailDrawer } from './EventDetailDrawer';
import { EventAnalyticsSummary } from './EventAnalyticsSummary';

const TABS: OrgEventStatus[] = ['UPCOMING', 'LIVE', 'AWAITING_COMPLETION', 'COMPLETED', 'CANCELLED'];

const STATUS_STYLES: Record<OrgEventStatus, string> = {
  UPCOMING: 'bg-blue-100 text-blue-800',
  LIVE: 'bg-emerald-100 text-emerald-800',
  AWAITING_COMPLETION: 'bg-amber-100 text-amber-800',
  COMPLETED: 'bg-slate-100 text-slate-600',
  CANCELLED: 'bg-rose-100 text-rose-700',
};

const STATUS_LABELS: Record<OrgEventStatus, string> = {
  UPCOMING: 'Upcoming',
  LIVE: 'Live',
  AWAITING_COMPLETION: 'Awaiting Completion',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

const REFRESH_INTERVAL_MS = 60000;

export function EventsManagementView() {
  const [events, setEvents] = useState<OrgEvent[]>([]);
  const [analyticsByEvent, setAnalyticsByEvent] = useState<Record<string, OrgEventAnalytics>>({});
  const [tab, setTab] = useState<OrgEventStatus>('UPCOMING');
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  const fetchEvents = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const data = await apiClient.getEvents();
      if (Array.isArray(data)) {
        setEvents(data);
        const analyticsEntries = await Promise.all(
          data.map(async (e) => {
            try {
              const a = await apiClient.getEventAnalytics(e.id);
              return [e.id, a] as const;
            } catch {
              return null;
            }
          })
        );
        setAnalyticsByEvent(
          Object.fromEntries(analyticsEntries.filter((entry): entry is [string, OrgEventAnalytics] => entry !== null))
        );
      }
    } catch {
      // Clean fallback
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Silent background refresh — no full-page spinner on live updates from other clients
  useDomainEvent(
    ['ORG_EVENT_CREATED', 'ORG_EVENT_UPDATED', 'ORG_EVENT_CANCELLED', 'ORG_EVENT_COMPLETED', 'ORG_EVENT_RESPONSE_CHANGED'],
    () => {
      fetchEvents(true);
    }
  );

  // Light periodic refresh so purely time-based transitions (Upcoming→Live→Awaiting
  // Completion) eventually show without a manual reload — the backend recomputes
  // status fresh on every fetch, this just triggers that fetch on a bounded interval.
  useEffect(() => {
    const interval = setInterval(() => fetchEvents(true), REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchEvents]);

  const filtered = events.filter((e) => e.status === tab);
  const tabCounts = TABS.reduce<Record<OrgEventStatus, number>>((acc, t) => {
    acc[t] = events.filter((e) => e.status === t).length;
    return acc;
  }, {} as Record<OrgEventStatus, number>);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-surface-outline pb-4">
        <div>
          <h1 className="text-xl font-bold text-primary tracking-tight">Organization Events</h1>
          <p className="text-xs text-on-surface-variant mt-1">
            Schedule events, poll attendance, and review live analytics across the organization.
          </p>
        </div>

        <Button
          variant="primary"
          size="md"
          onClick={() => setIsCreateOpen(true)}
          leftIcon={<span className="material-symbols-outlined text-[16px]">add</span>}
        >
          New Event
        </Button>
      </div>

      {/* Status Tabs */}
      <div className="flex items-center gap-2 border-b border-surface-outline">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`pb-2 px-3 text-xs font-semibold uppercase tracking-wider transition-all border-b-2 flex items-center gap-1.5 ${
              tab === t ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <span>{STATUS_LABELS[t]}</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-surface-container text-on-surface-variant">
              {tabCounts[t]}
            </span>
          </button>
        ))}
      </div>

      {/* Event List */}
      <div className="space-y-4">
        {isLoading ? (
          <p className="text-xs text-on-surface-variant text-center py-8">Loading events...</p>
        ) : filtered.length === 0 ? (
          <div className="p-8 border border-surface-outline rounded bg-surface-container-low text-center text-xs text-on-surface-variant">
            No {STATUS_LABELS[tab].toLowerCase()} events.
          </div>
        ) : (
          filtered.map((e) => (
            <div
              key={e.id}
              onClick={() => setSelectedEventId(e.id)}
              className="bg-surface-bright border border-surface-outline rounded p-5 space-y-3 cursor-pointer hover:border-primary/50 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${STATUS_STYLES[e.status]}`}>
                      {STATUS_LABELS[e.status]}
                    </span>
                    <span className="text-[11px] font-mono text-on-surface-variant">
                      {e.dateIST} • {e.timeIST}–{e.endTimeIST}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-primary">{e.title}</h3>
                  <p className="text-xs text-on-surface-variant mt-0.5">Created by {e.createdByName}</p>
                </div>
                <span className="material-symbols-outlined text-on-surface-variant text-[18px]">chevron_right</span>
              </div>

              {analyticsByEvent[e.id] && <EventAnalyticsSummary analytics={analyticsByEvent[e.id]} compact />}
            </div>
          ))
        )}
      </div>

      <EventFormModal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} onSaved={() => fetchEvents(true)} />

      <EventDetailDrawer
        eventId={selectedEventId}
        onClose={() => setSelectedEventId(null)}
        onEventChanged={() => fetchEvents(true)}
      />
    </div>
  );
}
