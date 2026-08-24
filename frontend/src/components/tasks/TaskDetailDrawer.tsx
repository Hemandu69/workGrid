'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Task, TaskStatus } from '../../types/task';
import { User } from '../../types/auth';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Avatar } from '../ui/Avatar';
import { useAuth } from '../../lib/auth-context';
import { apiClient, ApiError } from '../../lib/api-client';
import { useDomainEvent } from '../../lib/realtime-context';
import { formatToISTTime, formatToISTDate, formatToISTDateTime } from '../../lib/time-utils';
import { SplitTeamTaskModal } from './SplitTeamTaskModal';

interface TaskDetailDrawerProps {
  taskId: string | null;
  onClose: () => void;
}

/** Extracts the section letter from a "Room B"-style display string. */
function sectionLetterOf(room?: string): string {
  if (!room) return '';
  return room.trim().split(' ').pop() || '';
}

/** Mirrors backend/src/utils/task-lifecycle.ts — keep in sync. */
const VALID_STATUS_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  DRAFT: ['ASSIGNED', 'CANCELLED'],
  ASSIGNED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['BLOCKED', 'SUBMITTED', 'COMPLETED', 'CANCELLED'],
  BLOCKED: ['IN_PROGRESS', 'CANCELLED'],
  SUBMITTED: ['IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
  COMPLETED: ['IN_PROGRESS', 'ASSIGNED'],
  CANCELLED: [],
};

