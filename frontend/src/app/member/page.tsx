'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
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
import { AttendanceCard } from '../../components/attendance/AttendanceCard';
import { apiClient } from '../../lib/api-client';
import { useTasks } from '../../lib/useTasks';
import { useUsers } from '../../lib/useUsers';
import { useAnnouncements } from '../../lib/useAnnouncements';

export default function MemberDashboard() {
  const { user } = useAuth();
  const router = useRouter();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  // Shared, cached, realtime-synced.
  const { data: tasksResult } = useTasks({ assigneeId: user?.id, limit: 200 });
  const { data: annResult } = useAnnouncements({ limit: 50 });
  const { data: usersResult } = useUsers({ role: 'MEMBER', limit: 200 });

  const tasks = tasksResult?.items ?? [];
  const announcements = annResult?.items ?? [];
  const subroomPeers = (usersResult?.items ?? [])
    .filter((u) => u.id !== user.id && (!user.subroom || u.subroom === user.subroom))
    .slice(0, 3);

  const activeTask = tasks.find((t) => t.status === 'IN_PROGRESS') || tasks[0];
  const upcomingTasks = activeTask ? tasks.filter((t) => t.id !== activeTask.id) : tasks;

  const handleUpdateStatus = async (task: Task, newStatus: string) => {
    // No local optimistic patch here — the backend's TASK_STATUS_CHANGED
    // domain event round-trips back through the socket in well under a
    // second and invalidates the shared tasks cache, so the list reflects
    // the authoritative new status without a hand-rolled local mutation.
    try {
      await apiClient.updateTaskStatus(task.id, newStatus);
    } catch {
      // Handled
    }
  };

  const allocatedHours = user?.currentAllocatedHours ?? 0;
  const capacityHours = user?.capacityLimitHours ?? 40;
  const remainingHours = Math.max(0, capacityHours - allocatedHours);

  return (
    <AppShell
      breadcrumbs={[
        { label: 'WorkGrid', href: '/' },
        { label: user.room || 'Unassigned Section', href: '#' },
        { label: user.subroom ? `Subroom ${user.subroom}` : 'Unassigned Subroom', href: '#' },
        { label: 'Member Workspace' },
      ]}
      onQuickAction={() => router.push('/member/events')}
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
                  onOpenDetails={(t) => setSelectedTaskId(t.dbId || t.id)}
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
                onSelectTask={(t) => setSelectedTaskId(t.dbId || t.id)}
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
                  <h3 className="text-sm font-bold text-primary">
                    {user.subroom ? `Subroom ${user.subroom}` : 'No Subroom Assigned'}
                  </h3>
                  <p className="text-[11px] text-on-surface-variant">{user.room || 'No section assigned'}</p>
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

            {/* Task Capacity Summary Widget */}
            <Card>
              <CardHeader className="pb-2 mb-3">
                <CardTitle>Task Capacity</CardTitle>
                <Link href="/member/events" className="text-xs text-secondary hover:text-primary font-medium">
                  My Events →
                </Link>
              </CardHeader>

              <div className="space-y-3 text-xs">
                <div className="flex justify-between items-center tabular-nums">
                  <span className="text-on-surface-variant">Allocated Workload:</span>
                  <span className="font-bold text-primary font-mono">{allocatedHours} Hours</span>
                </div>
                <div className="flex justify-between items-center tabular-nums">
                  <span className="text-on-surface-variant">Capacity Limit:</span>
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
                  Reflects your current assigned task hours against your capacity limit. Set your live availability from the Attendance card above.
                </p>
              </div>
            </Card>
          </div>
        </div>
      </div>

      {/* Task Detail Drawer */}
      <TaskDetailDrawer taskId={selectedTaskId} onClose={() => setSelectedTaskId(null)} />
    </AppShell>
  );
}
