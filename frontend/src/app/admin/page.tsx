'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { AppShell } from '../../components/layout/AppShell';
import { StatMetricCard } from '../../components/monitoring/StatMetricCard';
import { TaskTable } from '../../components/tasks/TaskTable';
import { TaskDetailDrawer } from '../../components/tasks/TaskDetailDrawer';
import { CreateTaskModal } from '../../components/tasks/CreateTaskModal';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader, CardTitle } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import Link from 'next/link';
import { Task, TaskCampaign } from '../../types/task';
import { Room } from '../../types/room';
import { AttendanceCard } from '../../components/attendance/AttendanceCard';
import { apiClient } from '../../lib/api-client';
import { useDomainEvent } from '../../lib/realtime-context';

export default function AdminDashboard() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [campaigns, setCampaigns] = useState<TaskCampaign[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [stats, setStats] = useState<{
    organizationScale?: number;
    totalMembers?: number;
    totalCapacity?: number;
    globalSaturationPercentage?: number;
    activeCampaigns?: number;
    overdueRiskPercentage?: number;
  } | null>(null);

  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isCreateTaskOpen, setIsCreateTaskOpen] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [statsData, tasksData, campaignsData, roomsData] = await Promise.all([
        apiClient.getDashboardSummary().catch(() => null),
        apiClient.getTasks().catch(() => []),
        apiClient.getCampaigns().catch(() => []),
        apiClient.getRooms().catch(() => []),
      ]);

      if (statsData) setStats(statsData as typeof stats);
      if (Array.isArray(tasksData)) setTasks(tasksData);
      if (Array.isArray(campaignsData)) setCampaigns(campaignsData);
      if (Array.isArray(roomsData)) setRooms(roomsData);
    } catch {
      // Clean fallback
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Real-Time Domain Event Subscriptions
  useDomainEvent(
    ['TASK_CREATED', 'TASK_ASSIGNED', 'TASK_UPDATED', 'TASK_COMPLETED', 'TASK_STATUS_CHANGED', 'ROOM_STATUS_CHANGED', 'SUBROOM_STATUS_CHANGED'],
    () => {
      loadData();
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
              Global task allocation, room saturation monitoring, and team oversight across Sectors A through H.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link href="/admin/tasks">
              <Button variant="outline" size="md">
                Campaign Manager
              </Button>
            </Link>
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
            trend="100% Authoritative"
            icon="groups"
            indicatorColor="primary"
          />
          <StatMetricCard
            label="Subroom Saturation"
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
            label="Task Overdue Risk"
            value={`${stats?.overdueRiskPercentage ?? 0}%`}
            subtext="Calculated from active task SLAs"
            trend="Real-time Health"
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
                onSelectTask={(t) => setSelectedTask(t)}
                showAssignee={true}
              />
            </div>
          </div>

          {/* Sector Saturation & Quick Controls (4 cols) */}
          <div className="col-span-12 xl:col-span-4 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Sector Saturation Heatmap</CardTitle>
                <Link href="/admin/rooms" className="text-xs text-secondary hover:text-primary font-medium">
                  Room Details →
                </Link>
              </CardHeader>

              <div className="space-y-3 text-xs">
                {rooms.length === 0 ? (
                  <p className="text-xs text-on-surface-variant py-2">Loading sector data...</p>
                ) : (
                  rooms.map((room) => (
                    <div key={room.letter} className="space-y-1">
                      <div className="flex justify-between items-center tabular-nums">
                        <span className="font-semibold text-primary">Sector {room.letter}</span>
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

            {/* Admin Policy Summary */}
            <div className="p-4 bg-surface-container-low border border-surface-outline rounded text-xs space-y-2">
              <span className="font-bold text-primary text-[11px] uppercase tracking-wider block">
                Administrative Authorities
              </span>
              <p className="text-on-surface-variant leading-relaxed">
                Admins possess global scope across all Sectors A–H. Room membership changes and capacity overrides are recorded as append-only audit events.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Task Drawer */}
      <TaskDetailDrawer
        task={selectedTask}
        onClose={() => setSelectedTask(null)}
        onStatusChange={(taskId, newStatus) => {
          setTasks(tasks.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)));
          if (selectedTask) setSelectedTask({ ...selectedTask, status: newStatus });
        }}
      />

      {/* Create Task Modal */}
      <CreateTaskModal
        isOpen={isCreateTaskOpen}
        onClose={() => setIsCreateTaskOpen(false)}
        onTaskCreated={() => loadData()}
      />
    </AppShell>
  );
}
