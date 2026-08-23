'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { PersonAvailabilityDetailResponse, apiClient } from '../../lib/api-client';
import { useDomainEvent } from '../../lib/realtime-context';
import { useAuth } from '../../lib/auth-context';
import { Avatar } from '../ui/Avatar';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { RoomAssignmentModal } from './RoomAssignmentModal';

interface PersonAvailabilityDrawerProps {
  userId: string | null;
  onClose: () => void;
  onSelectTask?: (taskId: string) => void;
}

export function PersonAvailabilityDrawer({
  userId,
  onClose,
  onSelectTask,
}: PersonAvailabilityDrawerProps) {
  const [data, setData] = useState<PersonAvailabilityDetailResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveDuration, setLiveDuration] = useState<string>('');
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  // null = default state (today expanded, others collapsed). Once the viewer
  // clicks any day, that single day stays expanded until they click another.
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const { role: viewerRole } = useAuth();
  const canManageAssignment = viewerRole === 'SUPER_ADMIN' || viewerRole === 'ADMIN';

  // Monotonic fetch counter to prevent stale responses from overwriting newer ones
  const fetchSeq = useRef(0);

  const refreshDrawer = useCallback((silent = false) => {
    if (!userId) return;
    const seq = ++fetchSeq.current;
    if (!silent) {
      setIsLoading(true);
      setError(null);
    }
    apiClient
      .getPersonAvailabilityDetail(userId)
      .then((res) => {
        // Only apply if this is still the latest request
        if (seq === fetchSeq.current) {
          setData(res);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (seq === fetchSeq.current) {
          if (!silent) setError(err instanceof Error ? err.message : 'Failed to fetch person details');
          setIsLoading(false);
        }
      });
  }, [userId]);

  // Real-time synchronization: silently refresh the drawer when the viewed
  // person's presence, location, availability, or room assignment changes.
  useDomainEvent(
    [
      'LOCATION_CHANGED',
      'ROOM_STATUS_CHANGED',
      'ATTENDANCE_UPDATED',
      'EMPLOYEE_CHECKED_IN',
      'EMPLOYEE_CHECKED_OUT',
      'AVAILABILITY_CHANGED',
      'ROOM_ASSIGNMENT_CHANGED',
    ],
    (event) => {
      if (!userId) return;

      const payload = event.payload as { userId?: string | null; personId?: string } | null;

      const matchesViewedPerson =
        payload?.userId === userId ||
        payload?.personId === userId ||
        event.targetUserId === userId ||
        event.entityId === userId;

      const isBroadcast = event.type === 'ROOM_STATUS_CHANGED';

      if (matchesViewedPerson || isBroadcast) {
        refreshDrawer(true);
      }
    }
  );

  useEffect(() => {
    if (!userId) {
      setData(null);
      setIsLoading(false);
      return;
    }
    refreshDrawer(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Live client-side duration timer against authoritative arrivedAt timestamp
  useEffect(() => {
    if (!data?.person) {
      setLiveDuration('');
      return;
    }

    const computeCurrentDuration = () => {
      if (data.person.attendanceState !== 'IN' || !data.person.arrivedAt) {
        setLiveDuration(data.person.currentDurationFormatted || (data.person.attendanceState === 'IN' ? 'Active' : 'Stopped'));
        return;
      }

      const arrivedMs = new Date(data.person.arrivedAt).getTime();
      const diffMs = Math.max(0, Date.now() - arrivedMs);
      const hours = Math.floor(diffMs / 3600000);
      const mins = Math.floor((diffMs % 3600000) / 60000);
      const secs = Math.floor((diffMs % 60000) / 1000);

      if (hours > 0) {
        setLiveDuration(`${hours}h ${mins}m ${secs}s`);
      } else if (mins > 0) {
        setLiveDuration(`${mins}m ${secs}s`);
      } else {
        setLiveDuration(`0m ${secs}s`);
      }
    };

    computeCurrentDuration();
    if (data.person.attendanceState === 'IN') {
      const interval = setInterval(computeCurrentDuration, 1000);
      return () => clearInterval(interval);
    }
  }, [data?.person]);

  if (!userId) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex justify-end animate-in fade-in duration-200">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Drawer Panel */}
      <aside className="relative w-full max-w-lg bg-surface-bright border-l border-surface-outline shadow-xl h-full flex flex-col z-10 overflow-y-auto">
        {/* Header */}
        <div className="p-4 border-b border-surface-outline bg-surface-container-low flex items-center justify-between sticky top-0 z-20">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[20px]">
              person_search
            </span>
            <h2 className="text-sm font-bold text-primary tracking-tight">
              Person Availability & Schedule
            </h2>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors"
            title="Close drawer"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-6 flex-1">
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-16 space-y-3 text-on-surface-variant">
              <span className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-xs font-mono">Loading availability timeline...</p>
            </div>
          )}

          {error && !isLoading && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded text-rose-800 text-xs space-y-2">
              <div className="flex items-center gap-1.5 font-bold">
                <span className="material-symbols-outlined text-[16px]">error</span>
                <span>Error loading person details</span>
              </div>
              <p>{error}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsLoading(true);
                  apiClient
                    .getPersonAvailabilityDetail(userId)
                    .then(setData)
                    .catch((e) => setError(e.message))
                    .finally(() => setIsLoading(false));
                }}
              >
                Retry
              </Button>
            </div>
          )}

          {data && !isLoading && (
            <>
              {/* Person Summary Card */}
              <div className="p-4 bg-surface rounded border border-surface-outline flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <Avatar
                    src={data.person.avatarUrl}
                    name={data.person.name}
                    size="md"
                    status={
                      data.person.status === 'ONLINE'
                        ? 'ONLINE'
                        : data.person.status === 'BUSY'
                        ? 'BUSY'
                        : 'OFFLINE'
                    }
                  />
                  <div>
                    <h3 className="text-base font-bold text-primary leading-snug">
                      {data.person.name}
                    </h3>
                    <p className="text-xs text-on-surface-variant font-mono">{data.person.email}</p>
                    {data.person.title && (
                      <p className="text-xs text-on-surface mt-0.5">{data.person.title}</p>
                    )}
                    <div className="flex items-center gap-1.5 mt-2 text-[11px] font-mono text-on-surface-variant">
                      <span className="material-symbols-outlined text-[14px] text-secondary">
                        meeting_room
                      </span>
                      <span>
                        {data.person.room
                          ? data.person.subroom
                            ? `${data.person.subroom} (${data.person.room})`
                            : data.person.room
                          : 'Unassigned'}
                      </span>
                      {canManageAssignment && (
                        <button
                          type="button"
                          onClick={() => setIsAssignModalOpen(true)}
                          className="ml-1 px-1.5 py-0.2 rounded text-[10px] font-semibold text-secondary hover:text-primary hover:bg-surface-container transition-colors"
                          title="Reassign room"
                        >
                          Reassign
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <Badge role={data.person.role ? data.person.role.replace('_', ' ') : 'UNASSIGNED'} variant="role" />
              </div>

              {/* Attendance & Physical Presence Card */}
              <div className="p-3.5 bg-surface-container-low border border-surface-outline rounded text-xs space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px] text-secondary">
                      sensor_occupied
                    </span>
                    Real-time Presence & Attendance
                  </span>

                  {/* Read-only — attendance belongs to the person themselves. */}
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                      data.person.attendanceState === 'IN'
                        ? 'bg-emerald-600 text-white border-emerald-700'
                        : 'bg-rose-600 text-white border-rose-700'
                    }`}
                  >
                    [ {data.person.attendanceState} ]
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                  <div className="p-2 bg-surface-bright rounded border border-surface-outline">
                    <span className="text-[10px] text-outline uppercase block">Current Location</span>
                    <span className="font-bold text-primary flex items-center gap-1">
                      <span className="material-symbols-outlined text-[13px] text-secondary">location_on</span>
                      {data.person.currentLocation || (data.person.subroom ? `Subroom ${data.person.subroom}` : (data.person.room || 'UNKNOWN'))}
                    </span>
                  </div>

                  <div className="p-2 bg-surface-bright rounded border border-surface-outline">
                    <span className="text-[10px] text-outline uppercase block">
                      {data.person.attendanceState === 'IN' ? 'Arrived At (IST)' : 'Last Check-out / Seen'}
                    </span>
                    <span className="font-bold text-primary">
                      {data.person.attendanceState === 'IN'
                        ? (data.person.arrivedAtIST || '—')
                        : (data.person.leftAtIST || data.person.lastSeenAtIST || '—')}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] font-mono text-on-surface-variant pt-1 border-t border-surface-outline/50">
                  <span>Assigned Section: <strong className="text-primary">{data.person.room || '—'}</strong></span>
                  {data.person.attendanceState === 'IN' ? (
                    <span>Live Duration: <strong className="text-emerald-700 font-semibold">{liveDuration || data.person.currentDurationFormatted || 'Active'}</strong></span>
                  ) : (
                    <span>Last Seen: <strong className="text-primary">{data.person.lastSeenAtIST || 'Earlier Today'}</strong></span>
                  )}
                </div>
              </div>

              {/* Current Status Box — read-only. Live presence belongs to the
                  person themselves; this view only observes it. */}
              <div className="space-y-2">
                <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block">
                  Live Operations Status
                </span>
                <div
                  className={`p-3 rounded border text-xs flex items-center justify-between ${
                    data.currentStatus.state === 'FREE'
                      ? 'bg-status-available-container/30 border-status-available/30 text-emerald-900'
                      : data.currentStatus.state === 'BUSY'
                      ? 'bg-status-busy-container/30 border-status-busy/30 text-amber-900'
                      : data.currentStatus.state === 'MEAL'
                      ? 'bg-blue-50 border-blue-200 text-blue-900'
                      : 'bg-surface-container-low border-surface-outline text-on-surface-variant'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        data.currentStatus.state === 'FREE'
                          ? 'bg-status-available'
                          : data.currentStatus.state === 'BUSY'
                          ? 'bg-status-busy'
                          : data.currentStatus.state === 'MEAL'
                          ? 'bg-blue-500'
                          : 'bg-slate-400'
                      }`}
                    />
                    <div>
                      <span className="font-bold block uppercase tracking-wide text-[11px]">
                        {data.currentStatus.state}
                      </span>
                      <span className="text-[11px] opacity-80">{data.currentStatus.reason}</span>
                    </div>
                  </div>

                  {data.currentStatus.until && (
                    <span className="text-[11px] font-mono font-semibold">
                      Until {data.currentStatus.until}
                    </span>
                  )}
                </div>
              </div>

              {/* Next Free Indicator */}
              <div className="p-3 bg-surface-container-low border border-surface-outline rounded text-xs flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px] text-primary">schedule</span>
                  <div>
                    <span className="text-[10px] text-outline uppercase block">Next Free Window</span>
                    <span className="font-bold text-primary">{data.nextFree.statusText}</span>
                  </div>
                </div>
                <span className="text-[11px] font-mono text-on-surface-variant bg-surface-bright px-2 py-1 rounded border border-surface-outline">
                  {data.nextFree.durationFormatted}
                </span>
              </div>

              {/* 7-Day Weekly Availability Schedule */}
              {data.weeklyTimeline && data.weeklyTimeline.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px] text-secondary">
                        calendar_view_week
                      </span>
                      7-Day Availability Schedule (IST)
                    </span>
                    <span className="text-[10px] font-mono text-outline">Asia/Kolkata (IST)</span>
                  </div>

                  <div className="space-y-2">
                    {data.weeklyTimeline.map((day) => {
                      const isExpanded = expandedDate ? expandedDate === day.date : day.isToday;
                      return (
                      <div
                        key={day.date}
                        className={`p-2.5 rounded border text-xs transition-colors ${
                          day.isToday
                            ? 'bg-surface-bright border-primary/40 ring-1 ring-primary/20'
                            : 'bg-surface-container-low/40 border-surface-outline/60'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setExpandedDate(isExpanded ? 'NONE' : day.date)}
                          className="flex items-center justify-between w-full mb-1.5 text-left"
                        >
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`material-symbols-outlined text-[16px] text-on-surface-variant transition-transform ${
                                isExpanded ? 'rotate-90' : ''
                              }`}
                            >
                              chevron_right
                            </span>
                            <span className="font-bold text-primary text-xs">{day.dayName}</span>
                            {day.isToday && (
                              <span className="px-1.5 py-0.2 bg-primary text-on-primary text-[9px] font-mono font-semibold rounded uppercase">
                                Today
                              </span>
                            )}
                          </div>
                          <span
                            className={`text-[10px] font-mono font-semibold px-1.5 py-0.2 rounded ${
                              day.status === 'FREE'
                                ? 'bg-emerald-100 text-emerald-800'
                                : day.status === 'BUSY'
                                ? 'bg-amber-100 text-amber-800'
                                : day.status === 'PARTIALLY_AVAILABLE'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {day.status}
                          </span>
                        </button>

                        {/* Schedule Windows — merged ranges, shown when expanded */}
                        {isExpanded && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {day.windows.map((win, idx) => (
                            <div
                              key={idx}
                              className={`px-2 py-1 rounded text-[11px] font-mono flex items-center gap-1.5 border ${
                                win.state === 'FREE'
                                  ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                                  : win.state === 'BUSY'
                                  ? 'bg-amber-50 text-amber-900 border-amber-200'
                                  : 'bg-slate-50 text-slate-600 border-slate-200'
                              }`}
                              title={win.reason || win.label}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  win.state === 'FREE'
                                    ? 'bg-emerald-500'
                                    : win.state === 'BUSY'
                                    ? 'bg-amber-500'
                                    : 'bg-slate-400'
                                }`}
                              />
                              <span>
                                {win.startFormatted} – {win.endFormatted}
                              </span>
                            </div>
                          ))}
                        </div>
                        )}
                      </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Upcoming Tasks & Commitments */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px] text-secondary">
                      assignment
                    </span>
                    Assigned Tasks & Commitments
                  </span>
                  <span className="text-[10px] font-mono text-on-surface-variant font-semibold">
                    {data.upcomingCommitments.length} Active
                  </span>
                </div>

                {data.upcomingCommitments.length > 0 ? (
                  <div className="space-y-2">
                    {data.upcomingCommitments.map((task) => (
                      <div
                        key={task.id}
                        onClick={() => onSelectTask?.(task.id)}
                        className="p-3 bg-surface-bright border border-surface-outline rounded text-xs space-y-1.5 hover:border-primary/50 transition-colors cursor-pointer"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-[10px] font-bold text-primary bg-surface-container px-1 rounded">
                              {task.id}
                            </span>
                            <span className="font-semibold text-primary">{task.title}</span>
                          </div>
                          <span
                            className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded uppercase ${
                              task.priority === 'CRITICAL'
                                ? 'bg-rose-100 text-rose-800'
                                : task.priority === 'HIGH'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {task.priority}
                          </span>
                        </div>

                        {task.description && (
                          <p className="text-[11px] text-on-surface-variant line-clamp-2">
                            {task.description}
                          </p>
                        )}

                        <div className="flex items-center justify-between text-[10px] font-mono text-outline pt-1 border-t border-surface-outline/40">
                          <span>Due: {task.dueDateFormatted || 'Flexible'}</span>
                          <span>
                            Allocated: {task.allocatedHours}h / {task.estimatedHours}h
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 bg-surface-container-low border border-surface-outline rounded text-center text-xs text-outline italic">
                    No active tasks assigned
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </aside>

      {data && canManageAssignment && (
        <RoomAssignmentModal
          isOpen={isAssignModalOpen}
          onClose={() => setIsAssignModalOpen(false)}
          personId={userId}
          personName={data.person.name}
          role={data.person.role || 'MEMBER'}
          currentSection={data.person.room?.match(/Section\s+([A-H])/i)?.[1] ?? data.person.room?.match(/Room\s+([A-H])/i)?.[1] ?? null}
          currentSubroom={data.person.subroom ?? null}
          onAssigned={() => refreshDrawer(true)}
        />
      )}
    </div>
  );
}
