'use client';

import React from 'react';
import { Button } from '../components/ui/Button';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center p-6 text-center">
      <div className="max-w-md w-full p-8 bg-surface-bright border border-surface-outline rounded shadow-sm space-y-4">
        <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center mx-auto">
          <span className="material-symbols-outlined text-[24px]">error</span>
        </div>
        <h1 className="text-lg font-bold text-primary tracking-tight">Application Error</h1>
        <p className="text-xs text-on-surface-variant leading-relaxed">
          {error.message || 'An unexpected operational error occurred while rendering this page.'}
        </p>
        <div className="pt-2 flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" onClick={() => (window.location.href = '/')}>
            Go Home
          </Button>
          <Button variant="primary" size="sm" onClick={() => reset()}>
            Retry Action
          </Button>
        </div>
      </div>
    </div>
  );
}
