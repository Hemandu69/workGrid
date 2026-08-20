'use client';

import React, { useState } from 'react';
import { AppShell } from '../../../components/layout/AppShell';
import { TaskTable } from '../../../components/tasks/TaskTable';
import { TaskDetailDrawer } from '../../../components/tasks/TaskDetailDrawer';
import { MOCK_TASKS } from '../../../lib/mock-data';
import { Task } from '../../../types/task';

export default function MemberTasksPage() {
  const [tasks, setTasks] = useState<Task[]>(MOCK_TASKS);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');

  const filteredTasks = tasks.filter((t) => {
    const matchesSearch =
      t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.description.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === 'ALL' || t.status === statusFilter;
    const matchesPriority = priorityFilter === 'ALL' || t.priority === priorityFilter;

    return matchesSearch && matchesStatus && matchesPriority;
  });

  return (
    <AppShell
      breadcrumbs={[
        { label: 'WorkGrid', href: '/' },
        { label: 'Member Workspace', href: '/member' },
        { label: 'My Tasks' },
      ]}
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-surface-outline pb-4">
          <div>
            <h1 className="text-xl font-bold text-primary tracking-tight">Task Queue & Backlog</h1>
            <p className="text-xs text-on-surface-variant mt-1">
              View and manage active, submitted, and completed assignments.
            </p>
          </div>
        </div>

        {/* Filters Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-surface-bright border border-surface-outline rounded">
          <div className="flex flex-wrap items-center gap-3">
            {/* Search Input */}
            <input
              type="text"
              placeholder="Filter tasks by name or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="px-3 py-1.5 bg-surface-container-low border border-surface-outline rounded text-xs text-on-surface placeholder:text-outline w-56 md:w-72 focus:outline-none focus:border-primary"
            />

            {/* Status Filter */}
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

            {/* Priority Filter */}
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="px-3 py-1.5 bg-surface-container-low border border-surface-outline rounded text-xs text-on-surface focus:outline-none focus:border-primary"
            >
              <option value="ALL">All Priorities</option>
              <option value="CRITICAL">Critical</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>
          </div>

          <div className="text-xs font-mono text-on-surface-variant tabular-nums">
            Showing {filteredTasks.length} of {tasks.length} tasks
          </div>
        </div>

        {/* Task Table */}
        <TaskTable
          tasks={filteredTasks}
          onSelectTask={(t) => setSelectedTask(t)}
          showAssignee={true}
        />
      </div>

      {/* Task Details Drawer */}
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
