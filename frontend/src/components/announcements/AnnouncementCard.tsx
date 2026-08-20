import React from 'react';
import { Announcement } from '../../types/announcement';
import { Badge } from '../ui/Badge';

interface AnnouncementCardProps {
  announcement: Announcement;
}

export function AnnouncementCard({ announcement }: AnnouncementCardProps) {
  const scopeLabels = {
    GLOBAL: 'Global All Sectors',
    ADMINS_ONLY: 'Admins Only',
    SERVERS_AND_MEMBERS: 'Servers & Members',
    ROOM_SPECIFIC: `Sector ${announcement.targetRoom || 'Specific'}`,
  };

  return (
    <div
      className={`bg-surface-bright border rounded p-5 relative overflow-hidden transition-all space-y-3 ${
        announcement.pinned
          ? 'border-primary ring-1 ring-primary/10 shadow-xs'
          : 'border-surface-outline hover:border-slate-400'
      }`}
    >
      {announcement.pinned && (
        <div className="absolute top-0 right-0 bg-primary text-on-primary px-2.5 py-0.5 rounded-bl text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
          <span className="material-symbols-outlined text-[12px]">push_pin</span>
          Pinned Announcement
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{scopeLabels[announcement.scope]}</Badge>
        <Badge
          status={
            announcement.status === 'PUBLISHED'
              ? 'AVAILABLE'
              : announcement.status === 'DRAFT'
              ? 'UNAVAILABLE'
              : 'PREFERRED'
          }
        >
          {announcement.status}
        </Badge>
      </div>

      <div>
        <h3 className="text-base font-bold text-primary leading-snug">{announcement.title}</h3>
        <p className="text-xs text-on-surface leading-relaxed mt-2 bg-surface-container-low/60 p-3 rounded border border-surface-outline">
          {announcement.content}
        </p>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-surface-outline text-xs text-on-surface-variant">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-primary">{announcement.authorName}</span>
          <span className="text-[10px]">({announcement.authorRole})</span>
        </div>
        <span className="font-mono text-[11px]">
          {announcement.publishedAt
            ? `Published ${new Date(announcement.publishedAt).toLocaleDateString()}`
            : `Created ${new Date(announcement.createdAt).toLocaleDateString()}`}
        </span>
      </div>
    </div>
  );
}
