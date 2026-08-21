'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { AppShell } from '../../../components/layout/AppShell';
import { AnnouncementCard } from '../../../components/announcements/AnnouncementCard';
import { CreateAnnouncementModal } from '../../../components/announcements/CreateAnnouncementModal';
import { Button } from '../../../components/ui/Button';
import { Announcement } from '../../../types/announcement';
import { apiClient } from '../../../lib/api-client';
import { useDomainEvent } from '../../../lib/realtime-context';

export default function SuperAdminAnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [filter, setFilter] = useState<'ALL' | 'PUBLISHED' | 'DRAFT'>('ALL');
  const [isLoading, setIsLoading] = useState(true);

  const fetchAnnouncements = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await apiClient.getAnnouncements();
      if (Array.isArray(data)) {
        setAnnouncements(data);
      }
    } catch {
      // Clean error handling
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAnnouncements();
  }, [fetchAnnouncements]);

  useDomainEvent('ANNOUNCEMENT_CREATED', () => {
    fetchAnnouncements();
  });

  const filtered = announcements.filter(
    (a) => filter === 'ALL' || a.status === filter
  );

  return (
    <AppShell
      breadcrumbs={[
        { label: 'WorkGrid', href: '/' },
        { label: 'Super Admin', href: '/super-admin' },
        { label: 'Announcements Hub' },
      ]}
    >
      <div className="space-y-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-surface-outline pb-4">
          <div>
            <h1 className="text-xl font-bold text-primary tracking-tight">
              Organization Announcements & Broadcasts
            </h1>
            <p className="text-xs text-on-surface-variant mt-1">
              Publish global operational notices, room-specific directives, or administrative drafts.
            </p>
          </div>

          <Button
            variant="primary"
            size="md"
            onClick={() => setIsCreateOpen(true)}
            leftIcon={<span className="material-symbols-outlined text-[16px]">add</span>}
          >
            New Announcement
          </Button>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-2 border-b border-surface-outline">
          {(['ALL', 'PUBLISHED', 'DRAFT'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`pb-2 px-3 text-xs font-semibold uppercase tracking-wider transition-all border-b-2 ${
                filter === tab
                  ? 'border-primary text-primary'
                  : 'border-transparent text-on-surface-variant hover:text-on-surface'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Announcements List */}
        <div className="space-y-4">
          {isLoading ? (
            <p className="text-xs text-on-surface-variant text-center py-8">Loading announcements...</p>
          ) : filtered.length === 0 ? (
            <div className="p-8 border border-surface-outline rounded bg-surface-container-low text-center text-xs text-on-surface-variant">
              No announcements found.
            </div>
          ) : (
            filtered.map((ann) => (
              <AnnouncementCard key={ann.id} announcement={ann} />
            ))
          )}
        </div>
      </div>

      {/* Create Modal */}
      <CreateAnnouncementModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreated={() => fetchAnnouncements()}
      />
    </AppShell>
  );
}
