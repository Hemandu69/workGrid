'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AppShell } from '../../components/layout/AppShell';
import { StatMetricCard } from '../../components/monitoring/StatMetricCard';
import { TaskTable } from '../../components/tasks/TaskTable';
import { TaskDetailDrawer } from '../../components/tasks/TaskDetailDrawer';
import { CreateTaskModal } from '../../components/tasks/CreateTaskModal';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader, CardTitle } from '../../components/ui/Card';
import { SectionOccupancySummary } from '../../components/monitoring/SectionOccupancySummary';
import { Badge } from '../../components/ui/Badge';
import Link from 'next/link';
import { TaskCampaign } from '../../types/task';
import { AttendanceCard } from '../../components/attendance/AttendanceCard';
import { apiClient } from '../../lib/api-client';
import { useDomainEvent } from '../../lib/realtime-context';
import { useTasks } from '../../lib/useTasks';
import { useRooms } from '../../lib/useRooms';

export default function AdminDashboard() {
  const [campaigns, setCampaigns] = useState<TaskCampaign[]>([]);
  const [stats, setStats] = useState<{
    organizationScale?: number;
    totalMembers?: number;
    totalCapacity?: number;
    globalSaturationPercentage?: number;
    activeCampaigns?: number;
    overdueRiskPercentage?: number;
  } | null>(null);

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isCreateTaskOpen, setIsCreateTaskOpen] = useState(false);

  // Shared, cached, realtime-synced — TASK_*/ROOM_*/SUBROOM_* events
  // invalidate these caches automatically instead of a hand-rolled listener
  // re-fetching this page's entire dataset.
  const { data: tasksResult } = useTasks({ limit: 200 });
  const { data: roomsData, isLoading: isRoomsLoading } = useRooms();
  const tasks = tasksResult?.items ?? [];
  const rooms = roomsData ?? [];

  const loadData = useCallback(async () => {
    try {
      const [statsData, campaignsData] = await Promise.all([
        apiClient.getDashboardSummary().catch(() => null),
        apiClient.getCampaigns().catch(() => []),
      ]);

      if (statsData) setStats(statsData as typeof stats);
      if (Array.isArray(campaignsData)) setCampaigns(campaignsData);
    } catch {
      // Clean fallback
    }
  }, []);

  // Keep a stable ref to the latest loadData for real-time event handlers
  const loadDataRef = useRef(loadData);
  useEffect(() => {
    loadDataRef.current = loadData;
  });

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Real-Time Domain Event Subscriptions — silent background refresh for the
  // stats/campaigns this page still fetches directly (tasks/rooms are kept
  // current by useTasks/useRooms' own realtime sync above).
  useDomainEvent(
    ['TASK_CREATED', 'TASK_COMPLETED', 'EMPLOYEE_CHECKED_IN', 'EMPLOYEE_CHECKED_OUT', 'ATTENDANCE_UPDATED'],
    () => {
      loadDataRef.current();
    }
  );

  const totalMembers = stats?.totalMembers ?? rooms.reduce((acc, r) => acc + r.totalMembers, 0);
  const totalCapacity = stats?.totalCapacity ?? rooms.reduce((acc, r) => acc + r.totalCapacity, 0);
  const overallOccupancy = stats?.globalSaturationPercentage ?? (totalCapacity > 0 ? Math.round((totalMembers / totalCapacity) * 100) : 0);
  const orgScale = stats?.organizationScale ?? totalMembers;

  return (
    <AppShell
      breadcrumbs={[
        { label: 'WorkGrid', href: '/' },
        { label: 'Admin Operations', href: '/admin' },
        { label: 'Operational Dashboard' },
      ]}
    >
      <div className="space-y-6">
        {/* Global Attendance IN / OUT Tracker */}
        <AttendanceCard />

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-surface-outline pb-4">
          <div>
            <h1 className="text-xl font-bold text-primary tracking-tight">
              Operational Administration & Dispatch
            </h1>
            <p className="text-xs text-on-surface-variant mt-1">
              Task allocation, room occupancy monitoring, and team oversight across Sections A through H.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              size="md"
              onClick={() => setIsCreateTaskOpen(true)}
              leftIcon={<span className="material-symbols-outlined text-[16px]">add</span>}
            >
              Assign Work
            </Button>
          </div>
        </div>

        {/* Global Key Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatMetricCard
            label="Total Personnel"
            value={orgScale.toLocaleString()}
            subtext={`${totalMembers} Assigned to subrooms`}
            trend="Live Count"
            icon="groups"
            indicatorColor="primary"
          />
          <StatMetricCard
            label="Room Usage"
            value={`${overallOccupancy}%`}
            subtext={`Across ${rooms.length * 8 || 64} Subrooms`}
            trend="Live Occupancy"
            icon="meeting_room"
            indicatorColor="available"
          />
          <StatMetricCard
            label="Active Campaigns"
            value={campaigns.length}
            subtext={`${tasks.length} individual subtasks active`}
            trend="Active Dispatches"
            icon="campaign"
            indicatorColor="busy"
          />
          <StatMetricCard
            label="Tasks At Risk of Being Late"
            value={`${stats?.overdueRiskPercentage ?? 0}%`}
            subtext="Based on task due dates"
            trend="Updated Live"
            icon="speed"
            indicatorColor={stats?.overdueRiskPercentage && stats.overdueRiskPercentage > 10 ? 'blocked' : 'available'}
          />
        </div>

        {/* 12-Column Layout */}
        <div className="grid grid-cols-12 gap-6">
          {/* Main Tasks & Campaigns (8 cols) */}
          <div className="col-span-12 xl:col-span-8 space-y-6">
            {/* Active Campaigns */}
            <Card>
              <CardHeader>
                <CardTitle>Active Task Campaigns (Group Work Dispatch)</CardTitle>
                <Link href="/admin/tasks" className="text-xs text-secondary hover:text-primary font-medium">
                  Manage Campaigns →
                </Link>
              </CardHeader>

              <div className="space-y-3">
                {campaigns.length === 0 ? (
                  <p className="text-xs text-on-surface-variant py-3 text-center">No active task campaigns.</p>
                ) : (
                  campaigns.map((camp) => (
                    <div
                      key={camp.id}
                      className="p-3.5 bg-surface-container-low border border-surface-outline rounded text-xs space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-primary text-sm">{camp.title}</span>
                            <Badge priority={camp.priority} />
                          </div>
                          <p className="text-on-surface-variant text-xs mt-0.5">{camp.description}</p>
                        </div>
                        <span className="font-mono font-semibold text-primary tabular-nums">
                          {camp.completedCount} / {camp.tasksCount} Tasks Done
                        </span>
                      </div>

                      <div className="w-full h-2 bg-surface-container rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full"
                          style={{
                            width: `${camp.tasksCount > 0 ? (camp.completedCount / camp.tasksCount) * 100 : 0}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Card>

            {/* Global Task Table */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-bold text-on-surface uppercase tracking-wider flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px] text-primary">assignment</span>
                  Global Task Activity
                </h2>
                <Link href="/admin/tasks" className="text-xs text-secondary hover:text-primary font-medium">
                  View All Tasks ({tasks.length}) →
                </Link>
              </div>

              <TaskTable
                tasks={tasks}
                onSelectTask={(t) => setSelectedTaskId(t.dbId || t.id)}
                showAssignee={true}
              />
            </div>
          </div>

          {/* Section Saturation & Quick Controls (4 cols) */}
          <div className="col-span-12 xl:col-span-4 space-y-6">
            <SectionOccupancySummary
              rooms={rooms}
              loading={isRoomsLoading}
              detailHref="/admin/operations"
              detailLabel="Room Details →"
            />

            {/* Admin Policy Summary */}
            <div className="p-4 bg-surface-container-low border border-surface-outline rounded text-xs space-y-2">
              <span className="font-bold text-primary text-[11px] uppercase tracking-wider block">
                What Admin Covers
              </span>
              <p className="text-on-surface-variant leading-relaxed">
                Admins can manage all Sections A–H. Every room assignment change is logged for accountability.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Task Drawer */}
      <TaskDetailDrawer taskId={selectedTaskId} onClose={() => setSelectedTaskId(null)} />

      {/* Create Task Modal */}
      <CreateTaskModal
        isOpen={isCreateTaskOpen}
        onClose={() => setIsCreateTaskOpen(false)}
        onTaskCreated={() => loadData()}
      />
    </AppShell>
  );
}
