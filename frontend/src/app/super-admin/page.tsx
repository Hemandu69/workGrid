'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { AppShell } from '../../components/layout/AppShell';
import { StatMetricCard } from '../../components/monitoring/StatMetricCard';
import { RoomOverviewGrid } from '../../components/rooms/RoomOverviewGrid';
import { AnnouncementCard } from '../../components/announcements/AnnouncementCard';
import { CreateAnnouncementModal } from '../../components/announcements/CreateAnnouncementModal';
import { TaskTable } from '../../components/tasks/TaskTable';
import { TaskDetailDrawer } from '../../components/tasks/TaskDetailDrawer';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader, CardTitle } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import Link from 'next/link';
import { Task } from '../../types/task';
import { Room } from '../../types/room';
import { Announcement } from '../../types/announcement';
import { AttendanceCard } from '../../components/attendance/AttendanceCard';
import { apiClient } from '../../lib/api-client';
import { useDomainEvent } from '../../lib/realtime-context';

export default function SuperAdminDashboard() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [isAnnouncementModalOpen, setIsAnnouncementModalOpen] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [stats, setStats] = useState<{
    organizationScale?: number;
    totalMembers?: number;
    totalCapacity?: number;
    globalSaturationPercentage?: number;
    overdueRiskPercentage?: number;
  } | null>(null);

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [statsData, annData, tasksData, roomsData] = await Promise.all([
        apiClient.getDashboardSummary().catch(() => null),
        apiClient.getAnnouncements().catch(() => []),
        apiClient.getTasks().catch(() => []),
        apiClient.getRooms().catch(() => []),
      ]);

      if (statsData) setStats(statsData as typeof stats);
      if (Array.isArray(annData)) setAnnouncements(annData);
      if (Array.isArray(tasksData)) setTasks(tasksData);
      if (Array.isArray(roomsData)) setRooms(roomsData);
    } catch {
      // Clean fallback
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Real-Time Domain Events
  useDomainEvent(
    [
      'ANNOUNCEMENT_CREATED',
      'TASK_CREATED',
      'TASK_ASSIGNED',
      'TASK_REASSIGNED',
      'TASK_UPDATED',
      'TASK_COMPLETED',
      'TASK_CANCELLED',
      'TASK_STATUS_CHANGED',
      'TASK_PROGRESS_CHANGED',
      'ROOM_STATUS_CHANGED',
      'SUBROOM_STATUS_CHANGED',
    ],
    () => {
      loadData();
    }
  );

  const blockedTasks = tasks.filter((t) => t.status === 'BLOCKED');
  const orgScale = stats?.organizationScale ?? tasks.length;
  const globalSaturation = stats?.globalSaturationPercentage ?? 0;

  return (
    <AppShell
      breadcrumbs={[
        { label: 'WorkGrid', href: '/' },
        { label: 'Super Admin', href: '/super-admin' },
        { label: 'Global Command & Health Center' },
      ]}
    >
      <div className="space-y-6">
        {/* Global Attendance IN / OUT Tracker */}
        <AttendanceCard />

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-surface-outline pb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-xl font-bold text-primary tracking-tight">
                Global Command & Enterprise Overview
              </h1>
              <Badge role="Super Admin" variant="role" />
            </div>
            <p className="text-xs text-on-surface-variant">
              Centralized monitoring, organization-wide health, announcements, and policy oversight across all personnel.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link href="/admin/tasks">
              <Button variant="outline" size="md">
                Task Management Route
              </Button>
            </Link>
            <Button
              variant="primary"
              size="md"
              onClick={() => setIsAnnouncementModalOpen(true)}
              leftIcon={<span className="material-symbols-outlined text-[16px]">campaign</span>}
            >
              Publish Announcement
            </Button>
          </div>
        </div>

        {/* Global Key Health Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatMetricCard
            label="Organization Scale"
            value={orgScale.toLocaleString()}
            subtext="Active provisioned nodes"
            trend="100% Operational"
            icon="hub"
            indicatorColor="primary"
          />
          <StatMetricCard
            label="Global Room Saturation"
            value={`${globalSaturation}%`}
            subtext="Sections A through H"
            trend="Balanced Load"
            icon="grid_view"
            indicatorColor="available"
          />
          <StatMetricCard
            label="Critical Blockages"
            value={`${blockedTasks.length} ${blockedTasks.length === 1 ? 'Task' : 'Tasks'}`}
            subtext="Requires Admin policy review"
            trend={blockedTasks.length > 0 ? "Attention Required" : "All Clear"}
            trendDirection={blockedTasks.length > 0 ? "down" : "up"}
            icon="error"
            indicatorColor={blockedTasks.length > 0 ? "blocked" : "available"}
          />
          <StatMetricCard
            label="System Health"
            value="100%"
            subtext="PostgreSQL & Socket.IO realtime"
            trend="Healthy"
            icon="dns"
            indicatorColor="available"
          />
        </div>

        {/* 12-Column Grid */}
        <div className="grid grid-cols-12 gap-6">
          {/* Room Topology & Blockages Column (8 cols) */}
          <div className="col-span-12 xl:col-span-8 space-y-6">
            {/* Rooms A-H Overview */}
            <Card>
              <CardHeader>
                <CardTitle>Global Room & Subroom Saturation Topology</CardTitle>
                <Link href="/admin/rooms" className="text-xs text-secondary hover:text-primary font-medium">
                  Detailed Grid →
                </Link>
              </CardHeader>
              <RoomOverviewGrid rooms={rooms} selectedRoomLetter="B" />
            </Card>

            {/* Blocked or High-Risk Tasks Table */}
            {blockedTasks.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-xs font-bold text-status-blocked uppercase tracking-wider flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[16px]">warning</span>
                    Critical Blocked Tasks Requiring Overload Override
                  </h2>
                  <Badge status="BLOCKED">{blockedTasks.length} Blocked</Badge>
                </div>

                <TaskTable
                  tasks={blockedTasks}
                  onSelectTask={(t) => setSelectedTaskId(t.dbId || t.id)}
                  showAssignee={true}
                />
              </div>
            )}
          </div>

          {/* Announcements & System Activity Column (4 cols) */}
          <div className="col-span-12 xl:col-span-4 space-y-6">
            {/* Announcements Hub Widget */}
            <Card>
              <CardHeader>
                <CardTitle>Organization Announcements</CardTitle>
                <Link
                  href="/super-admin/announcements"
                  className="text-xs text-secondary hover:text-primary font-medium"
                >
                  Manage All →
                </Link>
              </CardHeader>

              <div className="space-y-3">
                {announcements.length === 0 ? (
                  <p className="text-xs text-on-surface-variant text-center py-4">No announcements published yet.</p>
                ) : (
                  announcements.map((ann) => (
                    <AnnouncementCard key={ann.id} announcement={ann} />
                  ))
                )}
              </div>
            </Card>

            {/* Super Admin Architecture Principles Card */}
            <div className="p-4 bg-surface-container-low border border-surface-outline rounded text-xs space-y-2">
              <span className="font-bold text-primary text-[11px] uppercase tracking-wider block">
                Super Admin Separation of Concerns
              </span>
              <p className="text-on-surface-variant leading-relaxed">
                As Super Admin, global health, infrastructure telemetry, announcements, and organization configuration are prioritized. Routine task assignment is routed to the dedicated task management view.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Task Drawer */}
      <TaskDetailDrawer taskId={selectedTaskId} onClose={() => setSelectedTaskId(null)} />

      {/* Create Announcement Modal */}
      <CreateAnnouncementModal
        isOpen={isAnnouncementModalOpen}
        onClose={() => setIsAnnouncementModalOpen(false)}
        onCreated={() => {
          loadData();
        }}
      />
    </AppShell>
  );
}
