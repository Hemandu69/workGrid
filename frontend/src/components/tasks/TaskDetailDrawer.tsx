'use client';

import React, { useState } from 'react';
import { Task } from '../../types/task';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Avatar } from '../ui/Avatar';
import { useAuth } from '../../lib/auth-context';

interface TaskDetailDrawerProps {
  task: Task | null;
  onClose: () => void;
  onStatusChange?: (taskId: string, newStatus: Task['status']) => void;
}

export function TaskDetailDrawer({ task, onClose, onStatusChange }: TaskDetailDrawerProps) {
  const { user } = useAuth();
  const [commentText, setCommentText] = useState('');
  const [comments, setComments] = useState(task?.comments || []);

  if (!task) return null;

  const handleAddComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;

    const newComment = {
      id: `cm-${Date.now()}`,
      authorId: user.id,
      authorName: user.name,
      authorAvatar: user.avatarUrl,
      content: commentText.trim(),
      createdAt: new Date().toISOString(),
    };

    setComments([...comments, newComment]);
    setCommentText('');
  };

  const statuses: Array<Task['status']> = [
    'DRAFT',
    'ASSIGNED',
    'IN_PROGRESS',
    'BLOCKED',
    'SUBMITTED',
    'COMPLETED',
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs" onClick={onClose} />

      {/* Drawer Panel */}
      <div className="relative w-full max-w-xl bg-surface-bright border-l border-surface-outline h-full shadow-2xl z-10 flex flex-col animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-surface-outline bg-surface-container-low flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-bold text-primary">{task.id}</span>
            <Badge priority={task.priority} />
            <Badge status={task.status} />
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Content */}
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
              {task.description}
            </p>
          </div>

          {/* Status Switcher */}
          <div>
            <h4 className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">
              Update Status
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {statuses.map((st) => (
                <button
                  key={st}
                  onClick={() => onStatusChange?.(task.id, st)}
                  className={`px-2.5 py-1 rounded text-xs font-medium border transition-all ${
                    task.status === st
                      ? 'bg-primary text-on-primary border-primary shadow-xs font-semibold'
                      : 'bg-surface-bright text-on-surface border-surface-outline hover:bg-surface-container'
                  }`}
                >
                  {st.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>

          {/* Meta Grid */}
          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-surface-outline text-xs">
            <div>
              <span className="text-on-surface-variant block mb-1">Assignee</span>
              <div className="flex items-center gap-2">
                <Avatar src={task.assigneeAvatar} name={task.assigneeName} size="sm" />
                <div>
                  <p className="font-semibold text-primary">{task.assigneeName}</p>
                  <p className="text-[10px] text-on-surface-variant font-mono">
                    {task.assigneeSubroom} • {task.assigneeRoom}
                  </p>
                </div>
              </div>
            </div>

            <div>
              <span className="text-on-surface-variant block mb-1">Assigned By</span>
              <p className="font-semibold text-primary">{task.creatorName}</p>
              <p className="text-[10px] text-on-surface-variant">
                Created on {new Date(task.createdAt).toLocaleDateString()}
              </p>
            </div>

            <div>
              <span className="text-on-surface-variant block mb-1">Effort Allocation</span>
              <p className="font-mono text-primary font-semibold">
                {task.allocatedHours} / {task.estimatedHours} Hours
              </p>
            </div>

            <div>
              <span className="text-on-surface-variant block mb-1">Due Date</span>
              <p className="font-mono text-primary font-semibold">
                {new Date(task.dueDate).toLocaleDateString()} (18:00 UTC)
              </p>
            </div>
          </div>

          {/* Activity / Comments Section */}
          <div className="pt-4 border-t border-surface-outline space-y-4">
            <h4 className="text-xs font-bold text-on-surface-variant uppercase tracking-wider flex items-center justify-between">
              <span>Activity & Comments</span>
              <span className="font-mono text-[10px]">{comments.length} entries</span>
            </h4>

            {/* Comments List */}
            <div className="space-y-3">
              {comments.map((cm) => (
                <div key={cm.id} className="p-3 rounded bg-surface-container-low border border-surface-outline text-xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Avatar src={cm.authorAvatar} name={cm.authorName} size="sm" />
                      <span className="font-semibold text-primary">{cm.authorName}</span>
                    </div>
                    <span className="text-[10px] font-mono text-on-surface-variant">
                      {new Date(cm.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-on-surface pl-7">{cm.content}</p>
                </div>
              ))}
            </div>

            {/* Add Comment Box */}
            <form onSubmit={handleAddComment} className="space-y-2 pt-2">
              <textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Write a comment or status update..."
                rows={2}
                className="w-full bg-surface-bright border border-surface-outline rounded p-2.5 text-xs text-on-surface placeholder:text-outline focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
              <div className="flex justify-end">
                <Button size="sm" variant="primary" type="submit" disabled={!commentText.trim()}>
                  Post Update
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
