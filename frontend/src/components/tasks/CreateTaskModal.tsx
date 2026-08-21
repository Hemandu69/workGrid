'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Button } from '../ui/Button';
import { useAuth } from '../../lib/auth-context';
import { TaskPriority } from '../../types/task';
import { User } from '../../types/auth';
import { TaskCampaign } from '../../types/task';
import { apiClient } from '../../lib/api-client';

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
  const [assigneeId, setAssigneeId] = useState('');
  const [dueDate, setDueDate] = useState(() => new Date(Date.now() + 86400000 * 4).toISOString().split('T')[0]);
  const [campaignId, setCampaignId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [campaigns, setCampaigns] = useState<TaskCampaign[]>([]);

  const loadDependencies = useCallback(async () => {
    try {
      const [usersData, campaignsData] = await Promise.all([
        apiClient.getUsers().catch(() => []),
        apiClient.getCampaigns().catch(() => []),
      ]);

      if (Array.isArray(usersData)) {
        setUsers(usersData);
        if (usersData.length > 0 && !assigneeId) {
          setAssigneeId(usersData[0].id);
        }
      }
      if (Array.isArray(campaignsData)) {
        setCampaigns(campaignsData);
      }
    } catch {
      // Handled
    }
  }, [assigneeId]);

  useEffect(() => {
    if (isOpen) {
      loadDependencies();
    }
  }, [isOpen, loadDependencies]);

  // Server role constraint: Servers can only assign to active members in their own room
  const availableAssignees =
    role === 'SERVER' && user.room
      ? users.filter((m) => m.room === user.room)
      : users;

  const assigneeOptions = availableAssignees.map((m) => ({
    value: m.id,
    label: `${m.name} (${m.subroom ? `${m.subroom} • ` : ''}${m.title || m.role || 'Member'})`,
  }));

  const priorityOptions = [
    { value: 'LOW', label: 'Low Priority' },
    { value: 'MEDIUM', label: 'Medium Priority' },
    { value: 'HIGH', label: 'High Priority' },
    { value: 'CRITICAL', label: 'Critical' },
  ];

  const campaignOptions = [
    { value: '', label: 'None (Standalone Task)' },
    ...campaigns.map((c) => ({ value: c.id, label: c.title })),
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSubmitting(true);
    try {
      await apiClient.createTask({
        title,
        description,
        priority,
        estimatedHours: Number(estimatedHours) || 8,
        assigneeId: assigneeId || availableAssignees[0]?.id,
        dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
        campaignId: campaignId || undefined,
      });

      setIsSubmitting(false);
      setTitle('');
      setDescription('');
      onTaskCreated?.();
      onClose();
    } catch {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={role === 'SERVER' ? `Assign Task (${user.room || 'Room B'} Hierarchy)` : 'Create & Assign Task'}
      description={
        role === 'SERVER'
          ? 'As a Server/Team Lead, you can assign tasks to members in your top-level room.'
          : 'Global task dispatch across all sections and active room members.'
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

        {/* Task Description */}
        <div>
          <label className="block text-xs font-semibold text-primary mb-1.5 uppercase tracking-wider">
            Task Description & Deliverables
          </label>
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Include operational requirements, steps, and expected outcome..."
            className="w-full px-3 py-2 bg-surface-container-low border border-surface-outline rounded text-xs text-on-surface placeholder:text-outline focus:outline-none focus:border-2 focus:border-primary transition-all resize-none"
          />
        </div>

        {/* Priority & Campaign Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select
            label="Priority Level"
            value={priority}
            onChange={(e) => setPriority(e.target.value as TaskPriority)}
            options={priorityOptions}
          />

          <Select
            label="Belongs to Campaign (Optional)"
            value={campaignId}
            onChange={(e) => setCampaignId(e.target.value)}
            options={campaignOptions}
          />
        </div>

        {/* Assignee & Estimated Hours Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-2">
            <Select
              label="Assigned Member"
              value={assigneeId || availableAssignees[0]?.id || ''}
              onChange={(e) => setAssigneeId(e.target.value)}
              options={assigneeOptions}
            />
          </div>

          <Input
            label="Est. Hours"
            type="number"
            min="1"
            max="40"
            value={estimatedHours}
            onChange={(e) => setEstimatedHours(e.target.value)}
          />
        </div>

        {/* Due Date */}
        <Input
          label="Due Date"
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
        />
      </form>
    </Modal>
  );
}
