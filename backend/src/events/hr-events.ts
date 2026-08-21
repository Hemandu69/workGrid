import { EventEmitter } from 'events';

export type HREventType =
  | 'EMPLOYEE_REGISTERED'
  | 'EMPLOYEE_PENDING'
  | 'ROLE_CHANGED'
  | 'ACCOUNT_STATUS_CHANGED'
  | 'EMPLOYEE_APPROVED'
  | 'EMPLOYEE_DEACTIVATED'
  | 'EMPLOYEE_SUSPENDED';

export interface HREventUserPayload {
  id: string;
  name: string;
  email: string;
  title?: string | null;
  role?: string | null;
  accountStatus: string;
  status?: string | null;
  avatarUrl?: string | null;
  capacityLimitHours?: number | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface HREventAuditPayload {
  id: string;
  targetUserId: string;
  targetUserName?: string;
  targetUserEmail?: string;
  targetUserAvatar?: string | null;
  changedById: string;
  changedByName?: string;
  changedByRole?: string;
  previousRole?: string | null;
  newRole: string;
  reason?: string | null;
  createdAt: string | Date;
}

export interface HREvent {
  type: HREventType;
  organizationId: string;
  user: HREventUserPayload;
  audit?: HREventAuditPayload;
  createdAt: string;
}

import { domainEventBus } from './domain-events.js';

class HREventEmitter extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(200);
  }

  emitHREvent(organizationId: string, event: HREvent): boolean {
    const channel = `hr-events:${organizationId}`;
    domainEventBus.publishDomainEvent({
      type: event.type,
      organizationId,
      entityId: event.user?.id,
      targetUserId: event.user?.id,
      payload: {
        user: event.user,
        audit: event.audit,
      },
      timestamp: event.createdAt,
    });
    return this.emit(channel, event);
  }

  subscribeHREvents(organizationId: string, listener: (event: HREvent) => void): () => void {
    const channel = `hr-events:${organizationId}`;
    this.on(channel, listener);
    return () => {
      this.off(channel, listener);
    };
  }
}

export const hrEventBus = new HREventEmitter();
