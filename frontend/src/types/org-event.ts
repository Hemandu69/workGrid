export type OrgEventStatus = 'UPCOMING' | 'LIVE' | 'AWAITING_COMPLETION' | 'COMPLETED' | 'CANCELLED';

export type EventResponseChoice = 'ATTENDING' | 'MAYBE' | 'NOT_ATTENDING';

export interface OrgEvent {
  id: string;
  organizationId: string;
  title: string;
  description: string;
  scheduledAt: string;
  scheduledEndAt: string;
  dateIST: string;
  timeIST: string;
  endTimeIST: string;
  status: OrgEventStatus;
  completedAt: string | null;
  createdById?: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  currentUserResponse: EventResponseChoice | null;
}

export interface OrgEventAnalytics {
  eventId: string;
  totalEligible: number;
  attending: number;
  maybe: number;
  notAttending: number;
  noResponse: number;
  attendanceRate: number;
}

export interface OrgEventResponder {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  role: string | null;
  respondedAt?: string;
}

export interface OrgEventResponseBreakdown {
  ATTENDING: OrgEventResponder[];
  MAYBE: OrgEventResponder[];
  NOT_ATTENDING: OrgEventResponder[];
  NO_RESPONSE: OrgEventResponder[];
}
