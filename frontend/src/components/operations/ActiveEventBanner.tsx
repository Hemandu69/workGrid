'use client';

import React from 'react';
import { Button } from '../ui/Button';

interface ActiveEventBannerProps {
  event?: {
    id: string;
    title: string;
    description?: string;
    scope: 'COMPANY' | 'ROOM';
    locations: string[];
    startTimeIST: string;
    endTimeIST: string;
    requiredServersCount?: number;
    serversPresentCount: number;
    serverCoverageSummary: string;
  };
  onOpenEvent: (eventId: string) => void;
}

export function ActiveEventBanner({ event, onOpenEvent }: ActiveEventBannerProps) {
  if (!event) return null;

  return (
    <div className="p-4 bg-primary text-on-primary rounded border border-primary-container shadow-md flex flex-wrap items-center justify-between gap-4 animate-in fade-in duration-200">
      <div className="flex items-start gap-3">
        <div className="p-2 bg-secondary/30 rounded text-secondary-fixed flex items-center justify-center shrink-0">
          <span className="material-symbols-outlined text-[24px]">broadcast_on_home</span>
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 bg-blue-500/20 text-blue-300 border border-blue-400/30 rounded text-[10px] font-bold uppercase tracking-wider">
              {event.scope === 'COMPANY' ? 'Company-Wide Event' : 'Room Event'}
            </span>
            <span className="text-xs text-on-primary-container font-mono">
              {event.startTimeIST} – {event.endTimeIST}
            </span>
          </div>
          <h2 className="text-base font-bold text-white tracking-tight">{event.title}</h2>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-300">
            <span className="flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">location_on</span>
              <span>{event.locations.join(', ')}</span>
            </span>
            <span className="flex items-center gap-1 font-mono text-emerald-300 font-semibold">
              <span className="material-symbols-outlined text-[14px]">shield_person</span>
              <span>Server Coverage: {event.serverCoverageSummary}</span>
            </span>
          </div>
        </div>
      </div>

      <Button
        variant="secondary"
        size="sm"
        onClick={() => onOpenEvent(event.id)}
        leftIcon={<span className="material-symbols-outlined text-[16px]">visibility</span>}
      >
        Inspect Event & Server Coverage
      </Button>
    </div>
  );
}
