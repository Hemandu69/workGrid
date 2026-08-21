'use client';

import React from 'react';
import { AppShell } from '../../../components/layout/AppShell';
import { EventsManagementView } from '../../../components/events/EventsManagementView';

export default function AdminEventsPage() {
  return (
    <AppShell
      breadcrumbs={[
        { label: 'WorkGrid', href: '/' },
        { label: 'Admin Operations', href: '/admin' },
        { label: 'Events' },
      ]}
    >
      <EventsManagementView />
    </AppShell>
  );
}
