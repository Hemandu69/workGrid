'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '../../../components/layout/AppShell';
import { EventCard } from '../../../components/events/EventCard';
import { apiClient } from '../../../lib/api-client';
import { useDomainEvent } from '../../../lib/realtime-context';
import { OrgEvent } from '../../../types/org-event';

type FilterTab = 'ACTIVE' | 'PAST';

function isActiveStatus(status: OrgEvent['status']): boolean {
  return status === 'UPCOMING' || status === 'LIVE' || status === 'AWAITING_COMPLETION';
}

/**
 * A person's future plans are expressed as event attendance, never as a
 * generic hourly slot — this page is the member-facing home for exactly
 * that: "am I attending this event?", not "am I free at 2pm on Tuesday?"
 * Every event carries its own date/time; that's informational context for
 * the event, not an availability window to paint.
 */
export default function MemberEventsPage() {
  const [events, setEvents] = useState<OrgEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [tab, setTab] = useState<FilterTab>('ACTIVE');

  const fetchEvents = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const data = await apiClient.getEvents();
      if (Array.isArray(data)) setEvents(data);
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

  const filtered = useMemo(() => {
    const active = events.filter((e) => isActiveStatus(e.status));
    const past = events.filter((e) => !isActiveStatus(e.status));
    const list = tab === 'ACTIVE' ? active : past;
    return [...list].sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
  }, [events, tab]);

  // Grouped by calendar date (IST) so the page reads as "this date → these
  // events", matching the actual mental model — never a week/month grid.
  const grouped = useMemo(() => {
    const groups: Array<{ dateIST: string; events: OrgEvent[] }> = [];
    for (const event of filtered) {
      const last = groups[groups.length - 1];
      if (last && last.dateIST === event.dateIST) {
        last.events.push(event);
      } else {
        groups.push({ dateIST: event.dateIST, events: [event] });
      }
    }
    return groups;
  }, [filtered]);

  const activeCount = events.filter((e) => isActiveStatus(e.status)).length;
  const pastCount = events.length - activeCount;

  return (
    <AppShell
      breadcrumbs={[
        { label: 'WorkGrid', href: '/' },
        { label: 'Member Workspace', href: '/member' },
        { label: 'Event Attendance' },
      ]}
    >
      <div className="space-y-6 max-w-3xl mx-auto">
        {/* Header */}
        <div className="border-b border-surface-outline pb-4">
          <h1 className="text-xl font-bold text-primary tracking-tight">Event Attendance</h1>
          <p className="text-xs text-on-surface-variant mt-1">
            Respond ATTENDING, MAYBE, or NOT ATTENDING to each event you&apos;re invited to — your response belongs
            to that specific event only, never to the date in general.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2 border-b border-surface-outline">
          {(
            [
              { key: 'ACTIVE' as const, label: 'Upcoming & Live', count: activeCount },
              { key: 'PAST' as const, label: 'Past', count: pastCount },
            ]
          ).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`pb-2 px-3 text-xs font-semibold uppercase tracking-wider transition-all border-b-2 flex items-center gap-1.5 ${
                tab === t.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <span>{t.label}</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-surface-container text-on-surface-variant">
                {t.count}
              </span>
            </button>
          ))}
        </div>

        {/* Event Feed, grouped by date */}
        {isLoading ? (
          <p className="text-xs text-on-surface-variant text-center py-12">Loading events...</p>
        ) : grouped.length === 0 ? (
          <div className="p-8 border border-surface-outline rounded bg-surface-container-low text-center text-xs text-on-surface-variant">
            {tab === 'ACTIVE' ? 'No upcoming or live events right now.' : 'No past events yet.'}
          </div>
        ) : (
          <div className="space-y-6">
            {grouped.map((group) => (
              <section key={group.dateIST} className="space-y-3">
                <h2 className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[14px] text-primary">event</span>
                  {group.dateIST}
                </h2>
                <div className="space-y-3">
                  {group.events.map((event) => (
                    <EventCard
                      key={event.id}
                      event={event}
                      onResponseChange={(updated) =>
                        setEvents((prev) => prev.map((e) => (e.id === updated.id ? updated : e)))
                      }
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
