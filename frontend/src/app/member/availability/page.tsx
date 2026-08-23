'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { AppShell } from '../../../components/layout/AppShell';
import { AvailabilityGrid } from '../../../components/availability/AvailabilityGrid';
import { useAuth } from '../../../lib/auth-context';
import { apiClient } from '../../../lib/api-client';
import { WeeklyAvailabilitySchedule, WeekAvailabilityResponse, DayOfWeek } from '../../../types/availability';
import { useDomainEvent } from '../../../lib/realtime-context';
import { getCurrentISTDateString } from '../../../lib/time-utils';
import {
  getWeeksInMonth,
  getMondayOfWeekContaining,
  isDateInMonth,
  formatMonthYearLabel,
  formatWeekLabel,
  formatShortDate,
  shiftMonth,
} from '../../../lib/calendar-utils';

const DISPLAY_HOURS = Array.from({ length: 14 }, (_, i) => i + 7); // matches AvailabilityGrid

function buildGridSchedule(data: WeekAvailabilityResponse): WeeklyAvailabilitySchedule {
  const days = {} as Record<DayOfWeek, WeeklyAvailabilitySchedule['days'][DayOfWeek]>;
  data.days.forEach((d) => {
    days[d.dayOfWeek] = d.slots;
  });
  return {
    userId: data.userId,
    timezone: data.timezone,
    days,
    totalCapacityHours: data.totalCapacityHours,
    allocatedHours: data.allocatedHours,
    remainingAvailableHours: data.remainingAvailableHours,
  };
}

