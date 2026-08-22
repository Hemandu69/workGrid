'use client';

import React, { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { apiClient, ApiError } from '../../lib/api-client';
import { Task } from '../../types/task';
import { User } from '../../types/auth';

interface SplitTeamTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: Task;
  onSplit?: () => void;
}

interface SplitRow {
  assigneeId: string;
  title: string;
}

function sectionLetterOf(room?: string): string {
  if (!room) return '';
  return room.trim().split(' ').pop() || '';
}

/**
 * Deliberately minimal: a team task's work items are just a list of
 * {member, title} rows — no drag-and-drop, no automatic hour splitting.
 */
export function SplitTeamTaskModal({ isOpen, onClose, task, onSplit }: SplitTeamTaskModalProps) {
  const [members, setMembers] = useState<User[]>([]);
  const [rows, setRows] = useState<SplitRow[]>([
    { assigneeId: '', title: '' },
    { assigneeId: '', title: '' },
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setRows([
      { assigneeId: '', title: '' },
      { assigneeId: '', title: '' },
    ]);
    setError(null);
    apiClient
      .getUsers()
      .then((users) => {
        const eligible = Array.isArray(users)
          ? users.filter(
              (u) => (u.role === 'MEMBER' || u.role === 'TEAM_LEAD' || u.role === 'SERVER') && sectionLetterOf(u.room) === task.teamSection
            )
          : [];
        setMembers(eligible);
      })
      .catch(() => setMembers([]));
  }, [isOpen, task.teamSection]);

  const updateRow = (index: number, patch: Partial<SplitRow>) => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const addRow = () => setRows((prev) => [...prev, { assigneeId: '', title: '' }]);
  const removeRow = (index: number) => setRows((prev) => prev.filter((_, i) => i !== index));

  const isValid = rows.length >= 2 && rows.every((r) => r.assigneeId && r.title.trim().length >= 3);

  const handleSubmit = async () => {
    if (!isValid || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await apiClient.splitTeamTask(
        task.dbId || task.id,
        rows.map((r) => ({ assigneeId: r.assigneeId, title: r.title.trim() }))
      );
      onSplit?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to split the task. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Split Among Team"
      description={`Divide this task into separate work items for members of Section ${task.teamSection}.`}
      maxWidth="lg"
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={handleSubmit} isLoading={isSubmitting} disabled={!isValid}>
            Split Task
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-xs">
        {error && (
          <div className="p-2.5 rounded border border-status-blocked bg-rose-50 text-status-blocked text-xs font-medium">
            {error}
          </div>
        )}

        {rows.map((row, i) => (
          <div key={i} className="flex items-end gap-2 p-2.5 bg-surface-container-low border border-surface-outline rounded">
            <div className="flex-1">
              <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">
                Member
              </label>
              <select
                value={row.assigneeId}
                onChange={(e) => updateRow(i, { assigneeId: e.target.value })}
                className="w-full px-2 py-1.5 bg-surface-bright border border-surface-outline rounded text-xs text-on-surface focus:outline-none focus:border-primary"
              >
                <option value="">Select a member...</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} {m.subroom ? `(${m.subroom})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-[2]">
              <Input
                label="Work Item"
                placeholder="e.g. Network audit"
                value={row.title}
                onChange={(e) => updateRow(i, { title: e.target.value })}
              />
            </div>
            {rows.length > 2 && (
              <button
                type="button"
                onClick={() => removeRow(i)}
                className="p-2 text-on-surface-variant hover:text-status-blocked transition-colors"
                aria-label="Remove work item"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            )}
          </div>
        ))}

        <Button variant="outline" size="sm" onClick={addRow} type="button">
          + Add Another Work Item
        </Button>
      </div>
    </Modal>
  );
}
