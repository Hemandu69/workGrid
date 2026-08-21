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
import { ActiveEventBanner } from '../../../components/operations/ActiveEventBanner';
import { PersonAvailabilityDrawer } from '../../../components/availability/PersonAvailabilityDrawer';
import { EventDetailDrawer } from '../../../components/operations/EventDetailDrawer';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';

export default function AdminOperationsPage() {
  const { user, role } = useAuth();
  const [gridData, setGridData] = useState<OperationalGridResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isResettingSim, setIsResettingSim] = useState(false);

  // Filters State
  const [searchQuery, setSearchQuery] = useState('');
  const [presenceFilter, setPresenceFilter] = useState('ALL');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [roomFilter, setRoomFilter] = useState('ALL');

  // Drawers State
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

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
  const fetchGrid = useCallback((showSpinner = true) => {
    const seq = ++fetchSeq.current;
    if (showSpinner) setIsLoading(true);

    const targetRoom = isServer ? serverRoomLetter || 'B' : roomFilter;

    apiClient
      .getOperationalGrid({ room: targetRoom !== 'ALL' ? targetRoom : undefined, search: searchQuery.trim() || undefined })
      .then((res) => {
        if (seq !== fetchSeq.current) return;
        setGridData(res);
        setIsLoading(false);
      })
      .catch(() => {
        if (seq !== fetchSeq.current) return;
        setIsLoading(false);
      });
  }, [isServer, serverRoomLetter, roomFilter, searchQuery]);

  // Keep a stable ref to the latest fetchGrid for real-time event handlers
  const fetchGridRef = useRef(fetchGrid);
  useEffect(() => {
    fetchGridRef.current = fetchGrid;
  });

  useEffect(() => {
    fetchGrid(true);
  }, [fetchGrid]);

  // Real-Time Domain Event Subscription — silently refresh grid on any operational state change
  // (real attendance OR simulated personnel). Uses eventTypeKey stabilization in useDomainEvent.
  useDomainEvent(
    [
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
      // Silent background refresh — no loading spinner flash; keeps current grid visible
      fetchGridRef.current(false);
    }
  );

  const handleToggleSimulated = async (id: string, presenceState?: 'IN' | 'OUT') => {
    try {
      await apiClient.toggleSimulatedPresence(id, presenceState);
      // Silent refresh so KPIs/coverage update immediately even if Socket.IO is briefly delayed
      fetchGrid(false);
    } catch (err) {
      console.error('Failed to toggle simulated presence:', err);
    }
  };

  const handleResetSimulation = async () => {
    try {
      setIsResettingSim(true);
      await apiClient.resetSimulation();
      fetchGrid(false);
    } catch (err) {
      console.error('Failed to reset simulation:', err);
    } finally {
      setIsResettingSim(false);
    }
  };

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
                  ? `Section ${serverRoomLetter} Operational Grid & Server Presence`
                  : 'Enterprise Operational Room Grid & Server Presence'}
              </h1>
              <Badge
                role={isServer ? `Server Oversight (Room ${serverRoomLetter})` : 'Operations Hub'}
                variant="role"
              />
            </div>
            <p className="text-xs text-on-surface-variant">
              {isServer
                ? `Real-time physical presence, room occupancy, and server coverage across Section ${serverRoomLetter} subrooms in IST.`
                : 'Physical & logical 8 × 8 WorkGrid matrix monitoring people, supervisory server locations, and live event coverage in IST.'}
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
              variant="outline"
              size="sm"
              onClick={handleResetSimulation}
              isLoading={isResettingSim}
              leftIcon={<span className="material-symbols-outlined text-[16px]">restart_alt</span>}
              title="Reset simulated test personnel to initial fixture state"
            >
              Reset Simulation
            </Button>

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

        {/* Active Company-Wide Event Banner */}
        {gridData?.activeCompanyEvent && (
          <ActiveEventBanner
            event={gridData.activeCompanyEvent}
            onOpenEvent={(id) => setSelectedEventId(id)}
          />
        )}

        {/* Operational Metrics Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatMetricCard
            label="People Present (IN)"
            value={gridData?.totalPeoplePresent ?? '—'}
            subtext="Verified physical check-in"
            trend="Active in subrooms"
            icon="groups"
            indicatorColor="available"
          />
          <StatMetricCard
            label="Supervisory Servers"
            value={gridData?.totalServersPresent ?? '—'}
            subtext="On-duty server overseers"
            trend="Room supervision"
            icon="shield_person"
            indicatorColor="primary"
          />
          <StatMetricCard
            label="Subrooms Monitored"
            value={gridData?.totalSubrooms ?? '—'}
            subtext="Across active sections"
            trend="100% Online"
            icon="grid_view"
            indicatorColor="available"
          />
          <StatMetricCard
            label="Active Events"
            value={gridData?.activeCompanyEvent ? '1 Global + Room' : 'Normal Operations'}
            subtext="Live supervision active"
            trend="Supervisors Tracked"
            icon="event_available"
            indicatorColor={gridData?.activeCompanyEvent ? 'busy' : 'available'}
          />
        </div>

        {/* Server Coverage Card */}
        {gridData?.rooms && (
          <ServerCoverageCard
            rooms={gridData.rooms}
            onSelectServer={(id) => setSelectedPersonId(id)}
            onToggleSimulated={handleToggleSimulated}
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
              onSelectEvent={(id) => setSelectedEventId(id)}
              onToggleSimulated={handleToggleSimulated}
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
        eventId={selectedEventId}
        onClose={() => setSelectedEventId(null)}
        onSelectPerson={(id) => {
          setSelectedEventId(null);
          setSelectedPersonId(id);
        }}
      />
    </AppShell>
  );
}
