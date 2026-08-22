'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Button } from '../ui/Button';
import { useAuth } from '../../lib/auth-context';
import { TaskPriority, TaskType } from '../../types/task';
import { TaskCampaign } from '../../types/task';
import { apiClient } from '../../lib/api-client';
import { useUsers } from '../../lib/useUsers';
import { useRooms } from '../../lib/useRooms';
import { Room } from '../../types/room';

interface CreateTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTaskCreated?: () => void;
}

// Stable empty-array reference so a still-loading query's `data ?? []`
// fallback doesn't recreate a new array identity on every render (which
// would otherwise retrigger the effect below on every re-render while
// loading, per its `rooms` dependency).
const EMPTY_ROOMS: Room[] = [];

/** Extracts the section letter from a "Room B"-style display string. */
function sectionLetterOf(room?: string): string {
  if (!room) return '';
  return room.trim().split(' ').pop() || '';
}

export function CreateTaskModal({ isOpen, onClose, onTaskCreated }: CreateTaskModalProps) {
  const { user, role } = useAuth();
  // Only ADMIN/SUPER_ADMIN/TEAM_LEAD can create tasks at all (route-level
  // enforced on the backend); TEAM_LEAD is further restricted to their own
  // section. Only ADMIN/SUPER_ADMIN/TEAM_LEAD get the Team Task option —
  // MEMBER never reaches this modal, and SERVER no longer creates tasks.
  const canChooseTeamTask = role === 'SUPER_ADMIN' || role === 'ADMIN' || role === 'TEAM_LEAD';
  const ownSectionLetter = sectionLetterOf(user.room);

  const [taskType, setTaskType] = useState<TaskType>('INDIVIDUAL');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('MEDIUM');
  const [estimatedHours, setEstimatedHours] = useState('8');
  const [assigneeId, setAssigneeId] = useState('');
  const [teamSection, setTeamSection] = useState('');
  const [dueDate, setDueDate] = useState(() => new Date(Date.now() + 86400000 * 4).toISOString().split('T')[0]);
  const [campaignId, setCampaignId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [campaigns, setCampaigns] = useState<TaskCampaign[]>([]);
  // One key per fresh form-open, reused across retries of that same
  // submission attempt so a slow-network retry never creates a duplicate
  // task; a new attempt (reopening the form) gets a new key.
  const idempotencyKeyRef = useRef<string>('');

  // Shared, cached queries — this modal is always mounted (visibility is
  // purely the isOpen prop below), so previously it re-fetched users/rooms
  // from scratch on every single open. Now it reads from the same cache the
  // hosting dashboard already populated, and only actually refetches when
  // the cache is genuinely stale or a realtime event invalidates it.
  const { data: usersResult } = useUsers({ limit: 200 });
  const { data: roomsData } = useRooms();
  const users = usersResult?.items ?? [];
  const rooms = roomsData ?? EMPTY_ROOMS;

  const loadCampaigns = useCallback(async () => {
    const campaignsData = await apiClient.getCampaigns().catch(() => []);
    if (Array.isArray(campaignsData)) setCampaigns(campaignsData);
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadCampaigns();
      setTaskType('INDIVIDUAL');
      setTeamSection(role === 'TEAM_LEAD' ? ownSectionLetter : '');
      idempotencyKeyRef.current = crypto.randomUUID();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Default the assignee to the first eligible user once the (cached or
  // freshly fetched) user list is available and none has been chosen yet.
  useEffect(() => {
    if (!assigneeId && users.length > 0) {
      setAssigneeId(users[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users]);

  // The Team/Section <select> always visually shows its first option even
  // before a value is chosen — keep the real state in sync with that so
  // submitting without touching the dropdown still sends a valid section.
  useEffect(() => {
    if (taskType === 'TEAM' && !teamSection && role !== 'TEAM_LEAD' && rooms.length > 0) {
      setTeamSection(rooms[0].letter);
    }
  }, [taskType, teamSection, role, rooms]);

  // Mirrors the backend's authoritative checks — these only prevent an
  // obviously-doomed selection, they are not themselves the source of truth.
  // Only operational roles may receive task assignments (never HR/ADMIN/SUPER_ADMIN).
  const taskEligibleUsers = users.filter((m) => m.role === 'MEMBER' || m.role === 'TEAM_LEAD' || m.role === 'SERVER');
  // Team Lead constraint: scoped to active members in their own room.
  const availableAssignees = role === 'TEAM_LEAD' && user.room ? taskEligibleUsers.filter((m) => m.room === user.room) : taskEligibleUsers;

  const assigneeOptions = availableAssignees.map((m) => ({
    value: m.id,
    label: `${m.name} (${m.subroom ? `${m.subroom} • ` : ''}${m.title || m.role || 'Member'})`,
  }));

  const sectionOptions =
    role === 'TEAM_LEAD'
      ? [{ value: ownSectionLetter, label: `Section ${ownSectionLetter} (Your Team)` }]
      : rooms.map((r) => ({ value: r.letter, label: `Section ${r.letter}` }));

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

  const isValid = title.trim().length > 0 && (taskType === 'INDIVIDUAL' ? Boolean(assigneeId) : Boolean(teamSection));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;

    setIsSubmitting(true);
    try {
      await apiClient.createTask(
        {
          title,
          description,
          priority,
          estimatedHours: Number(estimatedHours) || 8,
          dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
          campaignId: campaignId || undefined,
          ...(taskType === 'TEAM'
            ? { taskType: 'TEAM' as TaskType, teamSection }
            : { taskType: 'INDIVIDUAL' as TaskType, assigneeId: assigneeId || availableAssignees[0]?.id }),
        },
        undefined,
        idempotencyKeyRef.current
      );

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
      title="Create & Assign Task"
      description="Assign work to a person, or to a whole team for the team's lead to distribute."
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
            disabled={!isValid}
          >
            {taskType === 'TEAM' ? 'Create Team Task' : 'Assign Task'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {canChooseTeamTask && (
          <div className="flex items-center gap-2 p-1 bg-surface-container-low border border-surface-outline rounded w-fit">
            <button
              type="button"
              onClick={() => setTaskType('INDIVIDUAL')}
              className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
                taskType === 'INDIVIDUAL' ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Individual Task
            </button>
            <button
              type="button"
              onClick={() => setTaskType('TEAM')}
              className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
                taskType === 'TEAM' ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Team Task
            </button>
          </div>
        )}

        {/* Task Title */}
        <Input
          label="Task Title"
          placeholder="e.g. Review Q3 Client Onboarding Checklist"
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

        {/* Assignee (individual) or Team/Section (team) & Estimated Hours Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-2">
            {taskType === 'TEAM' ? (
              <Select
                label="Team / Section"
                value={teamSection}
                onChange={(e) => setTeamSection(e.target.value)}
                options={sectionOptions}
                disabled={role === 'TEAM_LEAD'}
              />
            ) : (
              <Select
                label="Assigned Member"
                value={assigneeId || availableAssignees[0]?.id || ''}
                onChange={(e) => setAssigneeId(e.target.value)}
                options={assigneeOptions}
              />
            )}
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

        {taskType === 'TEAM' && (
          <p className="text-[11px] text-on-surface-variant bg-surface-container-low border border-surface-outline rounded p-2">
            This task starts unassigned. Section {teamSection || '—'}&apos;s Team Lead will assign it to one member or split it across several.
          </p>
        )}

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
