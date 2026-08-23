'use client';

import React from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle } from '../ui/Card';
import { Room } from '../../types/room';

interface SectionOccupancySummaryProps {
  rooms: Room[];
  /** Explicit loading flag — never inferred from an empty rooms array, since
   * "still loading" and "genuinely no rooms" are different states. */
  loading?: boolean;
  detailHref?: string;
  detailLabel?: string;
  title?: string;
}

/**
 * Compact per-section occupancy summary — a few progress-bar rows, not the
 * full room/subroom operational grid. Shared between the Admin Dashboard's
 * "Section Occupancy" card and Global Overview's "Room & Section Occupancy
 * Overview" card so both stay in sync with one implementation.
 */
export function SectionOccupancySummary({
  rooms,
  loading = false,
  detailHref,
  detailLabel,
  title = 'Section Occupancy',
}: SectionOccupancySummaryProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {detailHref && (
          <Link href={detailHref} className="text-xs text-secondary hover:text-primary font-medium">
            {detailLabel || 'View Details →'}
          </Link>
        )}
      </CardHeader>

      <div className="space-y-3 text-xs">
        {loading ? (
          <p className="text-xs text-on-surface-variant py-2">Loading section data...</p>
        ) : rooms.length === 0 ? (
          <p className="text-xs text-on-surface-variant py-2">No section data available.</p>
        ) : (
          rooms.map((room) => (
            <div key={room.letter} className="space-y-1">
              <div className="flex justify-between items-center tabular-nums">
                <span className="font-semibold text-primary">Section {room.letter}</span>
                <span className="font-mono text-on-surface-variant">
                  {room.totalMembers} / {room.totalCapacity} ({room.occupancyPercentage}%)
                </span>
              </div>
              <div className="w-full h-1.5 bg-surface-container rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    room.occupancyPercentage > 90
                      ? 'bg-status-blocked'
                      : room.occupancyPercentage > 75
                      ? 'bg-status-busy'
                      : 'bg-status-available'
                  }`}
                  style={{ width: `${room.occupancyPercentage}%` }}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
