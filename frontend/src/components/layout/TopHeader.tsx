'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '../../lib/auth-context';
import { useNotifications } from '../../lib/notifications-context';
import { Avatar } from '../ui/Avatar';
import { formatToISTTime } from '../../lib/time-utils';

interface TopHeaderProps {
  breadcrumbs?: Array<{ label: string; href?: string }>;
  onToggleMobileSidebar?: () => void;
}

export function TopHeader({ breadcrumbs, onToggleMobileSidebar }: TopHeaderProps) {
  const { user, role, logout } = useAuth();
  const { unreadCount } = useNotifications();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [currentISTClock, setCurrentISTClock] = useState<string>('');

  React.useEffect(() => {
    setCurrentISTClock(formatToISTTime(new Date()));
    const timer = setInterval(() => {
      setCurrentISTClock(formatToISTTime(new Date()));
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  const defaultBreadcrumbs = [
    { label: 'WorkGrid', href: '/' },
    { label: user.room || 'Section Operations', href: '#' },
    { label: user.subroom ? `Subroom ${user.subroom}` : (role ? role.replace('_', ' ') : 'Pending Review') },
  ];

  const activeBreadcrumbs = breadcrumbs || defaultBreadcrumbs;

  return (
    <header className="fixed top-0 right-0 w-full lg:w-[calc(100%-260px)] h-row-height-standard bg-surface-bright border-b border-surface-outline flex justify-between items-center px-4 lg:px-6 z-30 select-none">
      {/* Left: Mobile Toggle & Breadcrumbs */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onToggleMobileSidebar}
          className="lg:hidden p-1.5 rounded text-on-surface-variant hover:bg-surface-container transition-colors"
          aria-label="Toggle navigation"
        >
          <span className="material-symbols-outlined text-[20px]">menu</span>
        </button>

        {/* Breadcrumbs */}
        <nav className="flex items-center gap-1.5 text-xs text-on-surface-variant truncate">
          {activeBreadcrumbs.map((crumb, idx) => (
            <React.Fragment key={idx}>
              {idx > 0 && <span className="material-symbols-outlined text-[14px] text-outline">chevron_right</span>}
              {crumb.href ? (
                <Link
                  href={crumb.href}
                  className={`hover:text-primary transition-colors truncate ${
                    idx === activeBreadcrumbs.length - 1 ? 'font-semibold text-primary' : ''
                  }`}
                >
                  {crumb.label}
                </Link>
              ) : (
                <span
                  className={`truncate ${
                    idx === activeBreadcrumbs.length - 1 ? 'font-semibold text-primary' : ''
                  }`}
                >
                  {crumb.label}
                </span>
              )}
            </React.Fragment>
          ))}
        </nav>
      </div>

      {/* Right: Search, Role Switcher, Notifications, User Menu */}
      <div className="flex items-center gap-3 shrink-0">
        {/* Search input (Hidden on small mobile) */}
        <div className="hidden sm:flex items-center relative">
          <span className="material-symbols-outlined absolute left-2.5 text-on-surface-variant text-[16px] pointer-events-none">
            search
          </span>
          <input
            type="text"
            placeholder="Search tasks, rooms, members... (⌘K)"
            className="w-48 md:w-64 pl-8 pr-3 py-1 bg-surface-container-low border border-surface-outline rounded text-xs text-on-surface placeholder:text-outline focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
          />
        </div>

        {/* Live IST Clock */}
        {currentISTClock && (
          <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded bg-surface-container-low border border-surface-outline text-[11px] font-mono text-primary font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-status-available animate-pulse" />
            <span>{currentISTClock}</span>
          </div>
        )}

        {/* Role Badge (read-only) */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-surface-container border border-surface-outline text-xs font-semibold text-primary">
          <span className="material-symbols-outlined text-[15px] text-secondary">admin_panel_settings</span>
          <span>{role ? role.replace('_', ' ') : 'Unassigned'}</span>
        </div>

        {/* Notification Hub Trigger */}
        <Link
          href="/notifications"
          className="relative p-1.5 rounded text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors"
          title="Notifications"
        >
          <span className="material-symbols-outlined text-[20px]">notifications</span>
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-status-blocked" />
          )}
        </Link>

        {/* User Avatar & Menu */}
        <div className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-2 p-0.5 rounded hover:bg-surface-container transition-colors"
          >
            <Avatar src={user.avatarUrl} name={user.name} size="sm" status={user.status} />
          </button>

          {showUserMenu && (
            <div className="absolute right-0 mt-1.5 w-48 bg-surface-bright border border-surface-outline rounded shadow-lg py-1 z-50 animate-in fade-in zoom-in-95 duration-100">
              <div className="px-3 py-2 border-b border-surface-outline">
                <p className="text-xs font-semibold text-primary">{user.name}</p>
                <p className="text-[10px] text-on-surface-variant truncate">{user.email}</p>
              </div>
              <Link
                href="/member/events"
                onClick={() => setShowUserMenu(false)}
                className="block px-3 py-1.5 text-xs text-on-surface hover:bg-surface-container-low"
              >
                Event Attendance
              </Link>
              <Link
                href="/login"
                onClick={() => {
                  logout();
                  setShowUserMenu(false);
                }}
                className="block px-3 py-1.5 text-xs text-status-blocked hover:bg-rose-50"
              >
                Log Out
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
