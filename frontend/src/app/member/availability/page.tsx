'use client';

import React, { useState } from 'react';
import { AppShell } from '../../../components/layout/AppShell';
import { AvailabilityGrid } from '../../../components/availability/AvailabilityGrid';
import { MOCK_SCHEDULE } from '../../../lib/mock-data';

export default function AvailabilityPage() {
  const [savedNotification, setSavedNotification] = useState(false);

  const handleSave = () => {
    setSavedNotification(true);
    setTimeout(() => setSavedNotification(false), 3000);
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
            <h1 className="text-xl font-bold text-primary tracking-tight">
              Weekly Recurring Availability Matrix
            </h1>
            <p className="text-xs text-on-surface-variant mt-1">
              Maintain your 7-day recurring schedule in hourly slots. Availability is stored in your IANA timezone and evaluated in UTC.
            </p>
          </div>

          {savedNotification && (
            <div className="px-3 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded text-xs font-semibold flex items-center gap-1.5 animate-in fade-in">
              <span className="material-symbols-outlined text-[16px]">check_circle</span>
              Schedule updated successfully
            </div>
          )}
        </div>

        {/* Operational Availability Rules Notice */}
        <div className="p-3.5 bg-surface-container-low border border-surface-outline rounded text-xs text-on-surface space-y-1">
          <div className="font-semibold text-primary flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[16px] text-secondary">info</span>
            Capacity & Task Allocation Rules
          </div>
          <p className="text-on-surface-variant leading-relaxed">
            Active task allocations consume available hours. When a task is assigned, the system reserves non-conflicting capacity before its due time. Slots marked as Busy cannot be made unavailable without Admin overload.
          </p>
        </div>

        {/* 7-Day Matrix */}
        <AvailabilityGrid initialSchedule={MOCK_SCHEDULE} onSave={handleSave} />
      </div>
    </AppShell>
  );
}
