'use client';

import React, { useState } from 'react';
import { AppShell } from '../../components/layout/AppShell';
import { useAuth } from '../../lib/auth-context';
import { MOCK_TASKS, MOCK_ROOM_B_MEMBERS, MOCK_ROOMS } from '../../lib/mock-data';
import { StatMetricCard } from '../../components/monitoring/StatMetricCard';
import { TaskTable } from '../../components/tasks/TaskTable';
import { TaskDetailDrawer } from '../../components/tasks/TaskDetailDrawer';
import { CreateTaskModal } from '../../components/tasks/CreateTaskModal';
import { SubroomCard } from '../../components/rooms/SubroomCard';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader, CardTitle } from '../../components/ui/Card';
import { Avatar } from '../../components/ui/Avatar';
import { Badge } from '../../components/ui/Badge';
import { Task } from '../../types/task';
import { formatToISTTime, formatUtcWindowToIST, getCurrentISTDateString } from '../../lib/time-utils';
import { AttendanceCard } from '../../components/attendance/AttendanceCard';

export default function ServerDashboard() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>(MOCK_TASKS);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);

  const [currentClock, setCurrentClock] = useState<string>('');
  const [activeWindow, setActiveWindow] = useState<string>('');

  React.useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentClock(formatToISTTime(now));
      const curUtcHour = now.getUTCHours();
      const dateStr = getCurrentISTDateString();
      setActiveWindow(formatUtcWindowToIST(dateStr, curUtcHour, curUtcHour + 1).activeWindowIST);
    };
    updateTime();
    const interval = setInterval(updateTime, 30000);
    return () => clearInterval(interval);
  }, []);

  const roomB = MOCK_ROOMS.find((r) => r.letter === 'B') || MOCK_ROOMS[1];
  const roomTasks = tasks.filter((t) => t.assigneeRoom === 'Room B');

  return (
    <AppShell
      breadcrumbs={[
        { label: 'WorkGrid', href: '/' },
        { label: 'Sector B (Room B)', href: '#' },
        { label: 'Server & Room Command' },
      ]}
    >
      <div className="space-y-6">
        {/* Global Attendance IN / OUT Tracker */}
        <AttendanceCard />

        {/* Header with Hierarchy Context */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-surface-outline pb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-xl font-bold text-primary tracking-tight">
                Sector B Operational Command
              </h1>
              <Badge role="Team Lead" variant="role" />
            </div>
            <p className="text-xs text-on-surface-variant">
              Managing Subrooms B1 through B8 • Server lead seat allocated for {user.name}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {currentClock && (
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-surface-container-low border border-surface-outline rounded text-xs font-mono">
                <span className="text-on-surface-variant text-[11px]">Active Window:</span>
                <span className="font-semibold text-primary">{activeWindow}</span>
              </div>
            )}

            <Button
              variant="primary"
              size="md"
              onClick={() => setIsAssignModalOpen(true)}
              leftIcon={<span className="material-symbols-outlined text-[16px]">add</span>}
            >
              Assign Team Task
            </Button>
          </div>
        </div>

        {/* Operational Scope Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatMetricCard
            label="Sector B Members"
            value={`${roomB.totalMembers} / ${roomB.totalCapacity}`}
            subtext="Across 8 Subrooms (B1-B8)"
            trend="87% Capacity"
            icon="groups"
            indicatorColor="primary"
          />
          <StatMetricCard
            label="Active Assignments"
            value={roomTasks.length}
            subtext="3 in-progress, 1 submitted"
            trend="+2 this week"
            icon="assignment"
            indicatorColor="busy"
          />
          <StatMetricCard
            label="Team Workload"
            value="117h"
            subtext="Total weekly hours allocated"
            trend="Under 140h Limit"
            icon="schedule"
            indicatorColor="available"
          />
          <StatMetricCard
            label="Blockage Risk"
            value="1 Task"
            subtext="TSK-8424 policy guard"
            trend="Action Required"
            trendDirection="down"
            icon="warning"
            indicatorColor="blocked"
          />
        </div>

        {/* Main 12-Column Grid */}
        <div className="grid grid-cols-12 gap-6">
          {/* Team Workload & Members Column (5 cols) */}
          <div className="col-span-12 lg:col-span-5 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Sector B Team Members</CardTitle>
                <Badge variant="outline">{MOCK_ROOM_B_MEMBERS.length} Active</Badge>
              </CardHeader>

              <div className="space-y-3">
                {MOCK_ROOM_B_MEMBERS.map((member) => {
                  const currentHours = member.currentAllocatedHours ?? 0;
                  const capHours = member.capacityLimitHours ?? 40;
                  const workloadPercentage = Math.round(
                    (currentHours / (capHours || 1)) * 100
                  );

                  return (
                    <div
                      key={member.id}
                      className="p-3 bg-surface-container-low border border-surface-outline rounded text-xs space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Avatar src={member.avatarUrl} name={member.name} size="sm" status={member.status} />
                          <div>
                            <p className="font-semibold text-primary">{member.name}</p>
                            <p className="text-[10px] text-on-surface-variant font-mono">
                              Subroom {member.subroom} • {member.title}
                            </p>
                          </div>
                        </div>
                        <span className="font-mono font-semibold text-primary">
                          {currentHours} / {capHours}h
                        </span>
                      </div>

                      {/* Workload bar */}
                      <div className="w-full h-1.5 bg-surface-container rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            workloadPercentage > 90
                              ? 'bg-status-blocked'
                              : workloadPercentage > 75
                              ? 'bg-status-busy'
                              : 'bg-status-available'
                          }`}
                          style={{ width: `${workloadPercentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* Hierarchy Guard Notice */}
            <div className="p-3.5 bg-surface-container-low border border-surface-outline rounded text-xs text-on-surface space-y-1">
              <div className="font-semibold text-primary flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px] text-secondary">shield</span>
                Server Hierarchy Boundaries
              </div>
              <p className="text-on-surface-variant leading-relaxed">
                As Sector B Lead, task assignment is scoped strictly to active members within Sector B. Cross-room assignment to Sector A, C, etc. requires Admin authorization.
              </p>
            </div>
          </div>

          {/* Sector Task Queue Column (7 cols) */}
          <div className="col-span-12 lg:col-span-7 space-y-6">
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-bold text-on-surface uppercase tracking-wider flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px] text-primary">task</span>
                  Sector B Active Tasks & Campaigns
                </h2>
                <span className="font-mono text-xs text-on-surface-variant tabular-nums">
                  {roomTasks.length} Tasks Tracked
                </span>
              </div>

              <TaskTable
                tasks={roomTasks}
                onSelectTask={(t) => setSelectedTask(t)}
                showAssignee={true}
              />
            </div>

            {/* Active Subrooms in Sector B */}
            <div>
              <h3 className="text-xs font-bold text-on-surface uppercase tracking-wider mb-3">
                Sector B Subrooms (B1 - B4 Sample)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {roomB.subrooms.slice(0, 4).map((subroom) => (
                  <SubroomCard
                    key={subroom.id}
                    subroom={subroom}
                    isUserSubroom={subroom.id === 'B3'}
                  />
                ))}
              </div>
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

      {/* Server Task Assignment Modal */}
      <CreateTaskModal
        isOpen={isAssignModalOpen}
        onClose={() => setIsAssignModalOpen(false)}
      />
    </AppShell>
  );
}
