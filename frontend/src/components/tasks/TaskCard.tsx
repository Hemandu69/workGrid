import React from 'react';
import { Task } from '../../types/task';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';

interface TaskCardProps {
  task: Task;
  onOpenDetails?: (task: Task) => void;
  onUpdateStatus?: (task: Task, newStatus: string) => void;
}

export function TaskCard({ task, onOpenDetails, onUpdateStatus }: TaskCardProps) {
  const progressPercentage = Math.min(
    Math.round((task.allocatedHours / (task.estimatedHours || 1)) * 100),
    100
  );

  return (
    <div className="bg-surface-bright border border-surface-outline rounded p-5 relative overflow-hidden transition-all hover:border-slate-400/80 shadow-xs">
      {/* Top Status Strip */}
      <div
        className={`absolute top-0 left-0 w-full h-[3px] ${
          task.status === 'IN_PROGRESS'
            ? 'bg-status-busy'
            : task.status === 'BLOCKED'
            ? 'bg-status-blocked'
            : task.status === 'COMPLETED'
            ? 'bg-status-available'
            : 'bg-primary'
        }`}
      />

      {/* Header */}
      <div className="flex justify-between items-start gap-4">
        <div>
          {task.campaignTitle && (
            <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block mb-1">
              {task.campaignTitle}
            </span>
          )}
          <div className="flex items-center gap-1.5">
            <h3 className="text-base font-semibold text-primary leading-snug hover:underline cursor-pointer" onClick={() => onOpenDetails?.(task)}>
              {task.title}
            </h3>
            {task.taskType === 'TEAM' && (
              <span className="shrink-0 px-1.5 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider bg-secondary-container text-on-secondary-container">
                Team · {task.teamSection}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Badge priority={task.priority} />
          <Badge status={task.status} />
        </div>
      </div>

      <p className="text-xs text-on-surface-variant mt-2 line-clamp-2 leading-relaxed">
        {task.description}
      </p>

      {/* Progress & Effort */}
      <div className="mt-4 pt-3 border-t border-surface-outline space-y-2">
        <div className="flex justify-between text-xs text-on-surface-variant tabular-nums">
          <span>Effort Allocation</span>
          <span className="font-semibold text-primary">
            {task.allocatedHours} / {task.estimatedHours}h ({progressPercentage}%)
          </span>
        </div>

        {/* Progress Bar */}
        <div className="w-full h-1.5 bg-surface-container rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              task.status === 'COMPLETED'
                ? 'bg-status-available'
                : task.status === 'BLOCKED'
                ? 'bg-status-blocked'
                : 'bg-primary'
            }`}
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
      </div>

      {/* Footer Info & Actions */}
      <div className="mt-4 pt-3 border-t border-surface-outline flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3 text-on-surface-variant tabular-nums">
          <span className="flex items-center gap-1 font-mono text-[11px]">
            <span className="material-symbols-outlined text-[14px]">meeting_room</span>
            {task.assigneeSubroom} ({task.assigneeRoom})
          </span>
          <span className="flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px]">schedule</span>
            Due {new Date(task.dueDate).toLocaleDateString()}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {task.status !== 'COMPLETED' && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onUpdateStatus?.(task, 'COMPLETED')}
            >
              Mark Done
            </Button>
          )}
          <Button size="sm" variant="primary" onClick={() => onOpenDetails?.(task)}>
            View Details
          </Button>
        </div>
      </div>
    </div>
  );
}
