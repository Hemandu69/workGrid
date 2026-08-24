'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS: Array<{ label: string; href: string }> = [
  { label: 'People Directory', href: '/admin/people' },
  { label: 'Role Audit', href: '/admin/people/audit' },
];

/**
 * Shared page-level tab bar for the People Management feature area — keeps
 * People Directory and its Role Audit history visually grouped as one
 * cohesive feature instead of two unrelated sidebar destinations.
 */
export function PeopleManagementTabs() {
  const pathname = usePathname();

  return (
    <div className="flex items-center gap-1 border-b border-surface-outline">
      {TABS.map((tab) => {
        const isActive = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`px-3.5 py-2 text-xs font-semibold border-b-2 -mb-px transition-colors ${
              isActive
                ? 'border-primary text-primary'
                : 'border-transparent text-on-surface-variant hover:text-on-surface hover:border-surface-outline'
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