export default function AvailabilityPage() {
  const { user } = useAuth();

  const todayStr = getCurrentISTDateString();
  const [selectedYear, setSelectedYear] = useState<number>(() => Number(todayStr.slice(0, 4)));
  const [selectedMonth, setSelectedMonth] = useState<number>(() => Number(todayStr.slice(5, 7)));
  const [selectedWeekStart, setSelectedWeekStart] = useState<string>(() => getMondayOfWeekContaining(todayStr));

  const [weekData, setWeekData] = useState<WeekAvailabilityResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [savedNotification, setSavedNotification] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Monotonic fetch counter so an out-of-order response (e.g. a realtime
  // refetch racing a save's own response, or switching weeks quickly) can
  // never overwrite fresher data.
  const fetchSeq = useRef(0);

  const weeks = useMemo(() => getWeeksInMonth(selectedYear, selectedMonth), [selectedYear, selectedMonth]);

  const fetchWeek = useCallback(async () => {
    if (!user?.id) return;
    const seq = ++fetchSeq.current;
    try {
      setIsLoading(true);
      const data = await apiClient.getWeekAvailability(user.id, {
        weekStart: selectedWeekStart,
        month: selectedMonth,
        year: selectedYear,
      });
      if (data && seq === fetchSeq.current) {
        setWeekData(data);
      }
    } catch {
      // Clean fallback
    } finally {
      if (seq === fetchSeq.current) setIsLoading(false);
    }
  }, [user?.id, selectedWeekStart, selectedMonth, selectedYear]);

  useEffect(() => {
    fetchWeek();
  }, [fetchWeek]);

  useDomainEvent('AVAILABILITY_CHANGED', (event) => {
    if (!event.targetUserId || event.targetUserId === user?.id) {
      fetchWeek();
    }
  });

  const handlePrevMonth = () => {
    const { year, month } = shiftMonth(selectedYear, selectedMonth, -1);
    setSelectedYear(year);
    setSelectedMonth(month);
    setSelectedWeekStart(getWeeksInMonth(year, month)[0].weekStart);
  };

  const handleNextMonth = () => {
    const { year, month } = shiftMonth(selectedYear, selectedMonth, 1);
    setSelectedYear(year);
    setSelectedMonth(month);
    setSelectedWeekStart(getWeeksInMonth(year, month)[0].weekStart);
  };

  const dateLabels = useMemo(() => {
    if (!weekData) return undefined;
    const labels = {} as Record<DayOfWeek, string>;
    weekData.days.forEach((d) => {
      labels[d.dayOfWeek] = formatShortDate(d.date);
    });
    return labels;
  }, [weekData]);

  const disabledDays = useMemo(() => {
    if (!weekData) return undefined;
    const disabled = {} as Record<DayOfWeek, boolean>;
    weekData.days.forEach((d) => {
      disabled[d.dayOfWeek] = !isDateInMonth(d.date, selectedYear, selectedMonth);
    });
    return disabled;
  }, [weekData, selectedYear, selectedMonth]);

  const todayDayOfWeek = useMemo(() => {
    if (!weekData) return null;
    const entry = weekData.days.find((d) => d.date === todayStr);
    return entry ? entry.dayOfWeek : null;
  }, [weekData, todayStr]);

  const handleSave = async (updatedSchedule: WeeklyAvailabilitySchedule) => {
    if (!user?.id || !weekData) return;
    setSaveError(null);

    const days = weekData.days
      // Out-of-month dates are never editable, and never submitted — belt
      // and suspenders alongside AvailabilityGrid's own disabledDays guard.
      .filter((d) => isDateInMonth(d.date, selectedYear, selectedMonth))
      .map((d) => {
        const slots: { hour: number; state: string; taskId?: string }[] = [];
        (updatedSchedule.days[d.dayOfWeek] || []).forEach((slot) => {
          // Task-allocated Busy (has a taskId) is never user-editable —
          // never send it back. A user-painted recurring/date Busy (no
          // taskId) is sent normally.
          if ((slot.state === 'BUSY' && slot.taskId) || !DISPLAY_HOURS.includes(slot.hour)) return;
          const entry: { hour: number; state: string; taskId?: string } = { hour: slot.hour, state: slot.state };
          if (slot.taskId) entry.taskId = slot.taskId;
          slots.push(entry);
        });
        return { date: d.date, slots };
      });

    const seq = ++fetchSeq.current;
    try {
      const updated = await apiClient.updateWeekAvailability(user.id, {
        weekStart: selectedWeekStart,
        month: selectedMonth,
        year: selectedYear,
        days,
      });
      if (seq === fetchSeq.current) {
        setWeekData(updated);
      }
      setSavedNotification(true);
      setTimeout(() => setSavedNotification(false), 3000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save your schedule. Please try again.');
      throw err;
    }
  };

  return (
    <AppShell
      breadcrumbs={[
        { label: 'WorkGrid', href: '/' },
        { label: 'Member Workspace', href: '/member' },
        { label: 'Weekly Availability' },
      ]}
    >
      <div className="space-y-6 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-surface-outline pb-4">
          <div>
            <h1 className="text-xl font-bold text-primary tracking-tight">Weekly Availability</h1>
            <p className="text-xs text-on-surface-variant mt-1">
              Edit your real-date schedule for the selected week. Availability is stored in your IANA timezone.
            </p>
          </div>

          {savedNotification && (
            <div className="px-3 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded text-xs font-semibold flex items-center gap-1.5 animate-in fade-in">
              <span className="material-symbols-outlined text-[16px]">check_circle</span>
              Schedule updated successfully
            </div>
          )}

          {saveError && (
            <div className="px-3 py-1 bg-rose-50 text-rose-700 border border-rose-200 rounded text-xs font-semibold flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px]">error</span>
              {saveError}
            </div>
          )}
        </div>

        {/* Month Selector */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant mr-1">Month</span>
          <button
            type="button"
            onClick={handlePrevMonth}
            aria-label="Previous month"
            className="w-7 h-7 flex items-center justify-center rounded border border-surface-outline bg-surface-bright hover:bg-surface-container-low text-on-surface"
          >
            <span className="material-symbols-outlined text-[18px]">chevron_left</span>
          </button>
          <span className="px-3 py-1 text-sm font-semibold text-primary font-mono min-w-[10rem] text-center">
            {formatMonthYearLabel(selectedYear, selectedMonth)}
          </span>
          <button
            type="button"
            onClick={handleNextMonth}
            aria-label="Next month"
            className="w-7 h-7 flex items-center justify-center rounded border border-surface-outline bg-surface-bright hover:bg-surface-container-low text-on-surface"
          >
            <span className="material-symbols-outlined text-[18px]">chevron_right</span>
          </button>
        </div>

        {/* Week Selector */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant mr-1">Week</span>
          {weeks.map((w) => (
            <button
              key={w.weekStart}
              type="button"
              onClick={() => setSelectedWeekStart(w.weekStart)}
              className={`px-3 py-1 rounded text-xs font-medium border transition-all ${
                w.weekStart === selectedWeekStart
                  ? 'bg-primary text-white border-primary shadow-xs'
                  : 'bg-surface-bright text-on-surface border-surface-outline hover:bg-surface-container-low'
              }`}
            >
              {formatWeekLabel(w.weekStart, w.weekEnd)}
            </button>
          ))}
        </div>

        {/* Operational Availability Rules Notice */}
        <div className="p-3.5 bg-surface-container-low border border-surface-outline rounded text-xs text-on-surface space-y-1">
          <div className="font-semibold text-primary flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[16px] text-secondary">info</span>
            Capacity & Task Allocation Rules
          </div>
          <p className="text-on-surface-variant leading-relaxed">
            Assigned tasks use up your available hours automatically, reserved ahead of their due time. You can also
            paint recurring Busy slots yourself — task-allocated Busy slots stay locked. Days shown in grey belong to
            a different month and can&apos;t be edited from here.
          </p>
        </div>

        {/* 7-Day Matrix */}
        {isLoading ? (
          <p className="text-xs text-on-surface-variant text-center py-12">Loading availability matrix...</p>
        ) : weekData ? (
          <AvailabilityGrid
            key={selectedWeekStart}
            initialSchedule={buildGridSchedule(weekData)}
            onSave={handleSave}
            dateLabels={dateLabels}
            disabledDays={disabledDays}
            todayDayOfWeek={todayDayOfWeek}
          />
        ) : (
          <p className="text-xs text-on-surface-variant text-center py-12">No schedule records available.</p>
        )}
      </div>
    </AppShell>
  );
}
