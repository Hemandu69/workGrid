'use client';

import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Button } from '../ui/Button';
import { useAuth } from '../../lib/auth-context';
import { MOCK_ROOM_B_MEMBERS, MOCK_CAMPAIGNS } from '../../lib/mock-data';
import { TaskPriority } from '../../types/task';

interface CreateTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTaskCreated?: () => void;
}

export function CreateTaskModal({ isOpen, onClose, onTaskCreated }: CreateTaskModalProps) {
  const { user, role } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('MEDIUM');
  const [estimatedHours, setEstimatedHours] = useState('8');
  const [assigneeId, setAssigneeId] = useState(MOCK_ROOM_B_MEMBERS[0].id);
  const [dueDate, setDueDate] = useState('2026-08-25');
  const [campaignId, setCampaignId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Server role constraint: Servers can only assign to active members in their own room
  const availableAssignees =
    role === 'SERVER'
      ? MOCK_ROOM_B_MEMBERS.filter((m) => m.room === user.room)
      : MOCK_ROOM_B_MEMBERS;

  const assigneeOptions = availableAssignees.map((m) => ({
    value: m.id,
    label: `${m.name} (${m.subroom} • ${m.title})`,
  }));

  const priorityOptions = [
    { value: 'LOW', label: 'Low Priority' },
    { value: 'MEDIUM', label: 'Medium Priority' },
    { value: 'HIGH', label: 'High Priority' },
    { value: 'CRITICAL', label: 'Critical' },
  ];

  const campaignOptions = [
    { value: '', label: 'None (Standalone Task)' },
    ...MOCK_CAMPAIGNS.map((c) => ({ value: c.id, label: c.title })),
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      setTitle('');
      setDescription('');
      onTaskCreated?.();
      onClose();
    }, 400);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={role === 'SERVER' ? `Assign Task (Room ${user.room || 'B'} Hierarchy)` : 'Create & Assign Task'}
      description={
        role === 'SERVER'
          ? 'As a Server/Team Lead, you can assign tasks to members in your top-level room.'
          : 'Global task dispatch across all sectors and active room members.'
      }
      maxWidth="lg"
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSubmit}
            isLoading={isSubmitting}
            disabled={!title.trim()}
          >
            Assign Task
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Task Title */}
        <Input
          label="Task Title"
          placeholder="e.g. Audit Redis Rate Limiter Policies"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />

        {/* Description */}
        <div className="space-y-1">
          <label className="block text-xs font-semibold text-on-surface uppercase tracking-wider">
            Description & Acceptance Criteria
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Detailed description of the deliverables and verification steps..."
            className="w-full bg-surface-bright border border-surface-outline rounded p-2.5 text-xs text-on-surface placeholder:text-outline focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </div>

        {/* Assignee & Priority */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Select
            label="Assignee"
            options={assigneeOptions}
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)}
          />

          <Select
            label="Priority Level"
            options={priorityOptions}
            value={priority}
            onChange={(e) => setPriority(e.target.value as TaskPriority)}
          />
        </div>

        {/* Effort & Due Date */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label="Estimated Effort (Hours)"
            type="number"
            min="1"
            max="40"
            value={estimatedHours}
            onChange={(e) => setEstimatedHours(e.target.value)}
            required
          />

          <Input
            label="Due Date"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            required
          />
        </div>

        {/* Campaign Link */}
        <Select
          label="Link to Campaign (Optional)"
          options={campaignOptions}
          value={campaignId}
          onChange={(e) => setCampaignId(e.target.value)}
        />
      </form>
    </Modal>
  );
}
