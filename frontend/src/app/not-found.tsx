'use client';

import React from 'react';
import Link from 'next/link';
import { Button } from '../components/ui/Button';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center p-6 text-center">
      <div className="max-w-md w-full p-8 bg-surface-bright border border-surface-outline rounded shadow-sm space-y-4">
        <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto">
          <span className="material-symbols-outlined text-[24px]">search_off</span>
        </div>
        <h1 className="text-lg font-bold text-primary tracking-tight">404 - Page Not Found</h1>
        <p className="text-xs text-on-surface-variant leading-relaxed">
          The requested page or route does not exist in WorkGrid.
        </p>
        <div className="pt-2">
          <Link href="/">
            <Button variant="primary" size="md">
              Return to Command Center
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
