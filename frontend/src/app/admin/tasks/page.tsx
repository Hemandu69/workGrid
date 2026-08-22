'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { AppShell } from '../../../components/layout/AppShell';
import { TaskTable } from '../../../components/tasks/TaskTable';
import { TaskDetailDrawer } from '../../../components/tasks/TaskDetailDrawer';
import { CreateTaskModal } from '../../../components/tasks/CreateTaskModal';
import { Task, TaskCampaign } from '../../../types/task';
import { apiClient } from '../../../lib/api-client';
import { useDomainEvent } from '../../../lib/realtime-context';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Card } from '../../../components/ui/Card';

export default function AdminTasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [campaigns, setCampaigns] = useState<TaskCampaign[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isCreateTaskOpen, setIsCreateTaskOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [roomFilter, setRoomFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const fetchTasks = useCallback(async () => {
    try {
      const [tasksResult, campaignsData] = await Promise.all([
        apiClient.getTasks({
          roomLetter: roomFilter !== 'ALL' ? roomFilter.replace('Room', '').trim() : undefined,
          status: statusFilter !== 'ALL' ? statusFilter : undefined,
          search: searchQuery.trim() || undefined,
          limit: 200,
        }),
        apiClient.getCampaigns().catch(() => []),
      ]);

      setTasks(tasksResult.items);
      if (Array.isArray(campaignsData)) {
        setCampaigns(campaignsData);
      }
    } catch {
      // Clean fallback
    }
  }, [roomFilter, statusFilter, searchQuery]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // Real-Time Task Domain Events
  useDomainEvent(
    [
      'TASK_CREATED',
      'TASK_ASSIGNED',
      'TASK_REASSIGNED',
      'TASK_UPDATED',
      'TASK_COMPLETED',
      'TASK_CANCELLED',
      'TASK_STATUS_CHANGED',
      'TASK_PROGRESS_CHANGED',
    ],
    () => {
      fetchTasks();
    }
  );

  const filteredTasks = tasks.filter((t) => {
    const matchesSearch =
      t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.assigneeName.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesRoom =
      roomFilter === 'ALL' || t.assigneeRoom === roomFilter || `Room ${t.teamSection}` === roomFilter;
    const matchesStatus = statusFilter === 'ALL' || t.status === statusFilter;

    return matchesSearch && matchesRoom && matchesStatus;
  });

  return (
    <AppShell
      breadcrumbs={[
        { label: 'WorkGrid', href: '/' },
        { label: 'Admin Operations', href: '/admin' },
        { label: 'Task Management & Campaigns' },
      ]}
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-surface-outline pb-4">
          <div>
            <h1 className="text-xl font-bold text-primary tracking-tight">
              Enterprise Task Management & Campaigns
            </h1>
            <p className="text-xs text-on-surface-variant mt-1">
              Dispatch individual tasks or group work campaigns across all 8 sections.
            </p>
          </div>

          <Button
            variant="primary"
            size="md"
            onClick={() => setIsCreateTaskOpen(true)}
            leftIcon={<span className="material-symbols-outlined text-[16px]">add</span>}
          >
            Create Task / Campaign
          </Button>
        </div>

        {/* Active Campaigns Overview */}
        {campaigns.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {campaigns.map((c) => (
              <Card key={c.id}>
                <div className="flex items-start justify-between">
                  <div>
                    <Badge priority={c.priority} />
                    <h3 className="text-sm font-bold text-primary mt-1.5">{c.title}</h3>
                    <p className="text-xs text-on-surface-variant mt-1">{c.description}</p>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-surface-outline flex items-center justify-between text-xs tabular-nums">
                  <span className="text-on-surface-variant">Due {new Date(c.dueDate).toLocaleDateString()}</span>
                  <span className="font-mono font-semibold text-primary">
                    {c.completedCount} / {c.tasksCount} Subtasks Done
                  </span>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-surface-bright border border-surface-outline rounded">
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              placeholder="Search by title, ID, assignee..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="px-3 py-1.5 bg-surface-container-low border border-surface-outline rounded text-xs text-on-surface placeholder:text-outline w-56 md:w-64 focus:outline-none focus:border-primary"
            />

            <select
              value={roomFilter}
              onChange={(e) => setRoomFilter(e.target.value)}
              className="px-3 py-1.5 bg-surface-container-low border border-surface-outline rounded text-xs text-on-surface focus:outline-none focus:border-primary"
            >
              <option value="ALL">All Sections (A-H)</option>
              <option value="Room A">Section A</option>
              <option value="Room B">Section B</option>
              <option value="Room C">Section C</option>
              <option value="Room D">Section D</option>
              <option value="Room E">Section E</option>
              <option value="Room F">Section F</option>
              <option value="Room G">Section G</option>
              <option value="Room H">Section H</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-1.5 bg-surface-container-low border border-surface-outline rounded text-xs text-on-surface focus:outline-none focus:border-primary"
            >
              <option value="ALL">All Statuses</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="ASSIGNED">Assigned</option>
              <option value="SUBMITTED">Submitted</option>
              <option value="BLOCKED">Blocked</option>
              <option value="COMPLETED">Completed</option>
            </select>
          </div>

          <div className="text-xs font-mono text-on-surface-variant tabular-nums">
            Showing {filteredTasks.length} of {tasks.length} tasks
          </div>
        </div>

        {/* Tasks Table */}
        <TaskTable
          tasks={filteredTasks}
          onSelectTask={(t) => setSelectedTaskId(t.dbId || t.id)}
          showAssignee={true}
        />
      </div>

      {/* Task Drawer */}
      <TaskDetailDrawer taskId={selectedTaskId} onClose={() => setSelectedTaskId(null)} />

      {/* Create Task Modal */}
      <CreateTaskModal
        isOpen={isCreateTaskOpen}
        onClose={() => setIsCreateTaskOpen(false)}
        onTaskCreated={() => fetchTasks()}
      />
    </AppShell>
  );
}
