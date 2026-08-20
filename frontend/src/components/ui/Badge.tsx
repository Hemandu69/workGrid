import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { TaskStatus, TaskPriority } from '../../types/task';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'outline' | 'status' | 'priority' | 'role';
  status?: TaskStatus | 'AVAILABLE' | 'BUSY' | 'BLOCKED' | 'COMPLETED' | 'UNAVAILABLE' | 'PREFERRED';
  priority?: TaskPriority;
  role?: string;
  dot?: boolean;
}

export function Badge({
  className,
  variant = 'default',
  status,
  priority,
  role,
  dot = true,
  children,
  ...props
}: BadgeProps) {
  // Format Status Badges (Dot + Label with high contrast text and subtle tint)
  if (status || variant === 'status') {
    const statusKey = (status || '').toUpperCase();
    let dotColor = 'bg-slate-400';
    let badgeStyle = 'bg-slate-100 text-slate-700 border-slate-200';
    let label = status || 'Unknown';

    switch (statusKey) {
      case 'AVAILABLE':
        dotColor = 'bg-status-available';
        badgeStyle = 'bg-emerald-50 text-emerald-800 border-emerald-200';
        label = 'Available';
        break;
      case 'IN_PROGRESS':
      case 'BUSY':
        dotColor = 'bg-status-busy';
        badgeStyle = 'bg-amber-50 text-amber-800 border-amber-200';
        label = statusKey === 'IN_PROGRESS' ? 'In Progress' : 'Busy';
        break;
      case 'BLOCKED':
        dotColor = 'bg-status-blocked';
        badgeStyle = 'bg-rose-50 text-rose-800 border-rose-200';
        label = 'Blocked';
        break;
      case 'SUBMITTED':
        dotColor = 'bg-purple-500';
        badgeStyle = 'bg-purple-50 text-purple-800 border-purple-200';
        label = 'Submitted';
        break;
      case 'COMPLETED':
        dotColor = 'bg-blue-500';
        badgeStyle = 'bg-blue-50 text-blue-800 border-blue-200';
        label = 'Completed';
        break;
      case 'ASSIGNED':
        dotColor = 'bg-slate-500';
        badgeStyle = 'bg-slate-100 text-slate-800 border-slate-200';
        label = 'Assigned';
        break;
      case 'DRAFT':
        dotColor = 'bg-slate-400';
        badgeStyle = 'bg-slate-50 text-slate-600 border-slate-200';
        label = 'Draft';
        break;
      case 'PREFERRED':
        dotColor = 'bg-status-preferred';
        badgeStyle = 'bg-purple-50 text-purple-800 border-purple-200';
        label = 'Preferred';
        break;
      case 'UNAVAILABLE':
        dotColor = 'bg-slate-400';
        badgeStyle = 'bg-slate-100 text-slate-500 border-slate-200';
        label = 'Unavailable';
        break;
    }

    return (
      <span
        className={twMerge(
          clsx(
            'inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium border tabular-nums select-none',
            badgeStyle,
            className
          )
        )}
        {...props}
      >
        {dot && <span className={clsx('w-1.5 h-1.5 rounded-full shrink-0', dotColor)} />}
        <span>{children || label}</span>
      </span>
    );
  }

  // Format Priority Badges
  if (priority || variant === 'priority') {
    let priorityStyle = 'bg-slate-100 text-slate-700 border-slate-200';

    switch (priority) {
      case 'CRITICAL':
        priorityStyle = 'bg-red-50 text-red-700 border-red-200 font-semibold';
        break;
      case 'HIGH':
        priorityStyle = 'bg-amber-50 text-amber-800 border-amber-200 font-semibold';
        break;
      case 'MEDIUM':
        priorityStyle = 'bg-blue-50 text-blue-700 border-blue-200';
        break;
      case 'LOW':
        priorityStyle = 'bg-slate-50 text-slate-600 border-slate-200';
        break;
    }

    return (
      <span
        className={twMerge(
          clsx(
            'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold border select-none',
            priorityStyle,
            className
          )
        )}
        {...props}
      >
        <span>{children || priority}</span>
      </span>
    );
  }

  // Role Badge
  if (role || variant === 'role') {
    return (
      <span
        className={twMerge(
          clsx(
            'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-secondary-fixed text-on-secondary-fixed border border-secondary-container select-none',
            className
          )
        )}
        {...props}
      >
        {children || role}
      </span>
    );
  }

  return (
    <span
      className={twMerge(
        clsx(
          'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-surface-container text-on-surface border border-surface-outline',
          className
        )
      )}
      {...props}
    >
      {children}
    </span>
  );
}