export function TaskDetailDrawer({ taskId, onClose }: TaskDetailDrawerProps) {
  const { user, role } = useAuth();
  const [task, setTask] = useState<Task | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isMutating, setIsMutating] = useState(false);

  const [commentText, setCommentText] = useState('');
  const [progressDraft, setProgressDraft] = useState(0);

  const [assignees, setAssignees] = useState<User[]>([]);
  const [reassignTargetId, setReassignTargetId] = useState('');
  const [isReassignOpen, setIsReassignOpen] = useState(false);
  const [isSplitOpen, setIsSplitOpen] = useState(false);

  // Monotonic fetch counter — a slow prior response can never overwrite a newer one.
  const fetchSeq = useRef(0);

  const refresh = useCallback(
    (silent = false) => {
      if (!taskId) return;
      const seq = ++fetchSeq.current;
      if (!silent) {
        setIsLoading(true);
        setError(null);
      }
      apiClient
        .getTask(taskId)
        .then((res) => {
          if (seq !== fetchSeq.current) return;
          setTask(res);
          setProgressDraft(res.progress);
          setIsLoading(false);
        })
        .catch((err) => {
          if (seq !== fetchSeq.current) return;
          if (!silent) setError(err instanceof Error ? err.message : 'Failed to load task');
          setIsLoading(false);
        });
    },
    [taskId]
  );

  useEffect(() => {
    if (!taskId) {
      setTask(null);
      return;
    }
    refresh(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  // Silent authoritative refresh whenever this specific task changes anywhere —
  // never closes/reopens the drawer, never touches unrelated task events.
  useDomainEvent(
    [
      'TASK_UPDATED',
      'TASK_REASSIGNED',
      'TASK_STATUS_CHANGED',
      'TASK_PROGRESS_CHANGED',
      'TASK_COMPLETED',
      'TASK_CANCELLED',
    ],
    (event) => {
      if (!taskId) return;
      const payload = event.payload as { taskId?: string } | null;
      if (event.entityId === taskId || payload?.taskId === taskId) {
        refresh(true);
      }
    }
  );

  const canManage =
    Boolean(task) &&
    Boolean(user) &&
    (role === 'SUPER_ADMIN' ||
      role === 'ADMIN' ||
      role === 'TEAM_LEAD' ||
      user.id === task?.creatorId ||
      user.id === task?.assigneeId);
  const canReassign = role === 'SUPER_ADMIN' || role === 'ADMIN' || role === 'TEAM_LEAD';
  const canCancel =
    role === 'SUPER_ADMIN' || role === 'ADMIN' || (Boolean(task) && Boolean(user) && user.id === task?.creatorId) || role === 'TEAM_LEAD';

  // Mirrors the backend's canManageTeamTask — an unassigned team task can
  // only be assigned/split by an org manager or that section's own Team Lead.
  const canManageThisTeamTask =
    role === 'SUPER_ADMIN' ||
    role === 'ADMIN' ||
    (role === 'TEAM_LEAD' && Boolean(task?.teamSection) && sectionLetterOf(user.room) === task?.teamSection);
  const isUnassignedTeamTask = Boolean(task) && task?.taskType === 'TEAM' && !task?.assigneeId;

  useEffect(() => {
    if (!isReassignOpen) return;
    apiClient
      .getUsers({ limit: 200 })
      .then((result) => {
        let eligible = result.items.filter((u) => u.role === 'MEMBER' || u.role === 'TEAM_LEAD' || u.role === 'SERVER');
        // A team task can only go to a member of its own section.
        if (task?.taskType === 'TEAM' && task.teamSection) {
          eligible = eligible.filter((u) => sectionLetterOf(u.room) === task.teamSection);
        }
        setAssignees(eligible);
      })
      .catch(() => setAssignees([]));
  }, [isReassignOpen, task?.taskType, task?.teamSection]);

  const runAction = async (fn: () => Promise<Task>) => {
    if (isMutating) return;
    setIsMutating(true);
    setActionError(null);
    try {
      const updated = await fn();
      setTask(updated);
      setProgressDraft(updated.progress);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Action failed.');
    } finally {
      setIsMutating(false);
    }
  };

  const handleStatusChange = (status: TaskStatus) => {
    if (!task) return;
    runAction(() => apiClient.updateTaskStatus(task.dbId || task.id, status));
  };

  const handleProgressCommit = () => {
    if (!task || progressDraft === task.progress) return;
    runAction(() => apiClient.updateTaskProgress(task.dbId || task.id, progressDraft));
  };

  const handleReassign = () => {
    if (!task || !reassignTargetId) return;
    runAction(() => apiClient.reassignTask(task.dbId || task.id, reassignTargetId)).then(() => {
      setIsReassignOpen(false);
      setReassignTargetId('');
    });
  };

  const handleCancel = () => {
    if (!task) return;
    runAction(() => apiClient.cancelTask(task.dbId || task.id));
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!task || !commentText.trim() || isMutating) return;
    setIsMutating(true);
    setActionError(null);
    try {
      await apiClient.addTaskComment(task.dbId || task.id, commentText.trim());
      setCommentText('');
      refresh(true);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Failed to post comment.');
    } finally {
      setIsMutating(false);
    }
  };

  if (!taskId) return null;

  const validNextStatuses = task ? VALID_STATUS_TRANSITIONS[task.status] || [] : [];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs" onClick={onClose} />

      <div className="relative w-full max-w-xl bg-surface-bright border-l border-surface-outline h-full shadow-2xl z-10 flex flex-col animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-surface-outline bg-surface-container-low flex items-center justify-between">
          <div className="flex items-center gap-2">
            {task && (
              <>
                <span className="font-mono text-xs font-bold text-primary">{task.id}</span>
                <Badge priority={task.priority} />
                <Badge status={task.status}>{isUnassignedTeamTask ? 'Open' : undefined}</Badge>
                {task.taskType === 'TEAM' && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-secondary-container text-on-secondary-container">
                    Team Task · Section {task.teamSection}
                  </span>
                )}
              </>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {isLoading && (
          <div className="flex flex-col items-center justify-center py-16 space-y-3 text-on-surface-variant">
            <span className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-xs font-mono">Loading task...</p>
          </div>
        )}

        {error && !isLoading && (
          <div className="m-6 p-4 bg-rose-50 border border-rose-200 rounded text-rose-800 text-xs space-y-2">
            <p>{error}</p>
            <Button variant="outline" size="sm" onClick={() => refresh(false)}>
              Retry
            </Button>
          </div>
        )}

        {task && !isLoading && (
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Title & Campaign */}
            <div>
              {task.campaignTitle && (
                <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block mb-1">
                  Campaign: {task.campaignTitle}
                </span>
              )}
              <h2 className="text-lg font-bold text-primary">{task.title}</h2>
            </div>

            {/* Description */}
            <div>
              <h4 className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">
                Description
              </h4>
              <p className="text-xs text-on-surface leading-relaxed bg-surface-container-low p-3.5 rounded border border-surface-outline">
                {task.description || 'No description provided.'}
              </p>
            </div>

            {actionError && (
              <div className="p-2.5 rounded border border-status-blocked bg-rose-50 text-status-blocked text-xs font-medium">
                {actionError}
              </div>
            )}

            {/* Status Switcher — only valid forward transitions are offered */}
            <div>
              <h4 className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">
                Update Status
              </h4>
              <div className="flex flex-wrap gap-1.5">
                <span
                  className="px-2.5 py-1 rounded text-xs font-semibold border bg-primary text-on-primary border-primary shadow-xs"
                >
                  {isUnassignedTeamTask ? 'Open' : task.status.replace('_', ' ')}
                </span>
                {canManage &&
                  validNextStatuses
                    .filter((st) => st !== 'CANCELLED' || canCancel)
                    // An unassigned team task can only move to ASSIGNED via
                    // "Assign to Member"/"Split Among Team" — never a bare
                    // status flip that would leave it assigned to no one.
                    .filter((st) => !(isUnassignedTeamTask && st === 'ASSIGNED'))
                    .map((st) => (
                      <button
                        key={st}
                        disabled={isMutating}
                        onClick={() => handleStatusChange(st)}
                        className="px-2.5 py-1 rounded text-xs font-medium border bg-surface-bright text-on-surface border-surface-outline hover:bg-surface-container transition-all disabled:opacity-50"
                      >
                        → {st.replace('_', ' ')}
                      </button>
                    ))}
              </div>
              {!canManage && (
                <p className="text-[10px] text-on-surface-variant mt-1.5">
                  You can view this task but are not authorized to change its status.
                </p>
              )}
            </div>

            {/* Progress */}
            <div>
              <h4 className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2 flex items-center justify-between">
                <span>Progress</span>
                <span className="font-mono text-primary">{progressDraft}%</span>
              </h4>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={progressDraft}
                disabled={!canManage || isMutating || task.status === 'CANCELLED'}
                onChange={(e) => setProgressDraft(Number(e.target.value))}
                onMouseUp={handleProgressCommit}
                onTouchEnd={handleProgressCommit}
                className="w-full accent-primary disabled:opacity-50"
              />
            </div>

            {/* Meta Grid */}
            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-surface-outline text-xs">
              <div>
                <span className="text-on-surface-variant block mb-1">Assignee</span>
                {isUnassignedTeamTask ? (
                  <p className="font-semibold text-on-surface-variant italic">Unassigned — Section {task.teamSection}</p>
                ) : (
                  <div className="flex items-center gap-2">
                    <Avatar src={task.assigneeAvatar} name={task.assigneeName} size="sm" />
                    <div>
                      <p className="font-semibold text-primary">{task.assigneeName}</p>
                      <p className="text-[10px] text-on-surface-variant font-mono">
                        {task.assigneeSubroom} • {task.assigneeRoom}
                      </p>
                    </div>
                  </div>
                )}
                {task.status !== 'COMPLETED' && task.status !== 'CANCELLED' && (
                  <div className="flex items-center gap-2 mt-1.5">
                    {(isUnassignedTeamTask ? canManageThisTeamTask : canReassign) && (
                      <button
                        type="button"
                        onClick={() => setIsReassignOpen((v) => !v)}
                        className="text-[10px] font-semibold text-secondary hover:text-primary transition-colors"
                      >
                        {isUnassignedTeamTask ? 'Assign to Member' : 'Reassign'}
                      </button>
                    )}
                    {isUnassignedTeamTask && canManageThisTeamTask && (
                      <button
                        type="button"
                        onClick={() => setIsSplitOpen(true)}
                        className="text-[10px] font-semibold text-secondary hover:text-primary transition-colors"
                      >
                        Split Among Team
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div>
                <span className="text-on-surface-variant block mb-1">Assigned By</span>
                <p className="font-semibold text-primary">{task.creatorName}</p>
                <p className="text-[10px] text-on-surface-variant">
                  Created on {formatToISTDate(task.createdAt)}
                </p>
              </div>

              <div>
                <span className="text-on-surface-variant block mb-1">Due Date</span>
                <p className="font-mono text-primary font-semibold">
                  {formatToISTDateTime(task.dueDate)}
                </p>
              </div>

              {task.completedAt && (
                <div className="col-span-2">
                  <span className="text-on-surface-variant block mb-1">Completed At</span>
                  <p className="font-mono text-emerald-700 font-semibold">
                    {formatToISTDateTime(task.completedAt)}
                  </p>
                </div>
              )}
            </div>

            {isReassignOpen && (
              <div className="p-3 bg-surface-container-low border border-surface-outline rounded space-y-2">
                <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
                  {isUnassignedTeamTask ? 'Assign to' : 'Reassign to'}
                </label>
                <select
                  value={reassignTargetId}
                  onChange={(e) => setReassignTargetId(e.target.value)}
                  className="w-full px-2 py-1.5 bg-surface-bright border border-surface-outline rounded text-xs text-on-surface focus:outline-none focus:border-primary"
                >
                  <option value="">Select a member...</option>
                  {assignees
                    .filter((a) => a.id !== task.assigneeId)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} {a.subroom ? `(${a.subroom})` : ''}
                      </option>
                    ))}
                </select>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => setIsReassignOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={!reassignTargetId || isMutating}
                    onClick={handleReassign}
                  >
                    {isUnassignedTeamTask ? 'Confirm Assignment' : 'Confirm Reassignment'}
                  </Button>
                </div>
              </div>
            )}

            {canCancel && task.status !== 'COMPLETED' && task.status !== 'CANCELLED' && (
              <div className="flex justify-end">
                <Button variant="danger" size="sm" disabled={isMutating} onClick={handleCancel}>
                  Cancel Task
                </Button>
              </div>
            )}

            {/* Assignment & Status History */}
            {task.history && task.history.length > 0 && (
              <div className="pt-4 border-t border-surface-outline space-y-2">
                <h4 className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">
                  History
                </h4>
                <div className="space-y-1.5">
                  {task.history.map((h) => (
                    <div key={h.id} className="text-[11px] text-on-surface-variant flex items-start gap-1.5">
                      <span className="material-symbols-outlined text-[13px] text-secondary mt-0.5">history</span>
                      <span>
                        <strong className="text-primary">{h.changedByName}</strong>{' '}
                        {describeHistoryEntry(h.action, h.details)}
                        <span className="text-outline"> · {formatToISTTime(h.createdAt)}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Activity / Comments Section */}
            <div className="pt-4 border-t border-surface-outline space-y-4">
              <h4 className="text-xs font-bold text-on-surface-variant uppercase tracking-wider flex items-center justify-between">
                <span>Activity & Comments</span>
                <span className="font-mono text-[10px]">{task.comments?.length ?? 0} entries</span>
              </h4>

              <div className="space-y-3">
                {(task.comments || []).map((cm) => (
                  <div key={cm.id} className="p-3 rounded bg-surface-container-low border border-surface-outline text-xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Avatar src={cm.authorAvatar} name={cm.authorName} size="sm" />
                        <span className="font-semibold text-primary">{cm.authorName}</span>
                      </div>
                      <span className="text-[10px] font-mono text-on-surface-variant">
                        {formatToISTTime(cm.createdAt)}
                      </span>
                    </div>
                    <p className="text-on-surface pl-7">{cm.content}</p>
                  </div>
                ))}
              </div>

              <form onSubmit={handleAddComment} className="space-y-2 pt-2">
                <textarea
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Write a comment or status update..."
                  rows={2}
                  className="w-full bg-surface-bright border border-surface-outline rounded p-2.5 text-xs text-on-surface placeholder:text-outline focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
                <div className="flex justify-end">
                  <Button size="sm" variant="primary" type="submit" disabled={!commentText.trim() || isMutating}>
                    Post Update
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>

      {task && (
        <SplitTeamTaskModal
          isOpen={isSplitOpen}
          onClose={() => setIsSplitOpen(false)}
          task={task}
          onSplit={() => {
            setIsSplitOpen(false);
            refresh(true);
          }}
        />
      )}
    </div>
  );
}

function describeHistoryEntry(action: string, details: Record<string, unknown>): string {
  switch (action) {
    case 'TASK_CREATED':
      return details.taskType === 'TEAM'
        ? `created this team task for Section ${details.teamSection || '—'}`
        : `created this task, assigned to ${details.assigneeName || 'someone'}`;
    case 'TASK_ASSIGNED':
      return `assigned this task to ${details.assigneeName || 'someone'}`;
    case 'TASK_REASSIGNED':
      return `reassigned from ${details.previousAssigneeName || 'unassigned'} to ${details.newAssigneeName || 'someone'}`;
    case 'TASK_STATUS_CHANGED':
      return `changed status from ${details.previousStatus} to ${details.newStatus}`;
    case 'TASK_PROGRESS_CHANGED':
      return `updated progress from ${details.previousProgress}% to ${details.newProgress}%`;
    case 'TASK_SPLIT': {
      const names = Array.isArray(details.childAssigneeNames) ? (details.childAssigneeNames as string[]) : [];
      return `split this task among ${names.length || 'several'} members${names.length ? ` (${names.join(', ')})` : ''}`;
    }
    default:
      return action.replace(/_/g, ' ').toLowerCase();
  }
}
