'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../../lib/auth-context';
import { useDomainEvent } from '../../../lib/realtime-context';
import { apiClient, OperationalGridResponse } from '../../../lib/api-client';
import { AppShell } from '../../../components/layout/AppShell';
import { StatMetricCard } from '../../../components/monitoring/StatMetricCard';
import { OperationsFilters } from '../../../components/operations/OperationsFilters';
import { OperationsGrid } from '../../../components/operations/OperationsGrid';
import { ServerCoverageCard } from '../../../components/operations/ServerCoverageCard';
import { PersonAvailabilityDrawer } from '../../../components/availability/PersonAvailabilityDrawer';
import { EventDetailDrawer } from '../../../components/operations/EventDetailDrawer';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';

const OPERATIONS_EVENT_STORAGE_KEY = 'workgrid:operations-grid:selected-event';

function getInitialPersistedEventId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(OPERATIONS_EVENT_STORAGE_KEY);
  } catch {
    return null;
  }
}

function persistEventId(eventId: string | null) {
  if (typeof window === 'undefined') return;
  try {
    if (eventId) {
      localStorage.setItem(OPERATIONS_EVENT_STORAGE_KEY, eventId);
    } else {
      localStorage.removeItem(OPERATIONS_EVENT_STORAGE_KEY);
    }
  } catch {}
}

