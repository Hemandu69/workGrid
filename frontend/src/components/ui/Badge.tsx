import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { TaskStatus, TaskPriority } from '../../types/task';
import { AccountStatus } from '../../types/auth';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'outline' | 'status' | 'priority' | 'role' | 'accountStatus';
  status?: TaskStatus | 'AVAILABLE' | 'BUSY' | 'BLOCKED' | 'COMPLETED' | 'UNAVAILABLE' | 'PREFERRED' | 'ONLINE' | 'OFFLINE' | 'AWAY';
  accountStatus?: AccountStatus;
  priority?: TaskPriority;
  role?: string;
  dot?: boolean;
}

export function Badge({
  className,
  variant = 'default',
  status,
  accountStatus,
  priority,
  role,
  dot = true,
  children,
  ...props
}: BadgeProps) {
  // Format Account Status Badges (PENDING, ACTIVE, SUSPENDED, DEACTIVATED)
  if (accountStatus || variant === 'accountStatus') {
    const accKey = (accountStatus || '').toUpperCase();
    let dotColor = 'bg-slate-400';
    let badgeStyle = 'bg-slate-100 text-slate-700 border-slate-200';
    let label = accountStatus || 'Unknown';

    switch (accKey) {
      case 'ACTIVE':
        dotColor = 'bg-emerald-500';
        badgeStyle = 'bg-emerald-50 text-emerald-800 border-emerald-200';
        label = 'Active';
        break;
      case 'PENDING':
        dotColor = 'bg-amber-500';
        badgeStyle = 'bg-amber-50 text-amber-800 border-amber-200 font-semibold';
        label = 'Pending Review';
        break;
      case 'SUSPENDED':
        dotColor = 'bg-rose-500';
        badgeStyle = 'bg-rose-50 text-rose-800 border-rose-200 font-semibold';
        label = 'Suspended';
        break;
      case 'DEACTIVATED':
        dotColor = 'bg-slate-400';
        badgeStyle = 'bg-slate-100 text-slate-500 border-slate-200 line-through';
        label = 'Deactivated';
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

  // Format Status Badges (Dot + Label with high contrast text and subtle tint)
  if (status || variant === 'status') {
    const statusKey = (status || '').toUpperCase();
    let dotColor = 'bg-slate-400';
    let badgeStyle = 'bg-slate-100 text-slate-700 border-slate-200';
    let label = status || 'Unknown';

    switch (statusKey) {
      case 'ONLINE':
      case 'AVAILABLE':
        dotColor = 'bg-status-available';
        badgeStyle = 'bg-emerald-50 text-emerald-800 border-emerald-200';
        label = statusKey === 'ONLINE' ? 'Online' : 'Available';
        break;
      case 'AWAY':
        dotColor = 'bg-amber-400';
        badgeStyle = 'bg-amber-50 text-amber-800 border-amber-200';
        label = 'Away';
        break;
      case 'OFFLINE':
        dotColor = 'bg-slate-400';
        badgeStyle = 'bg-slate-100 text-slate-500 border-slate-200';
        label = 'Offline';
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
      case 'CANCELLED':
        dotColor = 'bg-rose-400';
        badgeStyle = 'bg-rose-50 text-rose-700 border-rose-200 line-through';
        label = 'Cancelled';
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
    const rawRole = (role || '').toUpperCase().replace(/[\s/_-]+/g, '_');
    let roleStyle = 'bg-slate-100 text-slate-800 border-slate-200';
    let defaultLabel = role || 'Unassigned';

    if (rawRole.includes('SUPER_ADMIN')) {
      roleStyle = 'bg-purple-50 text-purple-800 border-purple-200 font-semibold';
    } else if (rawRole.includes('ADMIN')) {
      roleStyle = 'bg-indigo-50 text-indigo-800 border-indigo-200 font-semibold';
    } else if (rawRole.includes('TEAM_LEAD') || rawRole.includes('LEAD')) {
      roleStyle = 'bg-cyan-50 text-cyan-800 border-cyan-200 font-semibold';
    } else if (rawRole.includes('SERVER')) {
      roleStyle = 'bg-amber-50 text-amber-800 border-amber-200 font-semibold';
    } else if (rawRole.includes('MEMBER')) {
      roleStyle = 'bg-slate-50 text-slate-700 border-slate-200';
    } else if (rawRole.includes('UNASSIGNED') || !rawRole) {
      roleStyle = 'bg-slate-100 text-slate-500 border-slate-300 font-normal';
      defaultLabel = 'Unassigned';
    }

    return (
      <span
        className={twMerge(
          clsx(
            'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider border select-none',
            roleStyle,
            className
          )
        )}
        {...props}
      >
        {children || defaultLabel}
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

