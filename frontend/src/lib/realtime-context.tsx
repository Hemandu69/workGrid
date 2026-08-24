'use client';

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './auth-context';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export type DomainEventType =
  // Auth & Session
  | 'CONNECTED'
  | 'USER_LOGGED_IN'
  | 'USER_LOGGED_OUT'
  | 'ACCOUNT_STATUS_CHANGED'
  | 'ROLE_CHANGED'
  | 'USER_SESSION_INVALIDATED'
  | 'SESSION_REVOKED'
  // People Management
  | 'EMPLOYEE_REGISTERED'
  | 'EMPLOYEE_PENDING'
  | 'EMPLOYEE_APPROVED'
  | 'EMPLOYEE_UPDATED'
  | 'EMPLOYEE_SUSPENDED'
  | 'EMPLOYEE_DEACTIVATED'
  // Attendance & Presence
  | 'EMPLOYEE_CHECKED_IN'
  | 'EMPLOYEE_CHECKED_OUT'
  | 'ATTENDANCE_UPDATED'
  | 'AVAILABILITY_CHANGED'
  | 'PRESENCE_CHANGED'
  | 'LOCATION_CHANGED'
  // Tasks
  | 'TASK_CREATED'
  | 'TASK_ASSIGNED'
  | 'TASK_REASSIGNED'
  | 'TASK_UPDATED'
  | 'TASK_COMPLETED'
  | 'TASK_CANCELLED'
  | 'TASK_STATUS_CHANGED'
  | 'TASK_PROGRESS_CHANGED'
  | 'TASK_REOPENED'
  // Rooms & Operations
  | 'ROOM_STATUS_CHANGED'
  | 'SUBROOM_STATUS_CHANGED'
  | 'ROOM_ASSIGNMENT_CHANGED'
  | 'GRID_UPDATED'
  // Teams & Event-Scoped Placement
  | 'TEAM_EVENT_PLACEMENT_CHANGED'
  // Events & Supervision
  | 'EVENT_CREATED'
  | 'EVENT_UPDATED'
  | 'EVENT_STARTED'
  | 'EVENT_ENDED'
  | 'EVENT_SERVER_PRESENCE_CHANGED'
  // Notifications & Announcements
  | 'NOTIFICATION_CREATED'
  | 'NOTIFICATION_READ'
  | 'ANNOUNCEMENT_CREATED'
  | 'ANNOUNCEMENT_UPDATED'
  | 'ANNOUNCEMENT_DELETED'
  | 'ANNOUNCEMENT_PINNED'
  | 'ANNOUNCEMENT_UNPINNED'
  // Organization Events (scheduled events + attendance polling) — distinct
  // from the room/company supervisory EVENT_* types above.
  | 'ORG_EVENT_CREATED'
  | 'ORG_EVENT_UPDATED'
  | 'ORG_EVENT_CANCELLED'
  | 'ORG_EVENT_COMPLETED'
  | 'ORG_EVENT_RESPONSE_CHANGED'
  // Audit
  | 'AUDIT_EVENT_CREATED'
  | 'ROLE_AUDIT_CREATED';

export interface DomainEvent<T = unknown> {
  id: string;
  type: DomainEventType;
  organizationId: string;
  targetUserId?: string | null;
  actorId?: string | null;
  entityId?: string | null;
  payload: T;
  timestamp: string;
}

type EventListener = (event: DomainEvent) => void;

interface RealtimeContextType {
  socket: Socket | null;
  isConnected: boolean;
  subscribe: (eventTypes: DomainEventType[] | '*', listener: EventListener) => () => void;
}

