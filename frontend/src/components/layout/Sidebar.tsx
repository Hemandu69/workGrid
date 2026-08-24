'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../../lib/auth-context';
import { useNotifications } from '../../lib/notifications-context';
import { useDomainEvent, useRealtime } from '../../lib/realtime-context';
import { apiClient } from '../../lib/api-client';
import { Badge } from '../ui/Badge';
import { Avatar } from '../ui/Avatar';

import { UserRole } from '../../types/auth';

interface NavItem {
  label: string;
  href: string;
  icon: string;
  roles: UserRole[];
  badge?: string;
  // When true, this item also stays highlighted active on any nested route
  // (e.g. /hr/audit) — used for feature areas with child views that live
  // under the same parent nav entry rather than getting their own.
  matchPrefix?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  // Super Admin Links
  {
    label: 'Global Overview',
    href: '/super-admin',
    icon: 'monitoring',
    roles: ['SUPER_ADMIN'],
  },
  {
    label: 'Announcements',
    href: '/super-admin/announcements',
    icon: 'campaign',
    roles: ['SUPER_ADMIN'],
  },

  // Event Personnel Management (People Directory + Role Audit live together
  // as tabs on this one feature area, see PeopleManagementTabs) — SUPER_ADMIN
  // only, since Super Admin already holds every people-governance capability
  // this area requires.
  {
    label: 'People Management',
    href: '/admin/people',
    icon: 'badge',
    roles: ['SUPER_ADMIN'],
    matchPrefix: true,
  },

  // Admin Operational Links
  {
    label: 'Admin Dashboard',
    href: '/admin',
    icon: 'dashboard',
    roles: ['ADMIN'],
  },
  {
    label: 'Announcements',
    href: '/super-admin/announcements',
    icon: 'campaign',
    roles: ['ADMIN'],
  },
  {
    label: 'Task Management',
    href: '/admin/tasks',
    icon: 'task_alt',
    roles: ['ADMIN', 'SUPER_ADMIN'],
  },
  {
    label: 'Operations Grid',
    href: '/admin/operations',
    icon: 'grid_view',
    roles: ['ADMIN', 'SUPER_ADMIN', 'SERVER'],
  },
  {
    label: 'People Availability',
    href: '/admin/availability',
    icon: 'event_available',
    roles: ['ADMIN', 'SUPER_ADMIN', 'SERVER'],
  },
  // Server Link (Room & Event Supervision)
  {
    label: 'Room Supervision',
    href: '/server',
    icon: 'space_dashboard',
    roles: ['SERVER'],
  },

  // Team Lead Link (Team Coordination)
  {
    label: 'Team Workspace',
    href: '/team-lead',
    icon: 'hub',
    roles: ['TEAM_LEAD'],
  },

  // Member Links
  {
    label: 'My Dashboard',
    href: '/member',
    icon: 'dashboard',
    roles: ['MEMBER'],
  },
  {
    label: 'My Tasks',
    href: '/member/tasks',
    icon: 'assignment',
    roles: ['MEMBER', 'SERVER', 'TEAM_LEAD'],
  },
  {
    label: 'Event Attendance',
    href: '/member/events',
    icon: 'how_to_reg',
    roles: ['MEMBER', 'SERVER', 'TEAM_LEAD'],
  },
  {
    label: 'Notifications',
    href: '/notifications',
    icon: 'notifications',
    roles: ['MEMBER', 'SERVER', 'TEAM_LEAD', 'ADMIN', 'SUPER_ADMIN'],
  },
];

interface SidebarProps {
  onQuickAction?: () => void;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
}

