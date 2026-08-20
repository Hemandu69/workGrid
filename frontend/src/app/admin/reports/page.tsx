'use client';

import React from 'react';
import { AppShell } from '../../../components/layout/AppShell';
import { StatMetricCard } from '../../../components/monitoring/StatMetricCard';
import { Card, CardHeader, CardTitle } from '../../../components/ui/Card';
import { MOCK_ROOMS } from '../../../lib/mock-data';

export default function AdminReportsPage() {
  return (
    <AppShell
      breadcrumbs={[
        { label: 'WorkGrid', href: '/' },
        { label: 'Admin Operations', href: '/admin' },
        { label: 'Reports & Utilization Analytics' },
      ]}
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="border-b border-surface-outline pb-4">
          <h1 className="text-xl font-bold text-primary tracking-tight">
            Operational Analytics & Capacity Utilization
          </h1>
          <p className="text-xs text-on-surface-variant mt-1">
            Historical throughput, sector capacity saturation, and task turnaround metrics across all sectors.
          </p>
        </div>

        {/* Analytics Top Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatMetricCard
            label="Avg Task Turnaround"
            value="1.8 Days"
            subtext="From ASSIGNED to COMPLETED"
            trend="-0.4d vs Target"
            icon="timer"
            indicatorColor="available"
          />
          <StatMetricCard
            label="Global Throughput"
            value="89.4%"
            subtext="On-time delivery rate"
            trend="+2.1% this month"
            icon="trending_up"
            indicatorColor="primary"
          />
          <StatMetricCard
            label="Peak Workload Window"
            value="13:00 UTC"
            subtext="Highest concurrency demand"
            trend="Mon / Wed peaks"
            icon="insights"
            indicatorColor="busy"
          />
          <StatMetricCard
            label="Audit Event Volume"
            value="14,892"
            subtext="Immutable ledger entries"
            trend="Zero anomalies"
            icon="verified_user"
            indicatorColor="available"
          />
        </div>

        {/* Utilization by Sector */}
        <Card>
          <CardHeader>
            <CardTitle>Sector Capacity Saturation & Workload Breakdown</CardTitle>
          </CardHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {MOCK_ROOMS.map((room) => (
              <div
                key={room.letter}
                className="p-3.5 bg-surface-container-low border border-surface-outline rounded text-xs space-y-2"
              >
                <div className="flex justify-between items-center">
                  <span className="font-bold text-primary text-sm">Sector {room.letter}</span>
                  <span className="font-mono text-xs font-semibold text-primary">{room.occupancyPercentage}%</span>
                </div>
                <div className="w-full h-2 bg-surface-container rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full"
                    style={{ width: `${room.occupancyPercentage}%` }}
                  />
                </div>
                <div className="flex justify-between text-[11px] text-on-surface-variant font-mono">
                  <span>{room.totalMembers} Members</span>
                  <span>{room.totalCapacity} Cap</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
