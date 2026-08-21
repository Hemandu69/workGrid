'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../lib/auth-context';
import { apiClient } from '../../lib/api-client';
import { useDomainEvent } from '../../lib/realtime-context';
import { AttendanceMeResponse, AttendanceDayGroup } from '../../types/attendance';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';

export function formatSecondsToClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;

  const hh = hours.toString().padStart(2, '0');
  const mm = minutes.toString().padStart(2, '0');
  const ss = seconds.toString().padStart(2, '0');
  return `${hh}h ${mm}m ${ss}s`;
}

export function formatSecondsToSummary(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

export function AttendanceCard() {
  const { user, isAuthenticated } = useAuth();

  const [data, setData] = useState<AttendanceMeResponse | null>(null);
  const [isActionPending, setIsActionPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [currentTick, setCurrentTick] = useState<number>(Date.now());

  // History modal state
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [historyGroups, setHistoryGroups] = useState<AttendanceDayGroup[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Fetch authoritative current attendance from server
  const fetchAttendance = useCallback(async () => {
    if (!isAuthenticated || user.accountStatus !== 'ACTIVE') {
      return;
    }

    try {
      const res = await apiClient.getAttendanceMe();
      setData(res);
      setActionError(null);
    } catch {
      setData((prev) => {
        if (prev) return prev;
        return {
          state: 'OUT',
          presenceState: 'OUT',
          currentSession: null,
          todaySummary: {
            totalSeconds: 0,
            totalFormatted: '0m',
            sessionCount: 0,
          },
          recentSessions: [],
        };
      });
    }
  }, [isAuthenticated, user.accountStatus]);

  useEffect(() => {
    fetchAttendance();
  }, [fetchAttendance]);

  // Real-Time Domain Event Subscription: instant update when attendance changes
  useDomainEvent(['EMPLOYEE_CHECKED_IN', 'EMPLOYEE_CHECKED_OUT', 'ATTENDANCE_UPDATED'], (event) => {
    if (!event.targetUserId || event.targetUserId === user?.id) {
      fetchAttendance();
    }
  });

  // Live 1-second dynamic clock for continuous working duration calculation
  useEffect(() => {
    if (data?.state === 'IN') {
      const timer = setInterval(() => {
        setCurrentTick(Date.now());
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [data?.state]);

  // Handle Check IN
  const handleCheckIn = async () => {
    setIsActionPending(true);
    setActionError(null);

    try {
      await apiClient.checkInAttendance();
      await fetchAttendance();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Failed to record check in.');
    } finally {
      setIsActionPending(false);
    }
  };

  // Handle Check OUT
  const handleCheckOut = async () => {
    setIsActionPending(true);
    setActionError(null);

    try {
      await apiClient.checkOutAttendance();
      await fetchAttendance();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Failed to record check out.');
    } finally {
      setIsActionPending(false);
    }
  };

  // Load History
  const handleOpenHistory = async () => {
    setIsHistoryModalOpen(true);
    setIsLoadingHistory(true);
    try {
      const res = await apiClient.getAttendanceHistory(30);
      setHistoryGroups(res.history);
    } catch {
      setHistoryGroups([]);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // Compute live elapsed seconds dynamically from server arrivedAt
  const liveElapsedSeconds = useMemo(() => {
    if (!data?.currentSession?.arrivedAt) return 0;
    const arrivedTime = new Date(data.currentSession.arrivedAt).getTime();
    return Math.max(0, Math.floor((currentTick - arrivedTime) / 1000));
  }, [data?.currentSession?.arrivedAt, currentTick]);

  // Compute live today total seconds including ongoing session
  const liveTodayTotalSeconds = useMemo(() => {
    if (!data) return 0;
    if (data.state === 'IN') {
      // Completed sessions today + current live session
      const completedSeconds = data.recentSessions
        .filter((s) => s.leftAt !== null)
        .reduce((sum, s) => sum + (s.durationSeconds || 0), 0);
      return completedSeconds + liveElapsedSeconds;
    }
    return data.todaySummary.totalSeconds;
  }, [data, liveElapsedSeconds]);

  // Render nothing if user is not active (pending users have separate holding UX)
  if (!isAuthenticated || user.accountStatus !== 'ACTIVE') {
    return null;
  }

  const isCheckedIn = data?.state === 'IN';

  return (
    <>
      <div className="bg-surface-bright border border-surface-outline rounded p-4 shadow-xs">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          {/* Status & Timing Details */}
          <div className="flex items-start gap-3 min-w-0">
            {/* Status Beacon */}
            <div
              className={`w-10 h-10 rounded flex items-center justify-center shrink-0 border ${
                isCheckedIn
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                  : 'bg-surface-container text-on-surface-variant border-surface-outline'
              }`}
            >
              <span
                className={`material-symbols-outlined text-[24px] ${
                  isCheckedIn ? 'text-emerald-600 animate-pulse' : 'text-on-surface-variant'
                }`}
              >
                {isCheckedIn ? 'schedule' : 'logout'}
              </span>
            </div>

            {/* Status Information */}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider border ${
                    isCheckedIn
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      isCheckedIn ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                    }`}
                  />
                  {isCheckedIn ? "You\u2019re Checked IN" : "You\u2019re Checked OUT"}
                </span>

                <span className="text-[11px] text-on-surface-variant font-mono">
                  {isCheckedIn
                    ? `Arrived at ${data?.currentSession?.arrivedAtIST || 'Today'}`
                    : data?.todaySummary.lastLeftAtIST
                    ? `Last checkout: ${data.todaySummary.lastLeftAtIST}`
                    : 'Not checked in yet today'}
                </span>
              </div>

              {/* Dynamic Live Counter & Summary */}
              <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                {isCheckedIn ? (
                  <>
                    <div className="flex items-center gap-1.5 text-primary">
                      <span className="text-on-surface-variant">Working duration:</span>
                      <span className="font-mono font-bold text-emerald-700 tabular-nums">
                        {formatSecondsToClock(liveElapsedSeconds)}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-on-surface-variant">
                      <span>Today&apos;s Total:</span>
                      <span className="font-mono font-semibold text-on-surface tabular-nums">
                        {formatSecondsToSummary(liveTodayTotalSeconds)}
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center gap-1.5 text-on-surface-variant">
                    <span>Today&apos;s Accumulated Work:</span>
                    <span className="font-mono font-bold text-primary tabular-nums">
                      {formatSecondsToSummary(liveTodayTotalSeconds)}
                    </span>
                    {data && data.todaySummary.sessionCount > 0 && (
                      <span className="text-[10px] text-on-surface-variant font-mono">
                        ({data.todaySummary.sessionCount} session{data.todaySummary.sessionCount > 1 ? 's' : ''})
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 self-end sm:self-center shrink-0 w-full sm:w-auto justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={handleOpenHistory}
              className="text-xs text-on-surface-variant hover:text-on-surface"
              title="View Attendance History"
            >
              <span className="material-symbols-outlined text-[16px] mr-1">history</span>
              Log
            </Button>

            {isCheckedIn ? (
              <Button
                variant="danger"
                size="sm"
                disabled={isActionPending}
                onClick={handleCheckOut}
                className="font-semibold text-xs px-4"
              >
                <span className="material-symbols-outlined text-[16px] mr-1.5">logout</span>
                {isActionPending ? 'Recording...' : 'CHECK OUT'}
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                disabled={isActionPending}
                onClick={handleCheckIn}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs px-4"
              >
                <span className="material-symbols-outlined text-[16px] mr-1.5">login</span>
                {isActionPending ? 'Recording...' : 'CHECK IN'}
              </Button>
            )}
          </div>
        </div>

        {/* Error Feedback */}
        {actionError && (
          <div className="mt-2 p-2 bg-rose-50 border border-rose-200 rounded text-xs text-rose-800 flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[15px]">error</span>
            <span>{actionError}</span>
          </div>
        )}
      </div>

      {/* Attendance History Modal */}
      <Modal
        isOpen={isHistoryModalOpen}
        onClose={() => setIsHistoryModalOpen(false)}
        title="Personal Attendance & Work History (IST)"
        maxWidth="lg"
      >
        <div className="space-y-4 text-xs">
          <div className="p-3 bg-surface-container-low border border-surface-outline rounded flex items-center justify-between">
            <div>
              <p className="font-semibold text-primary">{user.name}</p>
              <p className="text-[11px] text-on-surface-variant font-mono">{user.email}</p>
            </div>
            <div className="text-right font-mono">
              <span className="text-[10px] text-on-surface-variant uppercase font-semibold block">
                Today Total
              </span>
              <span className="text-sm font-bold text-emerald-700">
                {formatSecondsToSummary(liveTodayTotalSeconds)}
              </span>
            </div>
          </div>

          {isLoadingHistory ? (
            <div className="text-center py-8 text-on-surface-variant">
              Loading attendance history...
            </div>
          ) : historyGroups.length === 0 ? (
            <div className="text-center py-8 text-on-surface-variant">
              No attendance sessions recorded in the last 30 days.
            </div>
          ) : (
            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
              {historyGroups.map((group) => (
                <div
                  key={group.date}
                  className="bg-surface-bright border border-surface-outline rounded p-3 space-y-2"
                >
                  <div className="flex items-center justify-between border-b border-surface-outline pb-1.5">
                    <span className="font-bold text-primary font-mono text-xs">
                      {group.dateFormatted}
                    </span>
                    <span className="font-mono text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      Day Total: {group.totalFormatted}
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    {group.sessions.map((sess) => (
                      <div
                        key={sess.id}
                        className="flex items-center justify-between text-[11px] p-2 bg-surface-container-low rounded border border-surface-outline"
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-mono font-medium text-on-surface">
                            IN: <strong className="text-emerald-700">{sess.arrivedAtIST}</strong>
                          </span>
                          <span className="material-symbols-outlined text-[14px] text-outline">
                            arrow_forward
                          </span>
                          <span className="font-mono font-medium text-on-surface">
                            OUT: {sess.leftAtIST ? <strong className="text-rose-700">{sess.leftAtIST}</strong> : <span className="text-amber-700 italic font-bold animate-pulse">In Progress</span>}
                          </span>
                        </div>

                        <span className="font-mono font-semibold text-primary">
                          {sess.durationFormatted}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end pt-3 border-t border-surface-outline">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsHistoryModalOpen(false)}
            >
              Close
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
