'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { AppShell } from '../../../components/layout/AppShell';
import { AvailabilityGrid } from '../../../components/availability/AvailabilityGrid';
import { useAuth } from '../../../lib/auth-context';
import { apiClient } from '../../../lib/api-client';
import { WeeklyAvailabilitySchedule } from '../../../types/availability';
import { useDomainEvent } from '../../../lib/realtime-context';

export default function AvailabilityPage() {
  const { user } = useAuth();
  const [schedule, setSchedule] = useState<WeeklyAvailabilitySchedule | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [savedNotification, setSavedNotification] = useState(false);

  const fetchSchedule = useCallback(async () => {
    if (!user?.id) return;
    try {
      setIsLoading(true);
      const data = await apiClient.getUserAvailability(user.id);
      if (data) {
        setSchedule(data);
      }
    } catch {
      // Clean fallback
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchSchedule();
  }, [fetchSchedule]);

  useDomainEvent('AVAILABILITY_CHANGED', (event) => {
    if (!event.targetUserId || event.targetUserId === user?.id) {
      fetchSchedule();
    }
  });

  const handleSave = () => {
    setSavedNotification(true);
    fetchSchedule();
    setTimeout(() => setSavedNotification(false), 3000);
  };

  return (
    <AppShell
      breadcrumbs={[
        { label: 'WorkGrid', href: '/' },
        { label: 'Member Workspace', href: '/member' },
        { label: 'Weekly Availability' },
      ]}
    >
      <div className="space-y-6 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-surface-outline pb-4">
          <div>
            <h1 className="text-xl font-bold text-primary tracking-tight">
              Weekly Recurring Availability Matrix
            </h1>
            <p className="text-xs text-on-surface-variant mt-1">
              Maintain your 7-day recurring schedule in hourly slots. Availability is stored in your IANA timezone and evaluated in UTC.
            </p>
          </div>

          {savedNotification && (
            <div className="px-3 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded text-xs font-semibold flex items-center gap-1.5 animate-in fade-in">
              <span className="material-symbols-outlined text-[16px]">check_circle</span>
              Schedule updated successfully
            </div>
          )}
        </div>

        {/* Operational Availability Rules Notice */}
        <div className="p-3.5 bg-surface-container-low border border-surface-outline rounded text-xs text-on-surface space-y-1">
          <div className="font-semibold text-primary flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[16px] text-secondary">info</span>
            Capacity & Task Allocation Rules
          </div>
          <p className="text-on-surface-variant leading-relaxed">
            Assigned tasks use up your available hours automatically, reserved ahead of their due time. Slots marked Busy can only be changed by an Admin.
          </p>
        </div>

        {/* 7-Day Matrix */}
        {isLoading ? (
          <p className="text-xs text-on-surface-variant text-center py-12">Loading availability matrix...</p>
        ) : schedule ? (
          <AvailabilityGrid initialSchedule={schedule} onSave={handleSave} />
        ) : (
          <p className="text-xs text-on-surface-variant text-center py-12">No schedule records available.</p>
        )}
      </div>
    </AppShell>
  );
}
