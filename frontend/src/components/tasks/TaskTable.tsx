'use client';

import React from 'react';
import { Task } from '../../types/task';
import { Table, TableHeader, TableRow, TableHead, TableCell } from '../ui/Table';
import { Badge } from '../ui/Badge';
import { Avatar } from '../ui/Avatar';

interface TaskTableProps {
  tasks: Task[];
  onSelectTask?: (task: Task) => void;
  showAssignee?: boolean;
  emptyMessage?: string;
}

export function TaskTable({
  tasks,
  onSelectTask,
  showAssignee = true,
  emptyMessage = 'No tasks found.',
}: TaskTableProps) {
  if (tasks.length === 0) {
    return (
      <div className="p-8 text-center border border-surface-outline rounded bg-surface-bright">
        <span className="material-symbols-outlined text-[32px] text-on-surface-variant mb-2">
          task
        </span>
        <p className="text-xs text-on-surface-variant font-medium">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow isHeader>
          <TableHead>Task ID</TableHead>
          <TableHead>Title & Description</TableHead>
          {showAssignee && <TableHead>Assignee</TableHead>}
          <TableHead>Room / Subroom</TableHead>
          <TableHead>Priority</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Due Date</TableHead>
          <TableHead className="text-right">Action</TableHead>
        </TableRow>
      </TableHeader>
      <tbody>
        {tasks.map((task) => (
          <TableRow
            key={task.id}
            onClick={() => onSelectTask?.(task)}
            className="cursor-pointer"
          >
            {/* Task ID */}
            <TableCell className="font-mono font-semibold text-primary text-[11px] tabular-nums whitespace-nowrap">
              {task.id}
            </TableCell>

            {/* Title & Campaign */}
            <TableCell className="max-w-xs">
              <div className="flex flex-col">
                <span className="font-semibold text-primary truncate hover:underline">
                  {task.title}
                </span>
                {task.campaignTitle && (
                  <span className="text-[10px] text-on-surface-variant truncate">
                    {task.campaignTitle}
                  </span>
                )}
              </div>
            </TableCell>

            {/* Assignee */}
            {showAssignee && (
              <TableCell>
                <div className="flex items-center gap-2">
                  <Avatar src={task.assigneeAvatar} name={task.assigneeName} size="sm" />
                  <span className="text-xs text-on-surface truncate">{task.assigneeName}</span>
                </div>
              </TableCell>
            )}

            {/* Room / Subroom */}
            <TableCell>
              <span className="font-mono text-xs text-on-surface-variant font-medium">
                {task.assigneeSubroom} <span className="text-outline">({task.assigneeRoom})</span>
              </span>
            </TableCell>

            {/* Priority */}
            <TableCell>
              <Badge priority={task.priority} />
            </TableCell>

            {/* Status */}
            <TableCell>
              <Badge status={task.status} />
            </TableCell>

            {/* Due Date */}
            <TableCell className="font-mono text-xs tabular-nums text-on-surface-variant whitespace-nowrap">
              {new Date(task.dueDate).toLocaleDateString()}
            </TableCell>

            {/* Action */}
            <TableCell className="text-right">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectTask?.(task);
                }}
                className="p-1 rounded text-on-surface-variant hover:text-primary hover:bg-surface-container transition-colors"
                title="View details"
              >
                <span className="material-symbols-outlined text-[18px]">chevron_right</span>
              </button>
            </TableCell>
          </TableRow>
        ))}
      </tbody>
    </Table>
  );
}