export default function AdminOperationsPage() {
  const { user, role } = useAuth();
  const [gridData, setGridData] = useState<OperationalGridResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Filters State
  const [searchQuery, setSearchQuery] = useState('');
  const [presenceFilter, setPresenceFilter] = useState('ALL');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [roomFilter, setRoomFilter] = useState('ALL');

  // Drawers State
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [selectedEventDrawerId, setSelectedEventDrawerId] = useState<string | null>(null);

  // Selected Event Context for the Operations Grid (persisted in client storage across navigation)
  const [selectedEventId, setSelectedEventId] = useState<string | null>(getInitialPersistedEventId);

  // Real-Time IST Clock
  const [currentClock, setCurrentClock] = useState<string>('');

  const isServer = role === 'SERVER';
  const serverRoomLetter = user.room ? user.room.replace('Section', '').replace('Room', '').trim() : 'B';
  const isAuthorized = role === 'SUPER_ADMIN' || role === 'ADMIN' || isServer;

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const istString = now.toLocaleTimeString('en-US', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      });
      setCurrentClock(istString);
    };

    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  // Monotonic fetch counter so overlapping real-time refreshes cannot apply stale grid data
  const fetchSeq = useRef(0);

  // fetchGrid: with showSpinner=true for user-initiated, false for real-time background refresh
  const fetchGrid = useCallback(
    (showSpinner = true, overrideEventId?: string | null) => {
      const seq = ++fetchSeq.current;
      if (showSpinner) setIsLoading(true);

      const targetRoom = isServer ? serverRoomLetter || 'B' : roomFilter;
      const targetEventId = overrideEventId !== undefined ? overrideEventId : selectedEventId;

      apiClient
        .getOperationalGrid({
          room: targetRoom !== 'ALL' ? targetRoom : undefined,
          search: searchQuery.trim() || undefined,
          eventId: targetEventId || undefined,
        })
        .then((res) => {
          if (seq !== fetchSeq.current) return;
          setGridData(res);
          // If a targetEventId was supplied, verify it is still a valid active operational event (LIVE/UPCOMING)
          if (targetEventId) {
            const isStillValid = res.availableEvents?.some(
              (e) => e.id === targetEventId && (e.status === 'LIVE' || e.status === 'UPCOMING')
            );
            if (res.selectedEvent && isStillValid) {
              persistEventId(targetEventId);
            } else {
              persistEventId(null);
              setSelectedEventId(null);
            }
          }
          setIsLoading(false);
        })
        .catch(() => {
          if (seq !== fetchSeq.current) return;
          if (targetEventId) {
            persistEventId(null);
            setSelectedEventId(null);
            // Gracefully recover to default unselected grid if event no longer exists
            fetchGrid(false, null);
          }
          setIsLoading(false);
        });
    },
    [isServer, serverRoomLetter, roomFilter, searchQuery, selectedEventId]
  );

  // Keep a stable ref to the latest fetchGrid for real-time event handlers
  const fetchGridRef = useRef(fetchGrid);
  useEffect(() => {
    fetchGridRef.current = fetchGrid;
  });

  useEffect(() => {
    fetchGrid(true);
  }, [fetchGrid]);

  const handleEventChange = (newEventId: string) => {
    const nextId = newEventId === 'ALL' || !newEventId ? null : newEventId;
    setSelectedEventId(nextId);
    persistEventId(nextId);
    fetchGrid(true, nextId);
  };

  // Real-Time Domain Event Subscription — silently refresh grid on any operational or event state change.
  useDomainEvent(
    [
      'ORG_EVENT_CREATED',
      'ORG_EVENT_UPDATED',
      'ORG_EVENT_COMPLETED',
      'ORG_EVENT_CANCELLED',
      'ORG_EVENT_RESPONSE_CHANGED',
      'GRID_UPDATED',
      'EMPLOYEE_CHECKED_IN',
      'EMPLOYEE_CHECKED_OUT',
      'ATTENDANCE_UPDATED',
      'PRESENCE_CHANGED',
      'LOCATION_CHANGED',
      'AVAILABILITY_CHANGED',
      'ROOM_STATUS_CHANGED',
      'SUBROOM_STATUS_CHANGED',
      'ROOM_ASSIGNMENT_CHANGED',
    ],
    () => {
      // Silent background refresh — no loading spinner flash; keeps current grid and selected event visible
      fetchGridRef.current(false);
    }
  );

  if (!isAuthorized) {
    return (
      <AppShell
        breadcrumbs={[
          { label: 'WorkGrid', href: '/' },
          { label: 'Admin', href: '/admin' },
          { label: 'Operations Grid' },
        ]}
      >
        <div className="p-8 text-center bg-surface-bright border border-surface-outline rounded max-w-lg mx-auto space-y-3">
          <span className="material-symbols-outlined text-[36px] text-rose-600">lock</span>
          <h2 className="text-base font-bold text-primary">Access Restricted</h2>
          <p className="text-xs text-on-surface-variant leading-relaxed">
            The Operational Room Grid is strictly reserved for Administrators and Room Servers.
          </p>
        </div>
      </AppShell>
    );
  }

  const selectedEvent = gridData?.selectedEvent;
  const availableEvents = gridData?.availableEvents || [];

  return (
    <AppShell
      breadcrumbs={[
        { label: 'WorkGrid', href: '/' },
        {
          label: isServer ? `Section ${serverRoomLetter} Operations` : 'Admin Operations',
          href: isServer ? '/server' : '/admin',
        },
        { label: 'Operational Room Grid' },
      ]}
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-surface-outline pb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-xl font-bold text-primary tracking-tight">
                {isServer
                  ? `Section ${serverRoomLetter} Operational Grid & Event Oversight`
                  : 'Enterprise Operational Event & Room Grid'}
              </h1>
              <Badge
                role={isServer ? `Server Oversight (Room ${serverRoomLetter})` : 'Operations Hub'}
                variant="role"
              />
            </div>
            <p className="text-xs text-on-surface-variant">
              {isServer
                ? `Real-time physical presence, event attendance responses, and server coverage across Section ${serverRoomLetter} in IST.`
                : 'Event-contextual operational control surface monitoring event attendance, physical presence, and supervisory server coverage in IST.'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {currentClock && (
              <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 bg-surface-container-low border border-surface-outline rounded text-xs font-mono text-primary font-semibold">
                <span className="w-2 h-2 rounded-full bg-status-available animate-pulse" />
                <span>Live IST: {currentClock}</span>
              </div>
            )}

            <Button
              variant="primary"
              size="sm"
              onClick={() => fetchGrid(true)}
              isLoading={isLoading}
              leftIcon={<span className="material-symbols-outlined text-[16px]">refresh</span>}
            >
              Refresh Grid
            </Button>
          </div>
        </div>

        {/* Event Selector & Context Bar */}
        <div className="p-3.5 bg-surface-bright border border-surface-outline rounded shadow-2xs space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className="material-symbols-outlined text-[20px] text-primary">event</span>
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant block">
                  Operating Event Context
                </span>
                <span className="text-xs text-on-surface font-medium">
                  {selectedEvent
                    ? selectedEvent.title
                    : availableEvents.length > 0
                    ? 'No event selected (Showing physical matrix)'
                    : 'No active or upcoming events'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor="event-selector" className="text-xs font-medium text-on-surface-variant">
                Select Event:
              </label>
              {availableEvents.length > 0 ? (
                <select
                  id="event-selector"
                  value={selectedEventId || ''}
                  onChange={(e) => handleEventChange(e.target.value)}
                  className="text-xs bg-surface border border-surface-outline rounded px-3 py-1.5 font-medium text-on-surface focus:outline-none focus:ring-1 focus:ring-primary min-w-[220px]"
                >
                  <option value="">— Select an Event —</option>
                  {availableEvents.map((evt) => (
                    <option key={evt.id} value={evt.id}>
                      {evt.title} ({evt.dateIST} • {evt.status})
                    </option>
                  ))}
                </select>
              ) : (
                <select
                  id="event-selector"
                  disabled
                  className="text-xs bg-surface-container-low border border-surface-outline rounded px-3 py-1.5 font-medium text-on-surface-variant focus:outline-none min-w-[220px] cursor-not-allowed"
                >
                  <option value="">No active or upcoming events</option>
                </select>
              )}
              {selectedEventId && (
                <button
                  onClick={() => handleEventChange('')}
                  className="text-[11px] text-on-surface-variant hover:text-primary underline px-1"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Selected Event Details Banner */}
          {selectedEvent ? (
            <div className="pt-2 border-t border-surface-outline/60 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                    selectedEvent.status === 'LIVE'
                      ? 'bg-emerald-100 text-emerald-800 animate-pulse'
                      : selectedEvent.status === 'UPCOMING'
                      ? 'bg-blue-100 text-blue-800'
                      : selectedEvent.status === 'AWAITING_COMPLETION'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {selectedEvent.status}
                </span>
                <span className="font-semibold text-primary">{selectedEvent.title}</span>
                <span className="text-on-surface-variant text-[11px]">
                  📅 {selectedEvent.dateIST} • ⏰ {selectedEvent.timeIST} – {selectedEvent.endTimeIST} (IST)
                </span>
              </div>

              {selectedEvent.description && (
                <p className="text-[11px] text-on-surface-variant italic w-full">
                  {selectedEvent.description}
                </p>
              )}
            </div>
          ) : availableEvents.length === 0 ? (
            <div className="pt-2 border-t border-surface-outline/60 text-xs text-on-surface-variant flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px] text-on-surface-variant">info</span>
              <span>No active or upcoming events. Create or schedule an event to begin operational monitoring.</span>
            </div>
          ) : (
            <div className="pt-2 border-t border-surface-outline/60 text-xs text-on-surface-variant flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px] text-primary">touch_app</span>
              <span>Select an active or upcoming event from the dropdown above to view event-specific attendance and operational data.</span>
            </div>
          )}
        </div>

        {/* Operational & Event Metrics Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <StatMetricCard
            label="People Present (IN)"
            value={gridData?.totalPeoplePresent ?? '—'}
            subtext="Physical check-in in subrooms"
            trend="Active now"
            icon="groups"
            indicatorColor="available"
          />

          {selectedEvent ? (
            <>
              <StatMetricCard
                label="Event Attendance"
                value={`${selectedEvent.attendingCount} / ${selectedEvent.totalEligible}`}
                subtext="RSVP Attending"
                trend={
                  selectedEvent.totalEligible > 0
                    ? `${Math.round((selectedEvent.attendingCount / selectedEvent.totalEligible) * 100)}% Confirmed`
                    : '—'
                }
                icon="how_to_reg"
                indicatorColor="available"
              />
              <StatMetricCard
                label="Response Breakdown"
                value={`${selectedEvent.maybeCount} Maybe`}
                subtext={`${selectedEvent.notAttendingCount} Declined • ${selectedEvent.noResponseCount} Pending`}
                trend="Event responses"
                icon="poll"
                indicatorColor={selectedEvent.maybeCount > 0 ? 'busy' : 'available'}
              />
            </>
          ) : (
            <>
              <StatMetricCard
                label="Free Now"
                value={gridData?.availabilitySummary.freeCount ?? '—'}
                subtext="Available for assignment"
                trend={gridData ? `of ${gridData.availabilitySummary.totalPeople} tracked` : '—'}
                icon="task_alt"
                indicatorColor="available"
              />
              <StatMetricCard
                label="Busy Now"
                value={gridData?.availabilitySummary.busyCount ?? '—'}
                subtext="On active task"
                trend={
                  gridData
                    ? `${gridData.availabilitySummary.partialCount} partially available`
                    : '—'
                }
                icon="pending_actions"
                indicatorColor="busy"
              />
            </>
          )}

          <StatMetricCard
            label="Supervisory Servers"
            value={gridData?.totalServersPresent ?? '—'}
            subtext="On-duty server overseers"
            trend="Section coverage"
            icon="shield_person"
            indicatorColor="primary"
          />

          <StatMetricCard
            label="Subrooms Monitored"
            value={gridData?.totalSubrooms ?? '—'}
            subtext="Across active sections"
            trend={gridData ? `${gridData.totalRooms} sections` : '—'}
            icon="grid_view"
            indicatorColor="available"
          />

          <StatMetricCard
            label={selectedEvent ? 'Selected Event Status' : 'Event Operating Mode'}
            value={selectedEvent ? selectedEvent.status : 'Select an Event'}
            subtext={selectedEvent ? `${selectedEvent.dateIST} • ${selectedEvent.timeIST}` : 'Choose event above'}
            trend={selectedEvent ? 'Live Context' : 'General Matrix'}
            icon="event_available"
            indicatorColor={selectedEvent ? 'available' : 'busy'}
          />
        </div>

        {/* Server Coverage Card */}
        {gridData?.rooms && (
          <ServerCoverageCard
            rooms={gridData.rooms}
            onSelectServer={(id) => setSelectedPersonId(id)}
          />
        )}

        {/* Filters */}
        <OperationsFilters
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          presenceFilter={presenceFilter}
          onPresenceFilterChange={setPresenceFilter}
          roleFilter={roleFilter}
          onRoleFilterChange={setRoleFilter}
          roomFilter={roomFilter}
          onRoomFilterChange={setRoomFilter}
          isServer={isServer}
          serverRoomLetter={serverRoomLetter}
        />

        {/* Main 8 × 8 Operational Grid */}
        <div className="p-4 bg-surface-bright border border-surface-outline rounded shadow-2xs space-y-3">
          <div className="flex items-center justify-between border-b border-surface-outline pb-2">
            <h3 className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px] text-primary">view_quilt</span>
              <span>WorkGrid Physical & Logical Subroom Matrix (A1 – H8)</span>
            </h3>
            <span className="text-[11px] font-mono text-on-surface-variant">
              Showing {gridData?.rooms.length ?? 0} Sections • All timestamps in IST
            </span>
          </div>

          {gridData && (
            <OperationsGrid
              rooms={gridData.rooms}
              onSelectPerson={(id) => setSelectedPersonId(id)}
              onSelectEvent={(id) => setSelectedEventDrawerId(id)}
              presenceFilter={presenceFilter}
              roleFilter={roleFilter}
            />
          )}
        </div>
      </div>

      {/* Person Availability & Presence Detail Drawer */}
      <PersonAvailabilityDrawer
        userId={selectedPersonId}
        onClose={() => setSelectedPersonId(null)}
      />

      {/* Event Detail & Server Coverage Drawer */}
      <EventDetailDrawer
        eventId={selectedEventDrawerId}
        onClose={() => setSelectedEventDrawerId(null)}
        onSelectPerson={(id) => {
          setSelectedEventDrawerId(null);
          setSelectedPersonId(id);
        }}
      />
    </AppShell>
  );
}
