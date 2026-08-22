'use client';

import React, { useEffect, useState, useRef } from 'react';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { apiClient, ApiError } from '../../lib/api-client';
import { OrgEvent } from '../../types/org-event';

interface EventFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: (event: OrgEvent) => void;
  /** When set, the modal edits this event instead of creating a new one. */
  event?: OrgEvent | null;
}

function defaultDateTimeParts(scheduledAt?: string, scheduledEndAt?: string): { date: string; time: string; endTime: string } {
  const base = scheduledAt ? new Date(scheduledAt) : new Date(Date.now() + 24 * 3600000);
  const date = base.toISOString().split('T')[0];
  const time = `${String(base.getHours()).padStart(2, '0')}:${String(base.getMinutes()).padStart(2, '0')}`;

  const endBase = scheduledEndAt ? new Date(scheduledEndAt) : new Date(base.getTime() + 3600000);
  const endTime = `${String(endBase.getHours()).padStart(2, '0')}:${String(endBase.getMinutes()).padStart(2, '0')}`;

  return { date, time, endTime };
}

export function EventFormModal({ isOpen, onClose, onSaved, event }: EventFormModalProps) {
  const isEditMode = Boolean(event);
  // Once an event has started, its schedule can no longer be moved — only the
  // name/description remain editable (matches the backend's own guard).
  const isTimeLocked = isEditMode && (event?.status === 'LIVE' || event?.status === 'AWAITING_COMPLETION');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One key per fresh create-mode form-open, reused across retries of that
  // same submission attempt. Not needed for edits — those PATCH a specific
  // event id and are already idempotent by construction.
  const idempotencyKeyRef = useRef<string>('');

  useEffect(() => {
    if (!isOpen) return;
    const parts = defaultDateTimeParts(event?.scheduledAt, event?.scheduledEndAt);
    setTitle(event?.title || '');
    setDescription(event?.description || '');
    setDate(parts.date);
    setTime(parts.time);
    setEndTime(parts.endTime);
    setError(null);
    if (!event) idempotencyKeyRef.current = crypto.randomUUID();
  }, [isOpen, event]);

  const isValid =
    title.trim().length >= 3 && description.trim().length > 0 && date && time && endTime && endTime > time;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);
    try {
      const saved = isEditMode
        ? await apiClient.updateEvent(event!.id, isTimeLocked ? { title, description } : { title, description, date, time, endTime })
        : await apiClient.createEvent({ title, description, date, time, endTime }, undefined, idempotencyKeyRef.current);
      onSaved?.(saved);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save the event. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditMode ? 'Edit Organization Event' : 'Create Organization Event'}
      description="Schedule an event and open availability polling for the whole organization."
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
            {isEditMode ? 'Save Changes' : 'Create Event'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        {error && (
          <div className="p-2.5 rounded border border-status-blocked bg-rose-50 text-status-blocked text-xs font-medium">
            {error}
          </div>
        )}

        <Input
          label="Event Name"
          placeholder="e.g. Company Town Hall"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />

        <div className="space-y-1">
          <label className="block text-xs font-semibold text-on-surface uppercase tracking-wider">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            placeholder="What is this event about?"
            className="w-full bg-surface-bright border border-surface-outline rounded p-2.5 text-xs text-on-surface placeholder:text-outline focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            required
          />
        </div>

        {isTimeLocked && (
          <p className="text-[11px] text-on-surface-variant bg-surface-container-low border border-surface-outline rounded p-2">
            This event has already started, so its date and time can no longer be changed.
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Input
            type="date"
            label="Date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            disabled={isTimeLocked}
            required
          />
          <Input
            type="time"
            label="Start Time (IST)"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            disabled={isTimeLocked}
            required
          />
          <Input
            type="time"
            label="End Time (IST)"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            disabled={isTimeLocked}
            required
          />
        </div>
        {!isTimeLocked && time && endTime && endTime <= time && (
          <p className="text-[11px] text-status-blocked">End time must be after the start time.</p>
        )}
      </form>
    </Modal>
  );
}
