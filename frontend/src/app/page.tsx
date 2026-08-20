'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../lib/auth-context';

export default function RootPage() {
  const router = useRouter();
  const { role } = useAuth();

  useEffect(() => {
    switch (role) {
      case 'SUPER_ADMIN':
        router.replace('/super-admin');
        break;
      case 'ADMIN':
        router.replace('/admin');
        break;
      case 'SERVER':
        router.replace('/server');
        break;
      case 'MEMBER':
        router.replace('/member');
        break;
      default:
        router.replace('/login');
    }
  }, [role, router]);

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center">
      <div className="flex items-center gap-3 text-xs text-on-surface-variant font-medium">
        <span className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <span>Loading WorkGrid Workspace...</span>
      </div>
    </div>
  );
}
