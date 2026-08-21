import React from 'react';
import { OrgEventAnalytics } from '../../types/org-event';

interface EventAnalyticsSummaryProps {
  analytics: OrgEventAnalytics;
  compact?: boolean;
}

export function EventAnalyticsSummary({ analytics, compact = false }: EventAnalyticsSummaryProps) {
  const stats = [
    { label: 'Total Eligible', value: analytics.totalEligible, style: 'text-primary' },
    { label: 'Attending', value: analytics.attending, style: 'text-emerald-700' },
    { label: 'Maybe', value: analytics.maybe, style: 'text-amber-700' },
    { label: 'Not Attending', value: analytics.notAttending, style: 'text-rose-700' },
    { label: 'No Response', value: analytics.noResponse, style: 'text-on-surface-variant' },
  ];

  return (
    <div className="space-y-2">
      <div className={`grid grid-cols-2 sm:grid-cols-5 gap-2 ${compact ? 'text-[11px]' : 'text-xs'}`}>
        {stats.map((s) => (
          <div key={s.label} className="p-2.5 bg-surface-container-low border border-surface-outline rounded text-center">
            <p className={`font-bold font-mono ${s.style} ${compact ? 'text-base' : 'text-lg'}`}>{s.value}</p>
            <p className="text-[10px] text-on-surface-variant uppercase tracking-wider font-semibold mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <div className="flex-1 h-2 bg-surface-container rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all"
            style={{ width: `${Math.min(100, analytics.attendanceRate)}%` }}
          />
        </div>
        <span className="text-xs font-mono font-bold text-primary shrink-0">{analytics.attendanceRate}% Attendance</span>
      </div>
    </div>
  );
}
