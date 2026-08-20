'use client';

import React, { useState } from 'react';
import { AppShell } from '../../components/layout/AppShell';
import { useAuth } from '../../lib/auth-context';
import { MOCK_TASKS, MOCK_SCHEDULE, MOCK_ROOM_B_MEMBERS, MOCK_ANNOUNCEMENTS } from '../../lib/mock-data';
import { TaskCard } from '../../components/tasks/TaskCard';
import { TaskTable } from '../../components/tasks/TaskTable';
import { TaskDetailDrawer } from '../../components/tasks/TaskDetailDrawer';
import { Card, CardHeader, CardTitle } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Avatar } from '../../components/ui/Avatar';
import Link from 'next/link';
import { Task } from '../../types/task';
import { AttendanceCard } from '../../components/attendance/AttendanceCard';

export default function MemberDashboard() {
  const { user } = useAuth();
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [tasks, setTasks] = useState<Task[]>(MOCK_TASKS);

  const activeTask = tasks.find((t) => t.status === 'IN_PROGRESS') || tasks[0];
  const upcomingTasks = tasks.filter((t) => t.id !== activeTask.id);

  const handleUpdateStatus = (task: Task, newStatus: string) => {
    setTasks(
      tasks.map((t) => (t.id === task.id ? { ...t, status: newStatus as Task['status'] } : t))
    );
  };

  return (
    <AppShell
      breadcrumbs={[
        { label: 'WorkGrid', href: '/' },
        { label: 'Sector B', href: '#' },
        { label: 'Subroom B3', href: '#' },
        { label: 'Member Workspace' },
      ]}
    >
      <div className="space-y-6">
        {/* Global Attendance IN / OUT Tracker */}
        <AttendanceCard />

        {/* Pinned Global Announcement Banner if available */}
        {MOCK_ANNOUNCEMENTS[0] && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded flex items-center justify-between text-xs text-blue-900">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px] text-blue-700">campaign</span>
              <span className="font-semibold">{MOCK_ANNOUNCEMENTS[0].title}:</span>
              <span className="text-blue-800 line-clamp-1">{MOCK_ANNOUNCEMENTS[0].content}</span>
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
                <Badge status={activeTask.status} />
              </div>

              <TaskCard
                task={activeTask}
                onOpenDetails={(t) => setSelectedTask(t)}
                onUpdateStatus={handleUpdateStatus}
              />
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
                  <p className="text-[11px] text-on-surface-variant">Sector B • Core Operations</p>
                </div>
                <Badge status="AVAILABLE">2/2 Capacity</Badge>
              </div>

              <div className="p-4 space-y-3">
                {/* Lead Server */}
                <div className="p-2.5 rounded bg-surface-container-low border border-surface-outline flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <Avatar src="https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80" name="David Chen" size="sm" status="BUSY" />
                    <div>
                      <span className="text-[10px] text-on-surface-variant uppercase font-bold block">
                        Team Lead / Server
                      </span>
                      <span className="font-semibold text-primary">David Chen</span>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-outline">Lead Seat</span>
                </div>

                {/* Subroom Peers */}
                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block">
                    Subroom Members
                  </span>
                  {MOCK_ROOM_B_MEMBERS.slice(0, 2).map((m) => (
                    <div
                      key={m.id}
                      className="p-2 rounded border border-surface-outline flex items-center justify-between text-xs bg-surface-bright"
                    >
                      <div className="flex items-center gap-2">
                        <Avatar src={m.avatarUrl} name={m.name} size="sm" status={m.status} />
                        <div>
                          <p className="font-medium text-primary text-[11px]">{m.name}</p>
                          <p className="text-[10px] text-on-surface-variant font-mono">{m.title}</p>
                        </div>
                      </div>
                      <span className="text-[10px] font-mono text-primary font-semibold">
                        {m.currentAllocatedHours}h busy
                      </span>
                    </div>
                  ))}
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
                  <span className="font-bold text-primary font-mono">{MOCK_SCHEDULE.allocatedHours} Hours</span>
                </div>
                <div className="flex justify-between items-center tabular-nums">
                  <span className="text-on-surface-variant">Total Available:</span>
                  <span className="font-semibold text-emerald-700 font-mono">{MOCK_SCHEDULE.totalCapacityHours} Hours</span>
                </div>
                <div className="flex justify-between items-center tabular-nums">
                  <span className="text-on-surface-variant">Remaining Capacity:</span>
                  <span className="font-bold text-primary font-mono">{MOCK_SCHEDULE.remainingAvailableHours} Hours</span>
                </div>

                {/* Progress Mini Bar */}
                <div className="w-full h-2 bg-surface-container rounded-full overflow-hidden mt-2">
                  <div
                    className="h-full bg-primary rounded-full"
                    style={{ width: `${(MOCK_SCHEDULE.allocatedHours / MOCK_SCHEDULE.totalCapacityHours) * 100}%` }}
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
