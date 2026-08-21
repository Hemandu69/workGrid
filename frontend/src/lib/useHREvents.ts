'use client';

import { useEffect, useRef } from 'react';
import { User, RoleAuditLog } from '../types/auth';
import { useDomainEvent } from './realtime-context';

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
  const onEventRef = useRef(onEvent);
  const onReconnectRef = useRef(onReconnect);

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    onReconnectRef.current = onReconnect;
  }, [onReconnect]);

  useDomainEvent<{ user?: User; audit?: RoleAuditLog } & Partial<User>>(
    [
      'EMPLOYEE_REGISTERED',
      'EMPLOYEE_PENDING',
      'ROLE_CHANGED',
      'ACCOUNT_STATUS_CHANGED',
      'EMPLOYEE_APPROVED',
      'EMPLOYEE_DEACTIVATED',
      'EMPLOYEE_SUSPENDED',
    ],
    (event) => {
      if (!enabled) return;
      const payload = event.payload || {};
      const hrEvent: HREvent = {
        type: event.type as HREvent['type'],
        organizationId: event.organizationId,
        user: payload.user || (payload.id ? (payload as User) : undefined),
        audit: payload.audit,
        createdAt: event.timestamp,
      };
      onEventRef.current?.(hrEvent);
    }
  );
}
