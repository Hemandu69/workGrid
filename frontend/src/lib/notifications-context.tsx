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
  const { isAuthenticated, user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [events, setEvents] = useState<OrgEvent[]>([]);
  const seenIds = useRef<Set<string>>(new Set());

  const refreshEvents = useCallback(() => {
    apiClient
      .getEvents()
      .then((data) => {
        if (Array.isArray(data)) {
          setEvents(
            data.filter((e) => e.status === 'UPCOMING' || e.status === 'LIVE' || e.status === 'AWAITING_COMPLETION')
          );
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
      .getAnnouncements({ limit: 50 })
      .then((result) => {
        result.items.forEach((a) =>
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
      })
      .catch(() => {});

    refreshEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  useDomainEvent<{ title?: string; content?: string }>(
    ['NOTIFICATION_CREATED', 'ANNOUNCEMENT_CREATED', 'EMPLOYEE_APPROVED'],
    (event) => {
      const payload = event.payload || {};
      addNotification({
        id: `notif-${event.id}`,
        type: 'ANNOUNCEMENT',
        title:
          event.type === 'ANNOUNCEMENT_CREATED'
            ? `Announcement: ${payload.title || 'Company Notice'}`
            : 'System Update',
        message: payload.content || payload.title || 'You have a new real-time notification.',
        read: false,
        createdAt: event.timestamp || new Date().toISOString(),
        priority: 'HIGH',
      });
    }
  );

  // Task events — Socket.IO already gatekeeps delivery to the assignee,
  // creator, admins and operations-scoped roles, so anything received here is
  // meant to be seen; no further per-user filtering is needed.
  useDomainEvent<{
    taskId?: string;
    taskIdDisplay?: string;
    title?: string;
    task?: { title?: string; id?: string };
    assigneeId?: string;
    assigneeName?: string;
    previousAssigneeName?: string;
    newAssigneeName?: string;
  }>(
    ['TASK_ASSIGNED', 'TASK_REASSIGNED', 'TASK_COMPLETED', 'TASK_CANCELLED'],
    (event) => {
      const payload = event.payload || {};
      const taskTitle = payload.title || payload.task?.title || 'a task';
      const isMine = payload.assigneeId === user?.id || event.targetUserId === user?.id;

      let title = 'Task Update';
      let message = `${taskTitle} was updated.`;

      switch (event.type) {
        case 'TASK_ASSIGNED':
          title = isMine ? 'New Task Assigned to You' : 'Task Assigned';
          message = isMine
            ? `You were assigned: ${taskTitle}`
            : `${payload.assigneeName || 'A team member'} was assigned: ${taskTitle}`;
          break;
        case 'TASK_REASSIGNED':
          title = 'Task Reassigned';
          message = `${taskTitle} moved from ${payload.previousAssigneeName || 'unassigned'} to ${payload.newAssigneeName || 'someone'}.`;
          break;
        case 'TASK_COMPLETED':
          title = 'Task Completed';
          message = `${taskTitle} was marked complete.`;
          break;
        case 'TASK_CANCELLED':
          title = 'Task Cancelled';
          message = `${taskTitle} was cancelled.`;
          break;
      }

      addNotification({
        id: `notif-${event.id}`,
        type: 'TASK_ASSIGNED',
        title,
        message,
        read: false,
        createdAt: event.timestamp || new Date().toISOString(),
        priority: isMine ? 'HIGH' : 'NORMAL',
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

  useDomainEvent(
    ['ORG_EVENT_UPDATED', 'ORG_EVENT_CANCELLED', 'ORG_EVENT_COMPLETED', 'ORG_EVENT_RESPONSE_CHANGED'],
    () => {
      refreshEvents();
    }
  );

  // Light periodic refresh so a purely time-based transition (e.g. an event
  // starting) eventually shows here too, without requiring a manual reload.
  useEffect(() => {
    if (!isAuthenticated) return;
    const interval = setInterval(refreshEvents, 60000);
    return () => clearInterval(interval);
  }, [isAuthenticated, refreshEvents]);

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
