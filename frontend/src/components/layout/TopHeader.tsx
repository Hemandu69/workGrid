'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '../../lib/auth-context';
import { UserRole } from '../../types/auth';
import { Avatar } from '../ui/Avatar';

interface TopHeaderProps {
  breadcrumbs?: Array<{ label: string; href?: string }>;
  onToggleMobileSidebar?: () => void;
}

export function TopHeader({ breadcrumbs, onToggleMobileSidebar }: TopHeaderProps) {
  const { user, role, setRole, logout } = useAuth();
  const [showRoleMenu, setShowRoleMenu] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  const defaultBreadcrumbs = [
    { label: 'WorkGrid', href: '/' },
    { label: user.room || 'Sector Operations', href: '#' },
    { label: user.subroom ? `Subroom ${user.subroom}` : role.replace('_', ' ') },
  ];

  const activeBreadcrumbs = breadcrumbs || defaultBreadcrumbs;

  const roleOptions: Array<{ role: UserRole; label: string; desc: string }> = [
    { role: 'SUPER_ADMIN', label: 'Super Admin', desc: 'Global monitoring, announcements & org health' },
    { role: 'ADMIN', label: 'Admin', desc: 'Assign & monitor work for all servers & members' },
    { role: 'SERVER', label: 'Server / Team Lead', desc: 'Manage & assign only inside own room (Room B)' },
    { role: 'MEMBER', label: 'Member', desc: 'Manage availability, subroom B3 tasks' },
  ];

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

        {/* Role Switcher Button */}
        <div className="relative">
          <button
            onClick={() => setShowRoleMenu(!showRoleMenu)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-surface-container border border-surface-outline text-xs font-semibold text-primary hover:bg-surface-container-high transition-colors"
          >
            <span className="material-symbols-outlined text-[15px] text-secondary">admin_panel_settings</span>
            <span className="hidden md:inline">Role:</span>
            <span>{role.replace('_', ' ')}</span>
            <span className="material-symbols-outlined text-[14px]">arrow_drop_down</span>
          </button>

          {showRoleMenu && (
            <div className="absolute right-0 mt-1.5 w-64 bg-surface-bright border border-surface-outline rounded shadow-lg py-1 z-50 animate-in fade-in zoom-in-95 duration-100">
              <div className="px-3 py-1.5 border-b border-surface-outline text-[10px] uppercase font-bold text-on-surface-variant">
                Switch Preview Role
              </div>
              {roleOptions.map((opt) => (
                <button
                  key={opt.role}
                  onClick={() => {
                    setRole(opt.role);
                    setShowRoleMenu(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-xs hover:bg-surface-container-low transition-colors flex flex-col ${
                    role === opt.role ? 'bg-secondary-container/40 font-semibold' : ''
                  }`}
                >
                  <span className="text-primary font-medium">{opt.label}</span>
                  <span className="text-[10px] text-on-surface-variant">{opt.desc}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Notification Hub Trigger */}
        <Link
          href="/notifications"
          className="relative p-1.5 rounded text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors"
          title="Notifications"
        >
          <span className="material-symbols-outlined text-[20px]">notifications</span>
          <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-status-blocked" />
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
                href="/member/availability"
                onClick={() => setShowUserMenu(false)}
                className="block px-3 py-1.5 text-xs text-on-surface hover:bg-surface-container-low"
              >
                My Schedule
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
