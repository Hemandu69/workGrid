export type AnnouncementStatus = 'DRAFT' | 'PUBLISHED' | 'SCHEDULED' | 'ARCHIVED';

export type AudienceScope = 'GLOBAL' | 'ADMINS_ONLY' | 'SERVERS_AND_MEMBERS' | 'ROOM_SPECIFIC';

export interface Announcement {
  id: string;
  title: string;
  content: string;
  status: AnnouncementStatus;
  scope: AudienceScope;
  targetRoom?: string;
  authorName: string;
  authorRole: string;
  publishedAt?: string;
  scheduledFor?: string;
  createdAt: string;
  pinned: boolean;
}
