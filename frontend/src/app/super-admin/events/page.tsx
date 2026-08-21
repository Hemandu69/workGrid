'use client';

import React from 'react';
import { AppShell } from '../../../components/layout/AppShell';
import { EventsManagementView } from '../../../components/events/EventsManagementView';

export default function SuperAdminEventsPage() {
  return (
    <AppShell
      breadcrumbs={[
        { label: 'WorkGrid', href: '/' },
        { label: 'Super Admin', href: '/super-admin' },
        { label: 'Events' },
      ]}
    >
      <EventsManagementView />
    </AppShell>
  );
}
