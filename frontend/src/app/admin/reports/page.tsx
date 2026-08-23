'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '../../../components/layout/AppShell';
import { useAuth } from '../../../lib/auth-context';

/**
 * Reports & Analytics no longer exists as a standalone page — its useful
 * metrics were merged into Global Overview (SUPER_ADMIN) and were always
 * already duplicated on Admin Dashboard (ADMIN). This route now only
 * exists to send anyone with a bookmark/old link to the right place —
 * role-aware, since Global Overview isn't reachable by ADMIN.
 */
export default function AdminReportsRedirectPage() {
  const router = useRouter();
  const { role, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    if (role === 'SUPER_ADMIN') {
      router.replace('/super-admin');
    } else if (role === 'ADMIN') {
      router.replace('/admin');
    }
  }, [isLoading, role, router]);

  if (isLoading || role === 'SUPER_ADMIN' || role === 'ADMIN') {
    return (
      <AppShell
        breadcrumbs={[
          { label: 'WorkGrid', href: '/' },
          { label: 'Admin Operations', href: '/admin' },
          { label: 'Reports & Analytics' },
        ]}
      >
        <p className="text-xs text-on-surface-variant text-center py-12">Redirecting…</p>
      </AppShell>
    );
  }

  return (
    <AppShell
      breadcrumbs={[
        { label: 'WorkGrid', href: '/' },
        { label: 'Admin Operations', href: '/admin' },
        { label: 'Reports & Analytics' },
      ]}
    >
      <div className="p-8 text-center bg-surface-bright border border-surface-outline rounded max-w-lg mx-auto space-y-3">
        <span className="material-symbols-outlined text-[36px] text-rose-600">lock</span>
        <h2 className="text-base font-bold text-primary">Access Restricted</h2>
        <p className="text-xs text-on-surface-variant leading-relaxed">
          Reports & Analytics has moved. Its information is now part of Global Overview and Admin
          Dashboard, both reserved for Administrators and Super Admins.
        </p>
      </div>
    </AppShell>
  );
}
