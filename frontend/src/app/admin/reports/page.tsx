'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { AppShell } from '../../../components/layout/AppShell';
import { StatMetricCard } from '../../../components/monitoring/StatMetricCard';
import { Card, CardHeader, CardTitle } from '../../../components/ui/Card';
import { Room } from '../../../types/room';
import { apiClient } from '../../../lib/api-client';
import { useDomainEvent } from '../../../lib/realtime-context';

export default function AdminReportsPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [stats, setStats] = useState<{
    organizationScale?: number;
    totalMembers?: number;
    totalCapacity?: number;
    globalSaturationPercentage?: number;
    activeTasks?: number;
    overdueRiskPercentage?: number;
  } | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [roomsData, statsData] = await Promise.all([
        apiClient.getRooms().catch(() => []),
        apiClient.getDashboardSummary().catch(() => null),
      ]);

      if (Array.isArray(roomsData)) setRooms(roomsData);
      if (statsData) setStats(statsData as typeof stats);
    } catch {
      // Handled
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useDomainEvent(['ROOM_STATUS_CHANGED', 'SUBROOM_STATUS_CHANGED', 'TASK_STATUS_CHANGED'], () => {
    loadData();
  });

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
            Historical throughput, section capacity saturation, and task turnaround metrics across all sections.
          </p>
        </div>

        {/* Analytics Top Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatMetricCard
            label="Global Saturation"
            value={`${stats?.globalSaturationPercentage ?? 0}%`}
            subtext="Occupied subroom capacity"
            trend="Real-time Density"
            icon="speed"
            indicatorColor="available"
          />
          <StatMetricCard
            label="Active Workload Tasks"
            value={stats?.activeTasks ?? 0}
            subtext="Total tasks in dispatch"
            trend="Active Queue"
            icon="assignment"
            indicatorColor="primary"
          />
          <StatMetricCard
            label="Subrooms Monitored"
            value={rooms.length * 8 || 64}
            subtext="Across all provisioned sections"
            trend="Sections A–H"
            icon="insights"
            indicatorColor="busy"
          />
          <StatMetricCard
            label="Task Overdue Risk"
            value={`${stats?.overdueRiskPercentage ?? 0}%`}
            subtext="Risk of SLA deviation"
            trend="Calculated from tasks"
            icon="verified_user"
            indicatorColor="available"
          />
        </div>

        {/* Utilization by Section */}
        <Card>
          <CardHeader>
            <CardTitle>Section Capacity Saturation & Workload Breakdown</CardTitle>
          </CardHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {rooms.length === 0 ? (
              <p className="text-xs text-on-surface-variant py-4 col-span-4 text-center">Loading section reports...</p>
            ) : (
              rooms.map((room) => (
                <div
                  key={room.letter}
                  className="p-3.5 bg-surface-container-low border border-surface-outline rounded text-xs space-y-2"
                >
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-primary text-sm">Section {room.letter}</span>
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
              ))
            )}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
