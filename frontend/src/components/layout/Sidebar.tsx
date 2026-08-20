'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../../lib/auth-context';
import { Badge } from '../ui/Badge';
import { Avatar } from '../ui/Avatar';

interface NavItem {
  label: string;
  href: string;
  icon: string;
  roles: Array<'SUPER_ADMIN' | 'ADMIN' | 'SERVER' | 'MEMBER'>;
  badge?: string;
}

const NAV_ITEMS: NavItem[] = [
  // Super Admin & Admin Links
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
  {
    label: 'Admin Dashboard',
    href: '/admin',
    icon: 'dashboard',
    roles: ['ADMIN'],
  },
  {
    label: 'Task Management',
    href: '/admin/tasks',
    icon: 'task_alt',
    roles: ['ADMIN', 'SUPER_ADMIN'],
  },
  {
    label: 'Room Overview',
    href: '/admin/rooms',
    icon: 'meeting_room',
    roles: ['ADMIN', 'SUPER_ADMIN'],
  },
  {
    label: 'Teams & Directory',
    href: '/admin/teams',
    icon: 'groups',
    roles: ['ADMIN', 'SUPER_ADMIN'],
  },
  {
    label: 'Reports & Analytics',
    href: '/admin/reports',
    icon: 'analytics',
    roles: ['ADMIN', 'SUPER_ADMIN'],
  },

  // Server (Team Lead) Links
  {
    label: 'Team Dashboard',
    href: '/server',
    icon: 'space_dashboard',
    roles: ['SERVER'],
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
    roles: ['MEMBER', 'SERVER'],
    badge: '3',
  },
  {
    label: 'Weekly Availability',
    href: '/member/availability',
    icon: 'calendar_month',
    roles: ['MEMBER', 'SERVER', 'ADMIN', 'SUPER_ADMIN'],
  },
  {
    label: 'Notifications',
    href: '/notifications',
    icon: 'notifications',
    roles: ['MEMBER', 'SERVER', 'ADMIN', 'SUPER_ADMIN'],
    badge: '2',
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

  const filteredNavItems = NAV_ITEMS.filter((item) => item.roles.includes(role));

  const roleLabel = {
    SUPER_ADMIN: 'Super Admin',
    ADMIN: 'Admin',
    SERVER: 'Server / Lead',
    MEMBER: 'Member',
  }[role];

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
                Office Task Tracker
              </p>
            </div>
          </div>

          <Badge role={roleLabel} variant="role" />
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

        {/* Quick Action Button */}
        <div className="px-4 py-3">
          <button
            onClick={onQuickAction}
            className="w-full bg-primary text-on-primary py-2 px-3 rounded text-xs font-medium hover:bg-primary-container transition-colors flex items-center justify-center gap-2 shadow-xs"
          >
            <span className="material-symbols-outlined text-[16px]">
              {role === 'MEMBER' ? 'edit_calendar' : 'add'}
            </span>
            <span>{role === 'MEMBER' ? 'Edit Availability' : 'Create Task'}</span>
          </button>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
          <div className="px-2 pb-1.5 pt-1 text-[10px] font-bold text-on-surface-variant uppercase tracking-wider select-none">
            Main Navigation
          </div>

          {filteredNavItems.map((item) => {
            const isActive = pathname === item.href;
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

                {item.badge && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-secondary-container text-on-secondary-container">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Footer info */}
        <div className="p-3 border-t border-surface-outline bg-surface-container-low text-[11px] text-on-surface-variant flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-status-available animate-pulse"></span>
            <span>2,000 Nodes Active</span>
          </div>
          <span className="font-mono text-[10px]">v1.0.0</span>
        </div>
      </aside>
    </>
  );
}
