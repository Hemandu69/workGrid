'use client';

import React, { useState } from 'react';
import { AppShell } from '../../components/layout/AppShell';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Avatar } from '../../components/ui/Avatar';
import { Table, TableHeader, TableRow, TableHead, TableCell } from '../../components/ui/Table';
import { AttendanceCard } from '../../components/attendance/AttendanceCard';
import { useAuth } from '../../lib/auth-context';
import { useTasks } from '../../lib/useTasks';
import { useUsers } from '../../lib/useUsers';
import { CreateTaskModal } from '../../components/tasks/CreateTaskModal';
import { TaskTable } from '../../components/tasks/TaskTable';
import { TaskDetailDrawer } from '../../components/tasks/TaskDetailDrawer';

export default function TeamLeadPage() {
  const { user } = useAuth();
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  // Shared, cached, realtime-synced — no manual loadData()/useDomainEvent
  // listener needed, both hooks invalidate themselves on the relevant
  // TASK_*/EMPLOYEE_*/AVAILABILITY_* events. No filters needed on tasks —
  // the backend automatically scopes a TEAM_LEAD's task list to their own
  // room, so this already returns "my squad's tasks" and nothing else.
  const { data: tasksResult } = useTasks({ limit: 200 });
  const { data: usersResult } = useUsers({ role: 'MEMBER', limit: 200 });
  const tasks = tasksResult?.items ?? [];
  const usersData = usersResult?.items ?? [];
  // Scope to team members in user's room/subroom or all members
  const filtered = user.room ? usersData.filter((u) => u.room === user.room) : usersData;
  const teamMembers = filtered.length > 0 ? filtered : usersData;

  const totalAllocated = teamMembers.reduce((acc, m) => acc + (m.currentAllocatedHours || 0), 0);
  const totalLimit = teamMembers.reduce((acc, m) => acc + (m.capacityLimitHours || 40), 0);
  const utilization = totalLimit > 0 ? Math.round((totalAllocated / totalLimit) * 100) : 0;
  const completedTasks = tasks.filter((t) => t.status === 'COMPLETED').length;
  const unassignedTeamTasks = tasks.filter((t) => t.taskType === 'TEAM' && !t.assigneeId);
  const unavailableMembers = teamMembers.filter((m) => m.presenceState && m.presenceState !== 'IN');

  return (
    <AppShell
      breadcrumbs={[
        { label: 'WorkGrid', href: '/' },
        { label: 'Team Lead Workspace' },
      ]}
    >
      <div className="space-y-6">
        {/* Global Attendance IN / OUT Tracker */}
        <AttendanceCard />

        {/* Header */}
        <div className="border-b border-surface-outline pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-primary tracking-tight">
                Team Lead Coordination Hub
              </h1>
              <Badge role="Team Lead" variant="role" />
            </div>
            <p className="text-xs text-on-surface-variant mt-1">
              Dedicated squad operational workspace for workload tracking, sprint deliverables, and capacity management.
            </p>
          </div>

          <Button
            variant="primary"
            size="md"
            onClick={() => setIsAssignModalOpen(true)}
            leftIcon={<span className="material-symbols-outlined text-[16px]">add</span>}
          >
            Assign Squad Task
          </Button>
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="p-4 rounded border border-surface-outline bg-surface-bright shadow-xs">
            <div className="flex items-center justify-between text-on-surface-variant mb-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Direct Squad</span>
              <span className="material-symbols-outlined text-[18px] text-primary">groups</span>
            </div>
            <p className="text-2xl font-bold text-primary font-mono tabular-nums">{teamMembers.length}</p>
            <p className="text-[10px] text-on-surface-variant mt-1">
              {unavailableMembers.length > 0 ? `${unavailableMembers.length} currently unavailable` : 'All present'}
            </p>
          </div>

          <div className="p-4 rounded border border-surface-outline bg-surface-bright shadow-xs">
            <div className="flex items-center justify-between text-on-surface-variant mb-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-blue-800">Squad Tasks</span>
              <span className="material-symbols-outlined text-[18px] text-blue-600">assignment</span>
            </div>
            <p className="text-2xl font-bold text-blue-700 font-mono tabular-nums">{tasks.length}</p>
            <p className="text-[10px] text-blue-800 mt-1">Total trackable tasks</p>
          </div>

          <div className="p-4 rounded border border-surface-outline bg-surface-bright shadow-xs">
            <div className="flex items-center justify-between text-on-surface-variant mb-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-800">Capacity Utilization</span>
              <span className="material-symbols-outlined text-[18px] text-emerald-600">battery_charging_full</span>
            </div>
            <p className="text-2xl font-bold text-emerald-700 font-mono tabular-nums">{utilization}%</p>
            <p className="text-[10px] text-emerald-800 mt-1">{totalAllocated}h of {totalLimit}h cap</p>
          </div>

          <div className="p-4 rounded border border-surface-outline bg-surface-bright shadow-xs">
            <div className="flex items-center justify-between text-on-surface-variant mb-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-purple-800">Completed Work</span>
              <span className="material-symbols-outlined text-[18px] text-purple-600">task_alt</span>
            </div>
            <p className="text-2xl font-bold text-purple-700 font-mono tabular-nums">{completedTasks}</p>
            <p className="text-[10px] text-purple-800 mt-1">Tasks completed</p>
          </div>
        </div>

        {/* Unassigned Team Tasks — created for the whole team, waiting to be distributed */}
        {unassignedTeamTasks.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-primary">Unassigned Team Tasks</h2>
              <span className="font-mono text-xs text-on-surface-variant tabular-nums">
                {unassignedTeamTasks.length} waiting
              </span>
            </div>
            <div className="space-y-2">
              {unassignedTeamTasks.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedTaskId(t.dbId || t.id)}
                  className="w-full text-left p-3 bg-amber-50 border border-amber-200 rounded flex items-center justify-between gap-3 hover:border-amber-400 transition-colors"
                >
                  <div>
                    <p className="font-semibold text-primary text-xs">{t.title}</p>
                    <p className="text-[10px] text-on-surface-variant mt-0.5">
                      Created by {t.creatorName} · Section {t.teamSection}
                    </p>
                  </div>
                  <span className="material-symbols-outlined text-[18px] text-amber-700">chevron_right</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Squad Members Directory */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-primary">Squad Members & Weekly Allocation</h2>
          </div>

          <Table>
            <TableHeader>
              <TableRow isHeader>
                <TableHead>Engineer</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Room / Subroom</TableHead>
                <TableHead>Allocated Hours</TableHead>
                <TableHead>Weekly Limit</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <tbody>
              {teamMembers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-6 text-xs text-on-surface-variant">
                    No squad members found.
                  </TableCell>
                </TableRow>
              ) : (
                teamMembers.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <Avatar src={member.avatarUrl} name={member.name} size="sm" status={member.status} />
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-primary leading-tight">{member.name}</span>
                            {member.presenceState && member.presenceState !== 'IN' && (
                              <span className="px-1 py-0.2 rounded text-[9px] font-bold uppercase bg-slate-100 text-slate-600">
                                Unavailable
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-on-surface-variant font-mono">{member.email}</span>
                        </div>
                      </div>
                    </TableCell>

                    <TableCell className="text-xs text-on-surface">{member.title || 'Engineer'}</TableCell>

                    <TableCell className="font-mono text-xs text-on-surface-variant">
                      {member.subroom ? `${member.subroom} (${member.room || 'Unassigned'})` : (member.room || 'Unassigned')}
                    </TableCell>

                    <TableCell className="font-mono text-xs text-on-surface font-semibold">
                      {member.currentAllocatedHours ?? 0} hrs
                    </TableCell>

                    <TableCell className="font-mono text-xs text-on-surface-variant">
                      {member.capacityLimitHours ?? 40} hrs
                    </TableCell>

                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs py-1"
                        onClick={() => setIsAssignModalOpen(true)}
                      >
                        Assign Task
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </tbody>
          </Table>
        </div>

        {/* Squad Task Queue */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-primary">Squad Task Queue</h2>
            <span className="font-mono text-xs text-on-surface-variant tabular-nums">
              {tasks.length} Tasks Tracked
            </span>
          </div>

          <TaskTable
            tasks={tasks}
            onSelectTask={(t) => setSelectedTaskId(t.dbId || t.id)}
            showAssignee={true}
            emptyMessage="No tasks assigned to your squad yet."
          />
        </div>
      </div>

      <CreateTaskModal
        isOpen={isAssignModalOpen}
        onClose={() => setIsAssignModalOpen(false)}
      />

      <TaskDetailDrawer taskId={selectedTaskId} onClose={() => setSelectedTaskId(null)} />
    </AppShell>
  );
}
