import React from 'react';

interface StatMetricCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  trend?: string;
  trendDirection?: 'up' | 'down' | 'neutral';
  icon: string;
  indicatorColor?: 'primary' | 'available' | 'busy' | 'blocked';
}

export function StatMetricCard({
  label,
  value,
  subtext,
  trend,
  trendDirection = 'up',
  icon,
  indicatorColor = 'primary',
}: StatMetricCardProps) {
  const indicatorStyles = {
    primary: 'before:bg-primary',
    available: 'before:bg-status-available',
    busy: 'before:bg-status-busy',
    blocked: 'before:bg-status-blocked',
  };

  return (
    <div
      className={`bg-surface-bright border border-surface-outline rounded p-4 relative overflow-hidden flex flex-col justify-between shadow-xs before:absolute before:top-0 before:left-0 before:w-full before:h-[3px] ${indicatorStyles[indicatorColor]}`}
    >
      <div className="flex items-start justify-between">
        <div>
          <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider block">
            {label}
          </span>
          <h4 className="text-2xl font-extrabold text-primary tracking-tight mt-1 tabular-nums font-mono">
            {value}
          </h4>
        </div>
        <div className="p-2 rounded bg-surface-container-low border border-surface-outline text-secondary">
          <span className="material-symbols-outlined text-[20px]">{icon}</span>
        </div>
      </div>

      {(subtext || trend) && (
        <div className="mt-3 pt-2 border-t border-surface-outline flex items-center justify-between text-xs">
          {subtext && <span className="text-on-surface-variant text-[11px]">{subtext}</span>}
          {trend && (
            <span
              className={`font-semibold text-[11px] tabular-nums ${
                trendDirection === 'up'
                  ? 'text-emerald-700'
                  : trendDirection === 'down'
                  ? 'text-rose-700'
                  : 'text-on-surface-variant'
              }`}
            >
              {trend}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
