'use client';

import React, { useEffect, useState } from 'react';
import { PersonAvailabilityDetailResponse, apiClient } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import { Avatar } from '../ui/Avatar';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { MOCK_USERS, MOCK_ROOM_B_MEMBERS } from '../../lib/mock-data';

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
  const { token } = useAuth();
  const [data, setData] = useState<PersonAvailabilityDetailResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setData(null);
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    setError(null);

    apiClient
      .getPersonAvailabilityDetail(userId, undefined, token)
      .then((res) => {
        if (isMounted) {
          setData(res);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          const all = [
            MOCK_USERS.superAdmin,
            MOCK_USERS.admin,
            MOCK_USERS.server,
            ...MOCK_ROOM_B_MEMBERS,
          ];
          const matchedUser = all.find((u) => u.id === userId) || all[0];

          setData({
            person: {
                id: matchedUser.id,
                name: matchedUser.name,
                email: matchedUser.email,
                role: matchedUser.role,
                status: matchedUser.status,
                avatarUrl: matchedUser.avatarUrl,
                title: matchedUser.title,
                room: matchedUser.room ? `Sector ${matchedUser.room}` : undefined,
                subroom: matchedUser.subroom,
                capacityLimitHours: 40,
                currentAllocatedHours: 24,
              },
              currentStatus: {
                state: matchedUser.status === 'BUSY' ? 'BUSY' : 'FREE',
                reason: matchedUser.status === 'BUSY' ? 'Active Task: TSK-8421 (Design System Migration)' : (matchedUser.subroom ? `In Subroom ${matchedUser.subroom}` : 'Scheduled Available'),
                room: matchedUser.room,
                subroom: matchedUser.subroom,
                until: '04:30 PM UTC',
              },
              nextFree: {
                isCurrentlyFree: matchedUser.status !== 'BUSY',
                statusText: matchedUser.status === 'BUSY' ? 'Today at 04:30 PM UTC' : 'Available until 06:00 PM UTC',
                nextFreeDate: 'Today',
                nextFreeTime: '04:30 PM UTC',
                durationFormatted: 'Available for 1h 30m',
              },
              weeklyTimeline: [
                {
                  date: '2026-08-20',
                  dayName: 'Thu 20',
                  dayOfWeek: 'THURSDAY',
                  isToday: true,
                  status: 'PARTIALLY_AVAILABLE',
                  windows: [
                    { startHour: 9, endHour: 12, startFormatted: '09:00 AM', endFormatted: '12:00 PM', state: 'FREE', label: 'Free / Available' },
                    { startHour: 12, endHour: 16, startFormatted: '12:00 PM', endFormatted: '04:30 PM', state: 'BUSY', label: 'Busy (TSK-8421)' },
                    { startHour: 16, endHour: 18, startFormatted: '04:30 PM', endFormatted: '06:00 PM', state: 'FREE', label: 'Free / Available' },
                  ],
                },
                {
                  date: '2026-08-21',
                  dayName: 'Fri 21',
                  dayOfWeek: 'FRIDAY',
                  isToday: false,
                  status: 'FREE',
                  windows: [
                    { startHour: 9, endHour: 17, startFormatted: '09:00 AM', endFormatted: '05:00 PM', state: 'FREE', label: 'Free / Available' },
                  ],
                },
                {
                  date: '2026-08-22',
                  dayName: 'Sat 22',
                  dayOfWeek: 'SATURDAY',
                  isToday: false,
                  status: 'UNAVAILABLE',
                  windows: [
                    { startHour: 0, endHour: 24, startFormatted: '12:00 AM', endFormatted: '12:00 AM', state: 'UNAVAILABLE', label: 'Off-schedule' },
                  ],
                },
                {
                  date: '2026-08-23',
                  dayName: 'Sun 23',
                  dayOfWeek: 'SUNDAY',
                  isToday: false,
                  status: 'UNAVAILABLE',
                  windows: [
                    { startHour: 0, endHour: 24, startFormatted: '12:00 AM', endFormatted: '12:00 AM', state: 'UNAVAILABLE', label: 'Off-schedule' },
                  ],
                },
                {
                  date: '2026-08-24',
                  dayName: 'Mon 24',
                  dayOfWeek: 'MONDAY',
                  isToday: false,
                  status: 'FREE',
                  windows: [
                    { startHour: 10, endHour: 18, startFormatted: '10:00 AM', endFormatted: '06:00 PM', state: 'FREE', label: 'Free / Available' },
                  ],
                },
                {
                  date: '2026-08-25',
                  dayName: 'Tue 25',
                  dayOfWeek: 'TUESDAY',
                  isToday: false,
                  status: 'PARTIALLY_AVAILABLE',
                  windows: [
                    { startHour: 9, endHour: 13, startFormatted: '09:00 AM', endFormatted: '01:00 PM', state: 'FREE', label: 'Free / Available' },
                    { startHour: 13, endHour: 17, startFormatted: '01:00 PM', endFormatted: '05:00 PM', state: 'BUSY', label: 'Busy (Room B3)' },
                  ],
                },
                {
                  date: '2026-08-26',
                  dayName: 'Wed 26',
                  dayOfWeek: 'WEDNESDAY',
                  isToday: false,
                  status: 'FREE',
                  windows: [
                    { startHour: 10, endHour: 16, startFormatted: '10:00 AM', endFormatted: '04:00 PM', state: 'FREE', label: 'Free / Available' },
                  ],
                },
              ],
              upcomingCommitments: [
                {
                  id: 'TSK-8421',
                  title: 'Design System Migration & Audit',
                  status: 'IN_PROGRESS',
                  priority: 'HIGH',
                  estimatedHours: 12,
                  allocatedHours: 8,
                  dueDateFormatted: 'Aug 21',
                  room: matchedUser.room || 'Sector B',
                  subroom: matchedUser.subroom || 'B3',
                },
              ],
            });
            setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [userId, token]);

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
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-6 flex-1">
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-16 text-xs text-on-surface-variant space-y-3">
              <span className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span>Calculating 7-day availability matrix...</span>
            </div>
          )}

          {error && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded text-xs text-rose-800 space-y-2">
              <div className="font-semibold flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px]">error</span>
                Error Loading Schedule
              </div>
              <p>{error}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsLoading(true);
                  apiClient
                    .getPersonAvailabilityDetail(userId, undefined, token)
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
                    {data.person.room && (
                      <div className="flex items-center gap-1.5 mt-2 text-[11px] font-mono text-on-surface-variant">
                        <span className="material-symbols-outlined text-[14px] text-secondary">
                          meeting_room
                        </span>
                        <span>
                          {data.person.subroom ? `${data.person.subroom} (${data.person.room})` : data.person.room}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <Badge role={data.person.role.replace('_', ' ')} variant="role" />
              </div>

              {/* Current Status Box */}
              <div className="space-y-2">
                <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block">
                  Current Status
                </span>
                <div className="p-3.5 bg-surface-container-low border border-surface-outline rounded text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <Badge
                      status={
                        data.currentStatus.state === 'FREE'
                          ? 'AVAILABLE'
                          : data.currentStatus.state === 'BUSY'
                          ? 'BUSY'
                          : data.currentStatus.state === 'PARTIALLY_AVAILABLE'
                          ? 'PREFERRED'
                          : 'UNAVAILABLE'
                      }
                    >
                      {data.currentStatus.state === 'FREE'
                        ? 'Currently Free'
                        : data.currentStatus.state === 'BUSY'
                        ? 'Currently Busy'
                        : data.currentStatus.state === 'PARTIALLY_AVAILABLE'
                        ? 'Partially Available'
                        : 'Currently Unavailable'}
                    </Badge>

                    <span className="font-mono text-[11px] text-on-surface-variant">
                      Evaluated in UTC
                    </span>
                  </div>

                  <p className="text-on-surface font-medium leading-relaxed">
                    {data.currentStatus.reason}
                  </p>

                  <div className="pt-2 border-t border-surface-outline flex items-center justify-between text-[11px] text-on-surface-variant">
                    <span>Workload Allocation:</span>
                    <span className="font-mono font-semibold text-primary">
                      {data.person.currentAllocatedHours} / {data.person.capacityLimitHours} Hours
                    </span>
                  </div>
                </div>
              </div>

              {/* Next Free Window Banner */}
              <div className="p-3.5 bg-emerald-50/80 border border-emerald-200 rounded text-xs text-emerald-950 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px] text-emerald-700">
                      schedule
                    </span>
                    Next Free Window
                  </span>
                  {data.nextFree.durationFormatted && (
                    <span className="px-1.5 py-0.2 bg-emerald-200/80 text-emerald-900 rounded font-mono text-[10px] font-semibold">
                      {data.nextFree.durationFormatted}
                    </span>
                  )}
                </div>
                <p className="text-sm font-bold text-emerald-900 pt-0.5">
                  {data.nextFree.statusText}
                </p>
              </div>

              {/* 7-Day Weekly Availability Timeline */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
                    7-Day Availability Timeline
                  </span>
                  <span className="text-[10px] font-mono text-outline">Hourly UTC Windows</span>
                </div>

                <div className="space-y-2">
                  {data.weeklyTimeline.map((day) => (
                    <div
                      key={day.date}
                      className={`p-3 rounded border text-xs transition-all ${
                        day.isToday
                          ? 'bg-surface-bright border-primary ring-1 ring-primary/10 shadow-2xs'
                          : 'bg-surface-container-low/60 border-surface-outline'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-primary text-xs">{day.dayName}</span>
                          {day.isToday && (
                            <span className="px-1.5 py-0.2 bg-primary text-on-primary rounded text-[9px] font-bold uppercase">
                              Today
                            </span>
                          )}
                        </div>
                        <Badge
                          status={
                            day.status === 'FREE'
                              ? 'AVAILABLE'
                              : day.status === 'BUSY'
                              ? 'BUSY'
                              : day.status === 'PARTIALLY_AVAILABLE'
                              ? 'PREFERRED'
                              : 'UNAVAILABLE'
                          }
                        >
                          {day.status === 'FREE'
                            ? 'Open'
                            : day.status === 'BUSY'
                            ? 'Full'
                            : day.status === 'PARTIALLY_AVAILABLE'
                            ? 'Partial'
                            : 'Off'}
                        </Badge>
                      </div>

                      {/* Hourly Interval Blocks */}
                      <div className="space-y-1 pt-1 border-t border-surface-outline/60">
                        {day.windows.map((win, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between py-1 text-[11px] font-mono"
                          >
                            <span className="text-on-surface-variant font-medium">
                              {win.startFormatted} – {win.endFormatted}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                win.state === 'FREE'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : win.state === 'BUSY'
                                  ? 'bg-rose-100 text-rose-800'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {win.label}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Upcoming Commitments */}
              <div className="space-y-2.5 pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
                    Assigned Tasks & Commitments
                  </span>
                  <span className="font-mono text-xs text-on-surface-variant tabular-nums">
                    {data.upcomingCommitments.length} Active
                  </span>
                </div>

                {data.upcomingCommitments.length === 0 ? (
                  <div className="p-4 bg-surface-container-low border border-surface-outline rounded text-center text-xs text-on-surface-variant">
                    No conflicting commitments or active tasks assigned.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {data.upcomingCommitments.map((task) => (
                      <div
                        key={task.id}
                        onClick={() => onSelectTask?.(task.id)}
                        className="p-3 bg-surface rounded border border-surface-outline hover:border-slate-400 cursor-pointer transition-colors text-xs space-y-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-bold text-primary">{task.id}</span>
                          <Badge priority={task.priority} />
                        </div>
                        <p className="font-semibold text-primary">{task.title}</p>
                        <div className="flex items-center justify-between pt-1 border-t border-surface-outline text-[11px] text-on-surface-variant font-mono">
                          <span>Due: {task.dueDateFormatted}</span>
                          <span>{task.allocatedHours}h / {task.estimatedHours}h</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-surface-outline bg-surface-container-low flex justify-end sticky bottom-0 z-20">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close Panel
          </Button>
        </div>
      </aside>
    </div>
  );
}