const RealtimeContext = createContext<RealtimeContextType | null>(null);

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const { user, refreshUser } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const listenersRef = useRef<Map<string, Set<EventListener>>>(new Map());
  const processedEventIds = useRef<Set<string>>(new Set());
  const socketRef = useRef<Socket | null>(null);

  const dispatchEvent = useCallback(
    (event: DomainEvent) => {
      if (!event || !event.type) return;

      // Deduplicate by unique event ID
      if (event.id) {
        if (processedEventIds.current.has(event.id)) return;
        processedEventIds.current.add(event.id);
        if (processedEventIds.current.size > 2000) {
          const first = processedEventIds.current.values().next().value;
          if (first) processedEventIds.current.delete(first);
        }
      }

      // If event impacts current user's role, status, or room assignment, update session
      if (
        (event.type === 'ROLE_CHANGED' ||
          event.type === 'ACCOUNT_STATUS_CHANGED' ||
          event.type === 'USER_SESSION_INVALIDATED' ||
          event.type === 'SESSION_REVOKED' ||
          event.type === 'EMPLOYEE_APPROVED' ||
          event.type === 'ROOM_ASSIGNMENT_CHANGED') &&
        event.targetUserId === user?.id
      ) {
        refreshUser().catch(() => null);
      }

      // Notify specific event listeners
      const specific = listenersRef.current.get(event.type);
      if (specific) {
        specific.forEach((fn) => {
          try {
            fn(event);
          } catch (err) {
            console.error('Error in Socket.IO event listener:', err);
          }
        });
      }

      // Notify wildcard listeners
      const wildcard = listenersRef.current.get('*');
      if (wildcard) {
        wildcard.forEach((fn) => {
          try {
            fn(event);
          } catch (err) {
            console.error('Error in wildcard Socket.IO listener:', err);
          }
        });
      }
    },
    [user?.id, refreshUser]
  );

  useEffect(() => {
    // Only connect if user is authenticated and not suspended/deactivated
    if (!user || user.accountStatus === 'SUSPENDED' || user.accountStatus === 'DEACTIVATED') {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      setIsConnected(false);
      return;
    }

    const socketUrl = API_BASE_URL.replace(/\/+$/, '');
    const socket = io(socketUrl, {
      path: '/socket.io',
      withCredentials: true,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      autoConnect: true,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    socket.on('connect_error', () => {
      setIsConnected(false);
    });

    // Listen to generic DOMAIN_EVENT broadcasts
    socket.on('DOMAIN_EVENT', (event: DomainEvent) => {
      dispatchEvent(event);
    });

    // Catch individual event types directly if emitted on root
    socket.onAny((eventName: string, ...args: unknown[]) => {
      if (eventName !== 'DOMAIN_EVENT' && eventName !== 'CONNECTED' && args.length > 0) {
        const event = args[0] as DomainEvent;
        if (event && event.type) {
          dispatchEvent(event);
        }
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setIsConnected(false);
    };
    // Depend on the specific fields this effect actually reads (id,
    // accountStatus), not the whole user object — refreshUser() gives that
    // object a new reference on every call even when nothing relevant
    // changed, which previously tore down and reconnected the socket far
    // more often than necessary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.accountStatus, dispatchEvent]);

  const subscribe = useCallback((eventTypes: DomainEventType[] | '*', listener: EventListener) => {
    const types = Array.isArray(eventTypes) ? eventTypes : [eventTypes];
    types.forEach((type) => {
      if (!listenersRef.current.has(type)) {
        listenersRef.current.set(type, new Set());
      }
      listenersRef.current.get(type)!.add(listener);
    });

    return () => {
      types.forEach((type) => {
        const set = listenersRef.current.get(type);
        if (set) {
          set.delete(listener);
          if (set.size === 0) listenersRef.current.delete(type);
        }
      });
    };
  }, []);

  return (
    <RealtimeContext.Provider value={{ socket: socketRef.current, isConnected, subscribe }}>
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtime() {
  const context = useContext(RealtimeContext);
  return context;
}

export function useDomainEvent<T = unknown>(
  eventType: DomainEventType | DomainEventType[],
  callback: (event: DomainEvent<T>) => void
) {
  const realtime = useContext(RealtimeContext);
  const cbRef = useRef(callback);

  // Always keep the callback ref fresh so the subscription closure is never stale
  useEffect(() => {
    cbRef.current = callback;
  });

  // Stabilize the subscription key: only re-subscribe when the event types actually change
  const eventTypeKey = Array.isArray(eventType) ? eventType.slice().sort().join(',') : eventType;

  useEffect(() => {
    if (!realtime) return;
    const types = Array.isArray(eventType) ? eventType : [eventType];
    return realtime.subscribe(types, (event) => {
      cbRef.current(event as DomainEvent<T>);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [realtime, eventTypeKey]);
}

