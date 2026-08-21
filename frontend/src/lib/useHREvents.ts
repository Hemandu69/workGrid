'use client';

import { useEffect, useRef } from 'react';
import { User, RoleAuditLog } from '../types/auth';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export interface HREvent {
  type:
    | 'CONNECTED'
    | 'EMPLOYEE_REGISTERED'
    | 'EMPLOYEE_PENDING'
    | 'ROLE_CHANGED'
    | 'ACCOUNT_STATUS_CHANGED'
    | 'EMPLOYEE_APPROVED'
    | 'EMPLOYEE_DEACTIVATED'
    | 'EMPLOYEE_SUSPENDED';
  organizationId: string;
  user?: User;
  audit?: RoleAuditLog;
  createdAt: string;
}

interface UseHREventsOptions {
  onEvent?: (event: HREvent) => void;
  onReconnect?: () => void;
  enabled?: boolean;
}

export function useHREvents({ onEvent, onReconnect, enabled = true }: UseHREventsOptions = {}) {
  const eventSourceRef = useRef<EventSource | null>(null);
  const onEventRef = useRef(onEvent);
  const onReconnectRef = useRef(onReconnect);
  const isReconnectingRef = useRef(false);

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    onReconnectRef.current = onReconnect;
  }, [onReconnect]);

  useEffect(() => {
    if (!enabled) return;

    let isMounted = true;
    let fallbackInterval: NodeJS.Timeout | null = null;

    function connect() {
      try {
        const streamUrl = `${API_BASE_URL.replace(/\/$/, '')}/api/v1/hr/events`;
        const es = new EventSource(streamUrl, { withCredentials: true });
        eventSourceRef.current = es;

        es.onopen = () => {
          if (isReconnectingRef.current) {
            isReconnectingRef.current = false;
            onReconnectRef.current?.();
          }
        };

        es.onmessage = (messageEvent) => {
          if (!isMounted) return;
          try {
            if (!messageEvent.data || messageEvent.data.trim() === '') return;
            const data: HREvent = JSON.parse(messageEvent.data);
            if (data && data.type !== 'CONNECTED') {
              onEventRef.current?.(data);
            }
          } catch {
            // Ignore non-JSON heartbeat messages
          }
        };

        es.onerror = () => {
          isReconnectingRef.current = true;
          // If EventSource enters CLOSED state, schedule a reconnect retry
          if (es.readyState === EventSource.CLOSED && isMounted) {
            es.close();
            setTimeout(() => {
              if (isMounted) connect();
            }, 3000);
          }
        };
      } catch {
        // Fallback lightweight polling if SSE cannot be initiated
        fallbackInterval = setInterval(() => {
          if (isMounted) onReconnectRef.current?.();
        }, 12000);
      }
    }

    connect();

    return () => {
      isMounted = false;
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (fallbackInterval) {
        clearInterval(fallbackInterval);
      }
    };
  }, [enabled]);
}
