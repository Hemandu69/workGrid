'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AppShell } from '../../components/layout/AppShell';
import { useAuth } from '../../lib/auth-context';
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
import { Room } from '../../types/room';
import { User } from '../../types/auth';
import { formatToISTTime, formatUtcWindowToIST, getCurrentISTDateString } from '../../lib/time-utils';
import { AttendanceCard } from '../../components/attendance/AttendanceCard';
import { apiClient } from '../../lib/api-client';
import { useDomainEvent } from '../../lib/realtime-context';

export default function ServerDashboard() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [room, setRoom] = useState<Room | null>(null);
  const [roomMembers, setRoomMembers] = useState<User[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);

  const [currentClock, setCurrentClock] = useState<string>('');
  const [activeWindow, setActiveWindow] = useState<string>('');

  useEffect(() => {
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

  const serverRoomLetter = user.room ? user.room.replace('Room', '').replace('Sector', '').trim() : 'B';

  const loadServerData = useCallback(async () => {
    try {
      const [roomsData, tasksData, usersData] = await Promise.all([
        apiClient.getRooms().catch(() => []),
        apiClient.getTasks({ roomLetter: serverRoomLetter }).catch(() => []),
        apiClient.getUsers().catch(() => []),
      ]);

      if (Array.isArray(roomsData)) {
        const found = roomsData.find((r) => r.letter === serverRoomLetter) || roomsData[0] || null;
        setRoom(found);
      }
      if (Array.isArray(tasksData)) setTasks(tasksData);
      if (Array.isArray(usersData)) {
        const matched = usersData.filter((u) => u.room?.includes(serverRoomLetter));
        setRoomMembers(matched);
      }
    } catch {
      // Clean fallback
    }
  }, [serverRoomLetter]);

  // Keep a stable ref to the latest loadServerData for real-time event handlers
  const loadServerDataRef = useRef(loadServerData);
  useEffect(() => {
    loadServerDataRef.current = loadServerData;
  });

  useEffect(() => {
    loadServerData();
  }, [loadServerData]);

  // Real-Time Domain Events — silent background refresh
  useDomainEvent(
    [
      'TASK_CREATED',
      'TASK_ASSIGNED',
      'TASK_UPDATED',
      'TASK_STATUS_CHANGED',
      'ROOM_STATUS_CHANGED',
      'SUBROOM_STATUS_CHANGED',
      'LOCATION_CHANGED',
      'EMPLOYEE_CHECKED_IN',
      'EMPLOYEE_CHECKED_OUT',
      'ATTENDANCE_UPDATED',
      'AVAILABILITY_CHANGED',
    ],
    () => {
      loadServerDataRef.current();
    }
  );

  const totalMembers = room?.totalMembers ?? roomMembers.length;
  const totalCap = room?.totalCapacity ?? 32;
  const totalHours = roomMembers.reduce((acc, m) => acc + (m.currentAllocatedHours || 0), 0);
  const blockedTasksCount = tasks.filter((t) => t.status === 'BLOCKED').length;

  return (
    <AppShell
      breadcrumbs={[
        { label: 'WorkGrid', href: '/' },
        { label: `Section ${serverRoomLetter}`, href: '#' },
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
                Section {serverRoomLetter} Operational Command
              </h1>
              <Badge role="Server" variant="role" />
            </div>
            <p className="text-xs text-on-surface-variant">
              Managing Subrooms {serverRoomLetter}1 through {serverRoomLetter}8 • Server lead seat allocated for {user.name}
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
            label={`Section ${serverRoomLetter} Members`}
            value={`${totalMembers} / ${totalCap}`}
            subtext={`Across 8 Subrooms (${serverRoomLetter}1-${serverRoomLetter}8)`}
            trend={totalCap > 0 ? `${Math.round((totalMembers / totalCap) * 100)}% Capacity` : 'Active'}
            icon="groups"
            indicatorColor="primary"
          />
          <StatMetricCard
            label="Active Assignments"
            value={tasks.length}
            subtext="Tracked tasks in section"
            trend="Live Queue"
            icon="assignment"
            indicatorColor="busy"
          />
          <StatMetricCard
            label="Team Workload"
            value={`${totalHours}h`}
            subtext="Total weekly hours allocated"
            trend="Allocated Capacity"
            icon="schedule"
            indicatorColor="available"
          />
          <StatMetricCard
            label="Blockage Risk"
            value={`${blockedTasksCount} Task`}
            subtext="Policy or dependency guard"
            trend={blockedTasksCount > 0 ? "Action Required" : "All Clear"}
            trendDirection={blockedTasksCount > 0 ? "down" : "up"}
            icon="warning"
            indicatorColor={blockedTasksCount > 0 ? "blocked" : "available"}
          />
        </div>

        {/* Main 12-Column Grid */}
        <div className="grid grid-cols-12 gap-6">
          {/* Team Workload & Members Column (5 cols) */}
          <div className="col-span-12 lg:col-span-5 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Section {serverRoomLetter} Team Members</CardTitle>
                <Badge variant="outline">{roomMembers.length} Active</Badge>
              </CardHeader>

              <div className="space-y-3">
                {roomMembers.length === 0 ? (
                  <p className="text-xs text-on-surface-variant py-2">No members registered in this section.</p>
                ) : (
                  roomMembers.map((member) => {
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
                                Subroom {member.subroom || '—'} • {member.title || 'Engineer'}
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
                  })
                )}
              </div>
            </Card>

            {/* Hierarchy Guard Notice */}
            <div className="p-3.5 bg-surface-container-low border border-surface-outline rounded text-xs text-on-surface space-y-1">
              <div className="font-semibold text-primary flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px] text-secondary">shield</span>
                Server Hierarchy Boundaries
              </div>
              <p className="text-on-surface-variant leading-relaxed">
                As Section {serverRoomLetter} Lead, task assignment is scoped strictly to active members within Section {serverRoomLetter}. Cross-room assignment to other sections requires Admin authorization.
              </p>
            </div>
          </div>

          {/* Section Task Queue Column (7 cols) */}
          <div className="col-span-12 lg:col-span-7 space-y-6">
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-bold text-on-surface uppercase tracking-wider flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px] text-primary">task</span>
                  Section {serverRoomLetter} Active Tasks & Campaigns
                </h2>
                <span className="font-mono text-xs text-on-surface-variant tabular-nums">
                  {tasks.length} Tasks Tracked
                </span>
              </div>

              <TaskTable
                tasks={tasks}
                onSelectTask={(t) => setSelectedTask(t)}
                showAssignee={true}
              />
            </div>

            {/* Active Subrooms in Section */}
            {room && room.subrooms && (
              <div>
                <h3 className="text-xs font-bold text-on-surface uppercase tracking-wider mb-3">
                  Section {serverRoomLetter} Subrooms
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {room.subrooms.slice(0, 4).map((subroom) => (
                    <SubroomCard
                      key={subroom.id}
                      subroom={subroom}
                      isUserSubroom={subroom.id === user.subroom || subroom.name === user.subroom}
                    />
                  ))}
                </div>
              </div>
            )}
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
        onTaskCreated={() => loadServerData()}
      />
    </AppShell>
  );
}
