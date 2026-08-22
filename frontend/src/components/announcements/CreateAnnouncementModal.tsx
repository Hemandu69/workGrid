'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Button } from '../ui/Button';
import { Announcement, AudienceScope } from '../../types/announcement';
import { apiClient } from '../../lib/api-client';

interface CreateAnnouncementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: () => void;
  /** When set, the modal edits this announcement instead of creating a new one. */
  announcement?: Announcement | null;
}

export function CreateAnnouncementModal({ isOpen, onClose, onCreated, announcement }: CreateAnnouncementModalProps) {
  const isEditMode = Boolean(announcement);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [scope, setScope] = useState<AudienceScope>('GLOBAL');
  const [targetRoom, setTargetRoom] = useState('Room B');
  const [pinned, setPinned] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One key per fresh create-mode form-open, reused across retries of that
  // same submission attempt. Not needed for edits — those PATCH a specific
  // announcement id and are already idempotent by construction.
  const idempotencyKeyRef = useRef<string>('');

  useEffect(() => {
    if (!isOpen) return;
    setTitle(announcement?.title || '');
    setContent(announcement?.content || '');
    setScope(announcement?.scope || 'GLOBAL');
    setTargetRoom(announcement?.targetRoom || 'Room B');
    setPinned(announcement?.pinned || false);
    setError(null);
    if (!announcement) idempotencyKeyRef.current = crypto.randomUUID();
  }, [isOpen, announcement]);

  const scopeOptions = [
    { value: 'GLOBAL', label: 'Global (All Members)' },
    { value: 'ADMINS_ONLY', label: 'Admins & Leadership Only' },
    { value: 'SERVERS_AND_MEMBERS', label: 'Servers & Members' },
    { value: 'ROOM_SPECIFIC', label: 'Specific Section / Room' },
  ];

  const roomOptions = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((l) => ({
    value: `Room ${l}`,
    label: `Section ${l}`,
  }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;

    setIsSubmitting(true);
    setError(null);
    try {
      if (isEditMode) {
        await apiClient.updateAnnouncement(announcement!.id, {
          title: title.trim(),
          content: content.trim(),
          scope,
          targetRoom: scope === 'ROOM_SPECIFIC' ? targetRoom : undefined,
        });
      } else {
        await apiClient.createAnnouncement(
          {
            title: title.trim(),
            content: content.trim(),
            scope,
            targetRoom: scope === 'ROOM_SPECIFIC' ? targetRoom : undefined,
            pinned,
          },
          undefined,
          idempotencyKeyRef.current
        );
      }
      setTitle('');
      setContent('');
      setScope('GLOBAL');
      setPinned(false);
      onCreated?.();
      onClose();
    } catch {
      setError(isEditMode ? 'Could not save changes. Please try again.' : 'Could not publish the announcement. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditMode ? 'Edit Organization Announcement' : 'Create Organization Announcement'}
      description="Broadcast official announcements and operational notices across organizational sections."
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
            disabled={!title.trim() || !content.trim()}
          >
            {isEditMode ? 'Save Changes' : 'Publish Announcement'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        {error && (
          <div className="p-2.5 rounded bg-rose-50 border border-rose-200 text-rose-700 text-xs">
            {error}
          </div>
        )}

        <Input
          label="Announcement Title"
          placeholder="e.g. Scheduled System Maintenance"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />

        <div className="space-y-1">
          <label className="block text-xs font-semibold text-on-surface uppercase tracking-wider">
            Announcement Content
          </label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
            placeholder="Write the full announcement message..."
            className="w-full bg-surface-bright border border-surface-outline rounded p-2.5 text-xs text-on-surface placeholder:text-outline focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            required
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Select
            label="Who Sees This"
            options={scopeOptions}
            value={scope}
            onChange={(e) => setScope(e.target.value as AudienceScope)}
          />

          {scope === 'ROOM_SPECIFIC' && (
            <Select
              label="Target Section"
              options={roomOptions}
              value={targetRoom}
              onChange={(e) => setTargetRoom(e.target.value)}
            />
          )}
        </div>

        {!isEditMode && (
          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="pin-announcement"
              checked={pinned}
              onChange={(e) => setPinned(e.target.checked)}
              className="rounded border-surface-outline text-primary focus:ring-primary h-4 w-4"
            />
            <label htmlFor="pin-announcement" className="text-xs text-on-surface font-medium cursor-pointer">
              Pin announcement to the top of the command board
            </label>
          </div>
        )}
      </form>
    </Modal>
  );
}
