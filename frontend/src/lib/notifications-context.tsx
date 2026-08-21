'use client';

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { apiClient } from './api-client';
import { useDomainEvent } from './realtime-context';
import { useAuth } from './auth-context';
import { AppNotification } from '../types/notification';
import { OrgEvent } from '../types/org-event';

interface NotificationsContextType {
  notifications: AppNotification[];
  unreadCount: number;
  events: OrgEvent[];
  markAllRead: () => void;
  markRead: (id: string) => void;
  refreshEvents: () => void;
}

const NotificationsContext = createContext<NotificationsContextType | null>(null);

/**
 * Single authoritative source for the notification feed and unread count, shared
 * by the Sidebar badge, the header indicator, and the Notifications page — so
 * none of them can drift into a hardcoded/stale value.
 */
export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [events, setEvents] = useState<OrgEvent[]>([]);
  const seenIds = useRef<Set<string>>(new Set());

  const refreshEvents = useCallback(() => {
    apiClient
      .getEvents()
      .then((data) => {
        if (Array.isArray(data)) {
          setEvents(data.filter((e) => e.status === 'UPCOMING' || e.status === 'LIVE'));
        }
      })
      .catch(() => {});
  }, []);

  const addNotification = useCallback((notif: AppNotification) => {
    if (seenIds.current.has(notif.id)) return;
    seenIds.current.add(notif.id);
    setNotifications((prev) => [notif, ...prev]);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      setNotifications([]);
      setEvents([]);
      seenIds.current.clear();
      return;
    }

    apiClient
      .getAnnouncements()
      .then((anns) => {
        if (Array.isArray(anns)) {
          anns.forEach((a) =>
            addNotification({
              id: `ann-${a.id}`,
              type: 'ANNOUNCEMENT',
              title: `Announcement: ${a.title}`,
              message: a.content,
              read: false,
              createdAt: a.createdAt,
              priority: 'NORMAL',
            })
          );
        }
      })
      .catch(() => {});

    refreshEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  useDomainEvent<{ title?: string; content?: string }>(
    ['NOTIFICATION_CREATED', 'ANNOUNCEMENT_CREATED', 'TASK_ASSIGNED', 'EMPLOYEE_APPROVED'],
    (event) => {
      const payload = event.payload || {};
      addNotification({
        id: `notif-${event.id}`,
        type: event.type === 'ANNOUNCEMENT_CREATED' ? 'ANNOUNCEMENT' : 'TASK_ASSIGNED',
        title:
          event.type === 'ANNOUNCEMENT_CREATED'
            ? `Announcement: ${payload.title || 'Company Notice'}`
            : 'Task Assignment / System Update',
        message: payload.content || payload.title || 'You have a new real-time notification.',
        read: false,
        createdAt: event.timestamp || new Date().toISOString(),
        priority: 'HIGH',
      });
    }
  );

  useDomainEvent<{ event?: OrgEvent }>(['ORG_EVENT_CREATED'], (event) => {
    const eventTitle = event.payload?.event?.title || 'Organization Event';
    addNotification({
      id: `notif-${event.id}`,
      type: 'EVENT',
      title: `Event: ${eventTitle}`,
      message: "You're invited to this organization event. Respond below.",
      read: false,
      createdAt: event.timestamp || new Date().toISOString(),
      priority: 'HIGH',
    });
    refreshEvents();
  });

  useDomainEvent(['ORG_EVENT_UPDATED', 'ORG_EVENT_CANCELLED', 'ORG_EVENT_RESPONSE_CHANGED'], () => {
    refreshEvents();
  });

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const markRead = useCallback((id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <NotificationsContext.Provider
      value={{ notifications, unreadCount, events, markAllRead, markRead, refreshEvents }}
    >
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    throw new Error('useNotifications must be used within a NotificationsProvider');
  }
  return ctx;
}
