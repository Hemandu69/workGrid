import React, { useState } from 'react';
import { Announcement } from '../../types/announcement';
import { Badge } from '../ui/Badge';
import { useAsyncAction } from '../../lib/useAsyncAction';

interface AnnouncementCardProps {
  announcement: Announcement;
  /** Shows edit/pin/delete controls — only pass true from an authorized management surface. */
  canManage?: boolean;
  onEdit?: (announcement: Announcement) => void;
  onDelete?: (announcement: Announcement) => Promise<void>;
  onTogglePin?: (announcement: Announcement) => Promise<void>;
}

export function AnnouncementCard({ announcement, canManage, onEdit, onDelete, onTogglePin }: AnnouncementCardProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const deleteAction = useAsyncAction(async () => {
    await onDelete?.(announcement);
    setConfirmingDelete(false);
  });
  const pinAction = useAsyncAction(async () => {
    await onTogglePin?.(announcement);
  });

  const scopeLabels: Record<string, string> = {
    GLOBAL: 'Global All Sections',
    ADMINS_ONLY: 'Administrators Only',
    ROOM_SPECIFIC: `Section ${announcement.targetRoom || 'Specific'}`,
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

        {canManage && (
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => onEdit?.(announcement)}
              className="p-1 rounded text-on-surface-variant hover:text-primary hover:bg-surface-container-low transition-colors"
              title="Edit announcement"
            >
              <span className="material-symbols-outlined text-[16px]">edit</span>
            </button>
            <button
              type="button"
              onClick={() => pinAction.run()}
              disabled={pinAction.isPending}
              className="p-1 rounded text-on-surface-variant hover:text-primary hover:bg-surface-container-low transition-colors disabled:opacity-50"
              title={announcement.pinned ? 'Unpin announcement' : 'Pin announcement'}
            >
              <span className="material-symbols-outlined text-[16px]">
                {announcement.pinned ? 'keep_off' : 'push_pin'}
              </span>
            </button>
            {confirmingDelete ? (
              <span className="flex items-center gap-1 text-[11px]">
                <button
                  type="button"
                  onClick={() => deleteAction.run()}
                  disabled={deleteAction.isPending}
                  className="px-1.5 py-0.5 rounded bg-status-blocked text-white font-semibold disabled:opacity-50"
                >
                  {deleteAction.isPending ? 'Deleting...' : 'Confirm'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  className="px-1.5 py-0.5 rounded text-on-surface-variant hover:text-on-surface"
                >
                  Cancel
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className="p-1 rounded text-on-surface-variant hover:text-status-blocked hover:bg-surface-container-low transition-colors"
                title="Delete announcement"
              >
                <span className="material-symbols-outlined text-[16px]">delete</span>
              </button>
            )}
          </div>
        )}
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
