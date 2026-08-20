'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, getRoleLandingPath } from '../lib/auth-context';

export default function RootPage() {
  const router = useRouter();
  const { role, isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading) {
      if (isAuthenticated) {
        const path = getRoleLandingPath(role);
        router.replace(path);
      } else {
        router.replace('/login');
      }
    }
  }, [role, isAuthenticated, isLoading, router]);

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center">
      <div className="flex items-center gap-3 text-xs text-on-surface-variant font-medium">
        <span className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <span>Loading WorkGrid Workspace...</span>
      </div>
    </div>
  );
}
