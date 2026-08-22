import { EventEmitter } from 'events';
import crypto from 'crypto';

export type DomainEventType =
  // Auth & Session
  | 'USER_LOGGED_IN'
  | 'USER_LOGGED_OUT'
  | 'ACCOUNT_STATUS_CHANGED'
  | 'ROLE_CHANGED'
  | 'USER_SESSION_INVALIDATED'
  // People & HR
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
  // Rooms & Operations
  | 'ROOM_STATUS_CHANGED'
  | 'SUBROOM_STATUS_CHANGED'
  | 'ROOM_ASSIGNMENT_CHANGED'
  | 'GRID_UPDATED'
  // Notifications & Announcements
  | 'NOTIFICATION_CREATED'
  | 'NOTIFICATION_READ'
  | 'ANNOUNCEMENT_CREATED'
  // Organization Events (scheduled events + attendance polling)
  | 'ORG_EVENT_CREATED'
  | 'ORG_EVENT_UPDATED'
  | 'ORG_EVENT_CANCELLED'
  | 'ORG_EVENT_RESPONSE_CHANGED'
  // Audit
  | 'AUDIT_EVENT_CREATED'
  | 'ROLE_AUDIT_CREATED';

export interface DomainEvent<T = any> {
  id: string;
  type: DomainEventType;
  organizationId: string;
  targetUserId?: string | null;
  actorId?: string | null;
  entityId?: string | null;
  payload: T;
  timestamp: string;
}

export type DomainEventInput<T = any> = Omit<DomainEvent<T>, 'id' | 'timestamp'> & {
  id?: string;
  timestamp?: string;
};

class DomainEventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(500);
  }

  publishDomainEvent<T = any>(input: DomainEventInput<T>): DomainEvent<T> {
    const event: DomainEvent<T> = {
      id: input.id || `evt_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      type: input.type,
      organizationId: input.organizationId,
      targetUserId: input.targetUserId ?? null,
      actorId: input.actorId ?? null,
      entityId: input.entityId ?? null,
      payload: input.payload,
      timestamp: input.timestamp || new Date().toISOString(),
    };

    const orgChannel = `org:${event.organizationId}`;
    this.emit(orgChannel, event);
    this.emit('*', event);

    return event;
  }

  subscribeOrganization(organizationId: string, listener: (event: DomainEvent) => void): () => void {
    const orgChannel = `org:${organizationId}`;
    this.on(orgChannel, listener);
    return () => {
      this.off(orgChannel, listener);
    };
  }

  subscribeAll(listener: (event: DomainEvent) => void): () => void {
    this.on('*', listener);
    return () => {
      this.off('*', listener);
    };
  }
}

export const domainEventBus = new DomainEventBus();
export const publishDomainEvent = <T = any>(input: DomainEventInput<T>) => domainEventBus.publishDomainEvent(input);
