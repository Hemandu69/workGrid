'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { AppShell } from '../../components/layout/AppShell';
import { useAuth } from '../../lib/auth-context';
import { TaskCard } from '../../components/tasks/TaskCard';
import { TaskTable } from '../../components/tasks/TaskTable';
import { TaskDetailDrawer } from '../../components/tasks/TaskDetailDrawer';
import { Card, CardHeader, CardTitle } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Avatar } from '../../components/ui/Avatar';
import Link from 'next/link';
import { Task } from '../../types/task';
import { Announcement } from '../../types/announcement';
import { WeeklyAvailabilitySchedule } from '../../types/availability';
import { User } from '../../types/auth';
import { AttendanceCard } from '../../components/attendance/AttendanceCard';
import { apiClient } from '../../lib/api-client';
import { useDomainEvent } from '../../lib/realtime-context';

export default function MemberDashboard() {
  const { user } = useAuth();
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [schedule, setSchedule] = useState<WeeklyAvailabilitySchedule | null>(null);
  const [subroomPeers, setSubroomPeers] = useState<User[]>([]);

  const loadMemberData = useCallback(async () => {
    if (!user?.id) return;

    try {
      const [tasksData, annData, scheduleData, usersData] = await Promise.all([
        apiClient.getTasks({ assigneeId: user.id }).catch(() => []),
        apiClient.getAnnouncements().catch(() => []),
        apiClient.getUserAvailability(user.id).catch(() => null),
        apiClient.getUsers({ role: 'MEMBER' }).catch(() => []),
      ]);

      if (Array.isArray(tasksData)) setTasks(tasksData);
      if (Array.isArray(annData)) setAnnouncements(annData);
      if (scheduleData) setSchedule(scheduleData);
      if (Array.isArray(usersData)) {
        const peers = usersData.filter((u) => u.id !== user.id && (!user.subroom || u.subroom === user.subroom));
        setSubroomPeers(peers.slice(0, 3));
      }
    } catch {
      // Clean error handling
    }
  }, [user?.id, user?.subroom]);

  useEffect(() => {
    loadMemberData();
  }, [loadMemberData]);

  // Real-Time Subscriptions
  useDomainEvent(
    ['TASK_CREATED', 'TASK_ASSIGNED', 'TASK_UPDATED', 'TASK_COMPLETED', 'TASK_STATUS_CHANGED', 'ANNOUNCEMENT_CREATED', 'AVAILABILITY_CHANGED'],
    () => {
      loadMemberData();
    }
  );

  const activeTask = tasks.find((t) => t.status === 'IN_PROGRESS') || tasks[0];
  const upcomingTasks = activeTask ? tasks.filter((t) => t.id !== activeTask.id) : tasks;

  const handleUpdateStatus = async (task: Task, newStatus: string) => {
    try {
      await apiClient.updateTaskStatus(task.id, newStatus);
      setTasks(
        tasks.map((t) => (t.id === task.id ? { ...t, status: newStatus as Task['status'] } : t))
      );
    } catch {
      // Handled
    }
  };

  const allocatedHours = schedule?.allocatedHours ?? user?.currentAllocatedHours ?? 0;
  const capacityHours = schedule?.totalCapacityHours ?? user?.capacityLimitHours ?? 40;
  const remainingHours = schedule?.remainingAvailableHours ?? Math.max(0, capacityHours - allocatedHours);

  return (
    <AppShell
      breadcrumbs={[
        { label: 'WorkGrid', href: '/' },
        { label: user.room || 'Sector B', href: '#' },
        { label: user.subroom ? `Subroom ${user.subroom}` : 'Subroom B3', href: '#' },
        { label: 'Member Workspace' },
      ]}
    >
      <div className="space-y-6">
        {/* Global Attendance IN / OUT Tracker */}
        <AttendanceCard />

        {/* Pinned Global Announcement Banner if available */}
        {announcements.length > 0 && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded flex items-center justify-between text-xs text-blue-900">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px] text-blue-700">campaign</span>
              <span className="font-semibold">{announcements[0].title}:</span>
              <span className="text-blue-800 line-clamp-1">{announcements[0].content}</span>
            </div>
            <Link href="/notifications" className="text-blue-700 font-semibold hover:underline shrink-0 ml-2">
              View All
            </Link>
          </div>
        )}

        {/* 12-Column Grid Layout matching Stitch Design */}
        <div className="grid grid-cols-12 gap-6">
          {/* Main Column (8 Cols on Desktop) */}
          <div className="col-span-12 xl:col-span-8 space-y-6">
            {/* Featured Active Task */}
            <section>
              <div className="flex items-center justify-between mb-2.5">
                <h2 className="text-xs font-bold text-on-surface uppercase tracking-wider flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px] text-primary">target</span>
                  Current Active Task
                </h2>
                {activeTask && <Badge status={activeTask.status} />}
              </div>

              {activeTask ? (
                <TaskCard
                  task={activeTask}
                  onOpenDetails={(t) => setSelectedTask(t)}
                  onUpdateStatus={handleUpdateStatus}
                />
              ) : (
                <div className="p-8 border border-surface-outline rounded bg-surface-bright text-center text-xs text-on-surface-variant">
                  No active tasks in progress. Check assigned queue below.
                </div>
              )}
            </section>

            {/* Upcoming Work & Tasks Table */}
            <section>
              <div className="flex items-center justify-between mb-2.5">
                <h2 className="text-xs font-bold text-on-surface uppercase tracking-wider flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px] text-primary">assignment</span>
                  Assigned Queue & Upcoming Work
                </h2>
                <Link href="/member/tasks" className="text-xs text-secondary hover:text-primary font-medium">
                  View Full Task List →
                </Link>
              </div>

              <TaskTable
                tasks={upcomingTasks}
                onSelectTask={(t) => setSelectedTask(t)}
                showAssignee={false}
              />
            </section>
          </div>

          {/* Right Sidebar Column (4 Cols on Desktop) */}
          <div className="col-span-12 xl:col-span-4 space-y-6">
            {/* Subroom & Team Presence Context */}
            <Card padded={false}>
              <div className="p-4 border-b border-surface-outline bg-surface-container-low flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-primary">Subroom {user.subroom || 'B3'}</h3>
                  <p className="text-[11px] text-on-surface-variant">{user.room || 'Section B'} • Core Operations</p>
                </div>
                <Badge status="AVAILABLE">Subroom Unit</Badge>
              </div>

              <div className="p-4 space-y-3">
                {/* Subroom Peers */}
                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block">
                    Subroom Members
                  </span>
                  {subroomPeers.length === 0 ? (
                    <p className="text-xs text-on-surface-variant py-1">No other members in subroom.</p>
                  ) : (
                    subroomPeers.map((m) => (
                      <div
                        key={m.id}
                        className="p-2 rounded border border-surface-outline flex items-center justify-between text-xs bg-surface-bright"
                      >
                        <div className="flex items-center gap-2">
                          <Avatar src={m.avatarUrl} name={m.name} size="sm" status={m.status} />
                          <div>
                            <p className="font-medium text-primary text-[11px]">{m.name}</p>
                            <p className="text-[10px] text-on-surface-variant font-mono">{m.title || 'Engineer'}</p>
                          </div>
                        </div>
                        <span className="text-[10px] font-mono text-primary font-semibold">
                          {m.currentAllocatedHours ?? 0}h busy
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </Card>

            {/* Weekly Availability Summary Widget */}
            <Card>
              <CardHeader className="pb-2 mb-3">
                <CardTitle>Availability & Workload</CardTitle>
                <Link href="/member/availability" className="text-xs text-secondary hover:text-primary font-medium">
                  Edit Grid →
                </Link>
              </CardHeader>

              <div className="space-y-3 text-xs">
                <div className="flex justify-between items-center tabular-nums">
                  <span className="text-on-surface-variant">Allocated Workload:</span>
                  <span className="font-bold text-primary font-mono">{allocatedHours} Hours</span>
                </div>
                <div className="flex justify-between items-center tabular-nums">
                  <span className="text-on-surface-variant">Total Available:</span>
                  <span className="font-semibold text-emerald-700 font-mono">{capacityHours} Hours</span>
                </div>
                <div className="flex justify-between items-center tabular-nums">
                  <span className="text-on-surface-variant">Remaining Capacity:</span>
                  <span className="font-bold text-primary font-mono">{remainingHours} Hours</span>
                </div>

                {/* Progress Mini Bar */}
                <div className="w-full h-2 bg-surface-container rounded-full overflow-hidden mt-2">
                  <div
                    className="h-full bg-primary rounded-full"
                    style={{
                      width: `${capacityHours > 0 ? Math.min(100, (allocatedHours / capacityHours) * 100) : 0}%`,
                    }}
                  />
                </div>

                <p className="text-[11px] text-on-surface-variant mt-2 leading-tight">
                  Recurring 7-day schedule evaluated in UTC. Tasks are scheduled within non-conflicting capacity.
                </p>
              </div>
            </Card>
          </div>
        </div>
      </div>

      {/* Task Detail Drawer */}
      <TaskDetailDrawer
        task={selectedTask}
        onClose={() => setSelectedTask(null)}
        onStatusChange={(taskId, newStatus) => {
          setTasks(tasks.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)));
          if (selectedTask) setSelectedTask({ ...selectedTask, status: newStatus });
        }}
      />
    </AppShell>
  );
}
