'use client';

import React, { useState } from 'react';
import { AppShell } from '../../components/layout/AppShell';
import { AppNotification } from '../../types/notification';
import { useNotifications } from '../../lib/notifications-context';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { EventCard } from '../../components/events/EventCard';
import Link from 'next/link';

export default function NotificationsPage() {
  const { notifications, events, markAllRead, markRead, refreshEvents, isMarkingAll, isMarkingRead } =
    useNotifications();
  const [tab, setTab] = useState<'ALL' | 'UNREAD'>('ALL');
  const unreadCount = notifications.filter((n) => !n.read).length;

  const filtered = notifications.filter((n) => tab === 'ALL' || !n.read);

  const getIconForType = (type: AppNotification['type']) => {
    switch (type) {
      case 'TASK_ASSIGNED':
        return 'assignment_add';
      case 'TASK_COMMENT':
        return 'comment';
      case 'ANNOUNCEMENT':
        return 'campaign';
      case 'EVENT':
        return 'event_upcoming';
      case 'CAPACITY_WARNING':
        return 'warning';
      default:
        return 'notifications';
    }
  };

  return (
    <AppShell
      breadcrumbs={[
        { label: 'WorkGrid', href: '/' },
        { label: 'Notifications Hub' },
      ]}
    >
      <div className="space-y-6 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-surface-outline pb-4">
          <div>
            <h1 className="text-xl font-bold text-primary tracking-tight">
              Enterprise Notification Hub
            </h1>
            <p className="text-xs text-on-surface-variant mt-1">
              Real-time dispatches, capacity warnings, comments, and global announcements.
            </p>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={markAllRead}
            isLoading={isMarkingAll}
            disabled={isMarkingAll || unreadCount === 0}
          >
            Mark All as Read
          </Button>
        </div>

        {/* Tab Filters */}
        <div className="flex items-center gap-4 border-b border-surface-outline text-xs">
          <button
            onClick={() => setTab('ALL')}
            className={`pb-2 font-semibold uppercase tracking-wider transition-all border-b-2 ${
              tab === 'ALL'
                ? 'border-primary text-primary'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            All Notifications ({notifications.length})
          </button>
          <button
            onClick={() => setTab('UNREAD')}
            className={`pb-2 font-semibold uppercase tracking-wider transition-all border-b-2 flex items-center gap-1.5 ${
              tab === 'UNREAD'
                ? 'border-primary text-primary'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <span>Unread Only</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-status-blocked text-white">
              {unreadCount}
            </span>
          </button>
        </div>

        {/* Upcoming Organization Events — separate section from the announcement/notification feed */}
        {events.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-xs font-bold text-on-surface uppercase tracking-wider flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px] text-primary">event_upcoming</span>
              Upcoming Events
            </h2>
            <div className="space-y-3">
              {events.map((e) => (
                <EventCard key={e.id} event={e} onResponseChange={() => refreshEvents()} />
              ))}
            </div>
          </section>
        )}

        {/* Notification Feed */}
        <div className="space-y-3">
          {filtered.length === 0 ? (
            <div className="p-8 text-center bg-surface-bright border border-surface-outline rounded text-xs text-on-surface-variant">
              No notifications to display.
            </div>
          ) : (
            filtered.map((notif) => (
              <div
                key={notif.id}
                className={`p-4 rounded border transition-all flex items-start justify-between gap-4 ${
                  notif.read
                    ? 'bg-surface-bright border-surface-outline'
                    : 'bg-blue-50/40 border-blue-200 shadow-xs'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`p-2 rounded border shrink-0 ${
                      notif.read
                        ? 'bg-surface-container-low border-surface-outline text-on-surface-variant'
                        : 'bg-primary text-on-primary border-primary'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      {getIconForType(notif.type)}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-bold text-primary">{notif.title}</h4>
                      {!notif.read && (
                        <span className="w-1.5 h-1.5 rounded-full bg-status-blocked shrink-0" />
                      )}
                      {notif.priority === 'HIGH' && <Badge priority="HIGH" />}
                    </div>
                    <p className="text-xs text-on-surface leading-relaxed">{notif.message}</p>
                    <span className="text-[10px] font-mono text-on-surface-variant block">
                      {new Date(notif.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {notif.link && (
                    <Link href={notif.link}>
                      <Button variant="outline" size="sm">
                        View
                      </Button>
                    </Link>
                  )}

                  {notif.read ? (
                    <span className="text-[11px] font-medium text-on-surface-variant px-1">Read</span>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => markRead(notif.id)}
                      isLoading={isMarkingRead(notif.id)}
                      disabled={isMarkingRead(notif.id)}
                      aria-label={`Mark notification "${notif.title}" as read`}
                      title="Mark this notification as read"
                    >
                      Mark as read
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </AppShell>
  );
}