export function Sidebar({ onQuickAction, isOpenMobile = false, onCloseMobile }: SidebarProps) {
  const pathname = usePathname();
  const { user, role } = useAuth();
  const { unreadCount } = useNotifications();
  const isConnected = useRealtime()?.isConnected ?? false;

  // Live count of the viewer's own open tasks — the badge must reflect real
  // assigned work, never a fixed number.
  const [openTaskCount, setOpenTaskCount] = useState(0);

  const loadOpenTaskCount = useCallback(() => {
    if (!user?.id) return;
    apiClient
      .getTasks({ assigneeId: user.id, limit: 200 })
      .then((result) => {
        setOpenTaskCount(
          result.items.filter((t) => t.status !== 'COMPLETED' && t.status !== 'CANCELLED').length
        );
      })
      .catch(() => setOpenTaskCount(0));
  }, [user?.id]);

  const loadOpenTaskCountRef = useRef(loadOpenTaskCount);
  useEffect(() => {
    loadOpenTaskCountRef.current = loadOpenTaskCount;
  });

  useEffect(() => {
    loadOpenTaskCount();
  }, [loadOpenTaskCount]);

  useDomainEvent(
    ['TASK_CREATED', 'TASK_ASSIGNED', 'TASK_UPDATED', 'TASK_COMPLETED', 'TASK_STATUS_CHANGED'],
    () => {
      loadOpenTaskCountRef.current();
    }
  );

  const filteredNavItems = role ? NAV_ITEMS.filter((item) => item.roles.includes(role)) : [];

  const roleLabel: Record<UserRole, string> = {
    SUPER_ADMIN: 'Super Admin',
    ADMIN: 'Admin',
    TEAM_LEAD: 'Team Lead',
    SERVER: 'Server',
    MEMBER: 'Member',
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpenMobile && (
        <div
          className="fixed inset-0 bg-slate-900/50 z-40 lg:hidden"
          onClick={onCloseMobile}
        />
      )}

      <aside
        className={`fixed left-0 top-0 h-screen w-sidebar-width bg-surface border-r border-surface-outline flex flex-col z-40 transition-transform duration-200 lg:translate-x-0 ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Header Branding & User */}
        <div className="p-4 border-b border-surface-outline bg-surface-bright flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-primary text-on-primary font-bold flex items-center justify-center text-sm shadow-sm select-none">
              WG
            </div>
            <div>
              <h1 className="font-bold text-sm text-primary tracking-tight leading-tight">WorkGrid</h1>
              <p className="text-[10px] text-on-surface-variant uppercase tracking-wider font-semibold">
                Event Operations & Tracking
              </p>
            </div>
          </div>

          <Badge role={role ? roleLabel[role] : 'UNASSIGNED'} variant="role" />
        </div>

        {/* User Card */}
        <div className="px-4 py-3 border-b border-surface-outline bg-surface-container-low flex items-center gap-3">
          <Avatar src={user.avatarUrl} name={user.name} status={user.status} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-on-surface truncate">{user.name}</p>
            <p className="text-[11px] text-on-surface-variant truncate">
              {user.subroom ? `${user.subroom} • ${user.room}` : user.title || user.email}
            </p>
          </div>
        </div>

        {/* Quick Action Button — SERVER has no quick action here since it no
            longer creates tasks; its real actions live on the Operations Grid. */}
        {role !== 'SERVER' && (
          <div className="px-4 py-3">
            <button
              onClick={onQuickAction}
              className="w-full bg-primary text-on-primary py-2 px-3 rounded text-xs font-medium hover:bg-primary-container transition-colors flex items-center justify-center gap-2 shadow-xs"
            >
              <span className="material-symbols-outlined text-[16px]">
                {role === 'MEMBER' ? 'how_to_reg' : 'add'}
              </span>
              <span>
                {role === 'MEMBER' ? 'Event Attendance' : 'Create Task'}
              </span>
            </button>
          </div>
        )}

        {/* Navigation Items */}
        <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
          <div className="px-2 pb-1.5 pt-1 text-[10px] font-bold text-on-surface-variant uppercase tracking-wider select-none">
            Main Navigation
          </div>

          {filteredNavItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.matchPrefix ? pathname.startsWith(`${item.href}/`) : false);
            const badgeValue =
              item.href === '/notifications'
                ? unreadCount > 0
                  ? String(unreadCount)
                  : undefined
                : item.href === '/member/tasks'
                ? openTaskCount > 0
                  ? String(openTaskCount)
                  : undefined
                : item.badge;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onCloseMobile}
                className={`flex items-center justify-between px-3 py-2 rounded text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-surface-container text-primary font-semibold border-l-4 border-primary'
                    : 'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className={`material-symbols-outlined text-[18px] ${
                      isActive ? 'text-primary icon-fill' : 'text-on-surface-variant'
                    }`}
                  >
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </div>

                {badgeValue && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-secondary-container text-on-secondary-container">
                    {badgeValue}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Footer info */}
        <div className="p-3 border-t border-surface-outline bg-surface-container-low text-[11px] text-on-surface-variant flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                isConnected ? 'bg-status-available animate-pulse' : 'bg-slate-400'
              }`}
            ></span>
            <span>{isConnected ? 'Live Updates On' : 'Reconnecting…'}</span>
          </div>
          <span className="font-mono text-[10px]">v1.0.0</span>
        </div>
      </aside>
    </>
  );
}
