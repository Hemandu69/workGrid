'use client';

import React, { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Select } from '../ui/Select';
import { Button } from '../ui/Button';
import { apiClient, ApiError } from '../../lib/api-client';

interface RoomAssignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  personId: string;
  personName: string;
  role: string;
  currentSection: string | null; // e.g. "B"
  currentSubroom: string | null; // e.g. "B3"
  onAssigned?: () => void;
}

const SECTION_OPTIONS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((l) => ({ value: l, label: `Section ${l}` }));

export function RoomAssignmentModal({
  isOpen,
  onClose,
  personId,
  personName,
  role,
  currentSection,
  currentSubroom,
  onAssigned,
}: RoomAssignmentModalProps) {
  const isServer = role === 'SERVER';
  const [section, setSection] = useState(currentSection || 'A');
  const [subroomNumber, setSubroomNumber] = useState(() => (currentSubroom ? currentSubroom.slice(1) : '1'));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setSection(currentSection || 'A');
    setSubroomNumber(currentSubroom ? currentSubroom.slice(1) : '1');
    setError(null);
  }, [isOpen, currentSection, currentSubroom]);

  const subroomOptions = Array.from({ length: 8 }, (_, i) => {
    const num = String(i + 1);
    return { value: num, label: `Subroom ${section}${num}` };
  });

  const handleAssign = async () => {
    if (isSubmitting || isClearing) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await apiClient.assignRoom(personId, {
        sectionLetter: section,
        subroomCode: isServer ? undefined : `${section}${subroomNumber}`,
      });
      onAssigned?.();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to assign room.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClear = async () => {
    if (isSubmitting || isClearing) return;
    setIsClearing(true);
    setError(null);
    try {
      await apiClient.clearRoomAssignment(personId);
      onAssigned?.();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to clear assignment.');
    } finally {
      setIsClearing(false);
    }
  };

  const hasCurrentAssignment = Boolean(currentSection);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Reassign Room — ${personName}`}
      description={
        isServer
          ? 'Servers are assigned a Section only — their supervisory position within it is calculated dynamically.'
          : 'Choose the Section and Subroom this person should be assigned to.'
      }
      maxWidth="sm"
      footer={
        <>
          {hasCurrentAssignment && (
            <Button variant="outline" size="sm" onClick={handleClear} isLoading={isClearing} disabled={isSubmitting}>
              Clear Assignment
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onClose} disabled={isSubmitting || isClearing}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={handleAssign} isLoading={isSubmitting} disabled={isClearing}>
            {hasCurrentAssignment ? 'Reassign' : 'Assign'}
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-xs">
        {error && (
          <div className="p-2.5 rounded border border-status-blocked bg-rose-50 text-status-blocked text-xs font-medium">
            {error}
          </div>
        )}

        {hasCurrentAssignment && (
          <div className="p-2.5 bg-surface-container-low border border-surface-outline rounded text-xs text-on-surface-variant">
            Currently: <span className="font-semibold text-primary">{currentSubroom || `Section ${currentSection}`}</span>
          </div>
        )}

        <Select label="Section" options={SECTION_OPTIONS} value={section} onChange={(e) => setSection(e.target.value)} />

        {!isServer && (
          <Select
            label="Subroom"
            options={subroomOptions}
            value={subroomNumber}
            onChange={(e) => setSubroomNumber(e.target.value)}
          />
        )}
      </div>
    </Modal>
  );
}
