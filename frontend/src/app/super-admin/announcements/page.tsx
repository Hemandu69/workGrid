'use client';

import React, { useState } from 'react';
import { AppShell } from '../../../components/layout/AppShell';
import { AnnouncementCard } from '../../../components/announcements/AnnouncementCard';
import { CreateAnnouncementModal } from '../../../components/announcements/CreateAnnouncementModal';
import { EventsManagementView } from '../../../components/events/EventsManagementView';
import { Button } from '../../../components/ui/Button';
import { Announcement } from '../../../types/announcement';
import { apiClient } from '../../../lib/api-client';
import { useAnnouncements } from '../../../lib/useAnnouncements';
import { useAuth } from '../../../lib/auth-context';

type AnnouncementsTab = 'ALL' | 'PUBLISHED' | 'DRAFT' | 'EVENTS';

export default function SuperAdminAnnouncementsPage() {
  const { role } = useAuth();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null);
  const [tab, setTab] = useState<AnnouncementsTab>('ALL');

  const { data, isLoading } = useAnnouncements({ limit: 100 });
  const announcements = data?.items ?? [];

  const canManage = role === 'ADMIN' || role === 'SUPER_ADMIN';

  const filtered = announcements.filter(
    (a) => tab === 'ALL' || tab === 'EVENTS' || a.status === tab
  );

  const dashboardHref = role === 'ADMIN' ? '/admin' : '/super-admin';
  const dashboardLabel = role === 'ADMIN' ? 'Admin' : 'Super Admin';

  const handleCloseModal = () => {
    setIsCreateOpen(false);
    setEditingAnnouncement(null);
  };

  const handleEdit = (announcement: Announcement) => {
    setEditingAnnouncement(announcement);
    setIsCreateOpen(true);
  };

  const handleDelete = async (announcement: Announcement) => {
    await apiClient.deleteAnnouncement(announcement.id);
  };

  const handleTogglePin = async (announcement: Announcement) => {
    await apiClient.setAnnouncementPinned(announcement.id, !announcement.pinned);
  };

  return (
    <AppShell
      breadcrumbs={[
        { label: 'WorkGrid', href: '/' },
        { label: dashboardLabel, href: dashboardHref },
        { label: 'Announcements & Events' },
      ]}
    >
      <div className="space-y-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-surface-outline pb-4">
          <div>
            <h1 className="text-xl font-bold text-primary tracking-tight">
              Announcements & Events
            </h1>
            <p className="text-xs text-on-surface-variant mt-1">
              Publish organization notices and schedule events in one place.
            </p>
          </div>

          {tab !== 'EVENTS' && (
            <Button
              variant="primary"
              size="md"
              onClick={() => setIsCreateOpen(true)}
              leftIcon={<span className="material-symbols-outlined text-[16px]">add</span>}
            >
              New Announcement
            </Button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2 border-b border-surface-outline">
          {(['ALL', 'PUBLISHED', 'DRAFT', 'EVENTS'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`pb-2 px-3 text-xs font-semibold uppercase tracking-wider transition-all border-b-2 ${
                tab === t
                  ? 'border-primary text-primary'
                  : 'border-transparent text-on-surface-variant hover:text-on-surface'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {tab === 'EVENTS' ? (
          <EventsManagementView />
        ) : (
          <div className="space-y-4">
            {isLoading ? (
              <p className="text-xs text-on-surface-variant text-center py-8">Loading announcements...</p>
            ) : filtered.length === 0 ? (
              <div className="p-8 border border-surface-outline rounded bg-surface-container-low text-center text-xs text-on-surface-variant">
                No announcements found.
              </div>
            ) : (
              filtered.map((ann) => (
                <AnnouncementCard
                  key={ann.id}
                  announcement={ann}
                  canManage={canManage}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onTogglePin={handleTogglePin}
                />
              ))
            )}
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      <CreateAnnouncementModal
        isOpen={isCreateOpen}
        onClose={handleCloseModal}
        announcement={editingAnnouncement}
      />
    </AppShell>
  );
}
