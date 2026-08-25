'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '../../../components/layout/AppShell';
import { apiClient, ApiError } from '../../../lib/api-client';
import { Avatar } from '../../../components/ui/Avatar';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { Team } from '../../../types/team';
import { OrgEvent } from '../../../types/org-event';
import { useDomainEvent } from '../../../lib/realtime-context';

const TEAMS_EVENT_STORAGE_KEY = 'workgrid:teams:selected-event';
const SECTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

function getInitialPersistedEventId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(TEAMS_EVENT_STORAGE_KEY);
  } catch {
    return null;
  }
}

function persistEventId(eventId: string | null) {
  if (typeof window === 'undefined') return;
  try {
    if (eventId) {
      localStorage.setItem(TEAMS_EVENT_STORAGE_KEY, eventId);
    } else {
      localStorage.removeItem(TEAMS_EVENT_STORAGE_KEY);
    }
  } catch {}
}

function CreateTeamModal({
  isOpen,
  onClose,
  onCreated,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Team name is required.');
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await apiClient.createTeam({ name: name.trim() });
      setName('');
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create team.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create Team" maxWidth="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-2.5 bg-rose-50 border border-rose-200 rounded text-xs text-rose-800 font-medium">
            {error}
          </div>
        )}
        <div>
          <label className="block text-xs font-semibold text-primary mb-1">
            Team Name <span className="text-status-blocked">*</span>
          </label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Team Alpha"
            className="w-full px-3 py-1.5 bg-surface-container-low border border-surface-outline rounded text-xs text-on-surface placeholder:text-outline focus:outline-none focus:border-primary"
          />
          <p className="text-[11px] text-on-surface-variant mt-1">
            A Team Lead and roster of MEMBER users can be added from the team&apos;s detail page.
          </p>
        </div>
        <div className="pt-3 flex justify-end gap-2 border-t border-surface-outline">
          <Button type="button" variant="outline" onClick={onClose} size="sm">
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="sm" isLoading={isSubmitting}>
            Create Team
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function AllocateTeamModal({
  team,
  eventId,
  eventTitle,
  isOpen,
  onClose,
  onSuccess,
}: {
  team: Team | null;
  eventId: string;
  eventTitle: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [sectionLetter, setSectionLetter] = useState<string>(team?.allocatedSection || 'A');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (team) {
      setSectionLetter(team.allocatedSection || 'A');
      setError(null);
    }
  }, [team]);

  if (!team) return null;

  const handleAllocate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sectionLetter) {
      setError('Please select a section.');
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await apiClient.allocateTeam(team.id, { eventId, sectionLetter });
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to allocate team.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClear = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      await apiClient.clearTeamPlacement(team.id, eventId);
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to clear allocation.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Allocate ${team.name}`} maxWidth="sm">
      <form onSubmit={handleAllocate} className="space-y-4">
        {error && (
          <div className="p-2.5 bg-rose-50 border border-rose-200 rounded text-xs text-rose-800 font-medium">
            {error}
          </div>
        )}

        <div>
          <p className="text-xs text-on-surface-variant mb-3">
            Position <span className="font-semibold text-primary">{team.name}</span> ({team.memberCount}{' '}
            members) into a section for <span className="font-semibold text-primary">{eventTitle}</span>.
          </p>

          <label htmlFor="allocate-section-select" className="block text-xs font-semibold text-primary mb-1">
            Select Section
          </label>
          <select
            id="allocate-section-select"
            value={sectionLetter}
            onChange={(e) => setSectionLetter(e.target.value)}
            className="w-full px-3 py-1.5 bg-surface-container-low border border-surface-outline rounded text-xs text-on-surface focus:outline-none focus:border-primary"
          >
            {SECTION_LETTERS.map((letter) => (
              <option key={letter} value={letter}>
                Section {letter}
              </option>
            ))}
          </select>
        </div>

        <div className="pt-3 flex items-center justify-between gap-2 border-t border-surface-outline">
          {team.allocatedSection ? (
            <Button
              type="button"
              variant="danger"
              size="sm"
              onClick={handleClear}
              isLoading={isSubmitting}
            >
              Clear Placement
            </Button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={onClose} size="sm">
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" isLoading={isSubmitting}>
              {team.allocatedSection ? 'Change Section' : 'Allocate Team'}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

export default function TeamsPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [events, setEvents] = useState<OrgEvent[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(getInitialPersistedEventId);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [allocatingTeam, setAllocatingTeam] = useState<Team | null>(null);

  const fetchEvents = useCallback(() => {
    apiClient
      .getEvents()
      .then((all) => {
        const activeEvents = all.filter((e) => e.status !== 'COMPLETED' && e.status !== 'CANCELLED');
        setEvents(activeEvents);

        // Validate persisted event still exists and is not completed/cancelled
        const persistedId = getInitialPersistedEventId();
        if (persistedId) {
          const isValid = activeEvents.some((e) => e.id === persistedId);
          if (!isValid) {
            persistEventId(null);
            setSelectedEventId(null);
          }
        }
      })
      .catch(() => setEvents([]));
  }, []);

  const fetchTeams = useCallback(
    (eventId?: string | null) => {
      const targetEventId = eventId !== undefined ? eventId : selectedEventId;
      apiClient
        .getTeams(targetEventId ? { eventId: targetEventId } : undefined)
        .then(setTeams)
        .catch(() => setTeams([]))
        .finally(() => setIsLoading(false));
    },
    [selectedEventId]
  );

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  useEffect(() => {
    fetchTeams();
  }, [fetchTeams]);

  useDomainEvent(
    [
      'TEAM_EVENT_PLACEMENT_CHANGED',
      'EMPLOYEE_UPDATED',
      'ORG_EVENT_CREATED',
      'ORG_EVENT_UPDATED',
      'ORG_EVENT_COMPLETED',
      'ORG_EVENT_CANCELLED',
    ],
    () => {
      fetchEvents();
      fetchTeams();
    }
  );

  const handleEventChange = (newEventId: string) => {
    const nextId = newEventId === 'ALL' || !newEventId ? null : newEventId;
    setSelectedEventId(nextId);
    persistEventId(nextId);
    fetchTeams(nextId);
  };

  const selectedEvent = events.find((e) => e.id === selectedEventId);

  return (
    <AppShell
      breadcrumbs={[
        { label: 'WorkGrid', href: '/' },
        { label: 'Admin', href: '/admin' },
        { label: 'Teams' },
      ]}
    >
      <div className="space-y-6 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-surface-outline pb-4">
          <div>
            <h1 className="text-xl font-bold text-primary tracking-tight">Teams</h1>
            <p className="text-xs text-on-surface-variant mt-1">
              Standing MEMBER rosters, each led by a Team Lead — used to bulk-position a team into a
              Section for a specific event instead of assigning people one at a time.
            </p>
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setIsCreateOpen(true)}
            leftIcon={<span className="material-symbols-outlined text-[16px]">add</span>}
          >
            Create Team
          </Button>
        </div>

        {/* Global Event Allocation Selector */}
        <div className="p-3.5 bg-surface-bright border border-surface-outline rounded shadow-2xs space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className="material-symbols-outlined text-[20px] text-primary">event</span>
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant block">
                  Event Allocation
                </span>
                <span className="text-xs text-on-surface font-medium">
                  {selectedEvent
                    ? `${selectedEvent.title} (${selectedEvent.dateIST} • ${selectedEvent.status})`
                    : events.length > 0
                    ? 'Choose an event to preview and manage team positioning.'
                    : 'No active or upcoming events available.'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor="teams-event-selector" className="text-xs font-medium text-on-surface-variant">
                Event:
              </label>
              {events.length > 0 ? (
                <select
                  id="teams-event-selector"
                  value={selectedEventId || ''}
                  onChange={(e) => handleEventChange(e.target.value)}
                  className="text-xs bg-surface border border-surface-outline rounded px-3 py-1.5 font-medium text-on-surface focus:outline-none focus:ring-1 focus:ring-primary min-w-[220px]"
                >
                  <option value="">— Select an Event —</option>
                  {events.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.title} ({e.dateIST} • {e.status})
                    </option>
                  ))}
                </select>
              ) : (
                <select
                  id="teams-event-selector"
                  disabled
                  className="text-xs bg-surface-container-low border border-surface-outline rounded px-3 py-1.5 font-medium text-on-surface-variant focus:outline-none min-w-[220px] cursor-not-allowed"
                >
                  <option value="">No active or upcoming events</option>
                </select>
              )}
              {selectedEventId && (
                <button
                  onClick={() => handleEventChange('')}
                  className="text-[11px] text-on-surface-variant hover:text-primary underline px-1"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Team Allocation List */}
        {isLoading ? (
          <p className="text-xs text-on-surface-variant text-center py-12">Loading teams...</p>
        ) : teams.length === 0 ? (
          <div className="p-8 border border-surface-outline rounded bg-surface-container-low text-center text-xs text-on-surface-variant">
            No teams yet. Create one to start bulk-positioning members into sections.
          </div>
        ) : (
          <div className="space-y-3">
            {teams.map((team) => (
              <div
                key={team.id}
                className="p-4 border border-surface-outline rounded bg-surface-bright flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-surface-outline/80 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/admin/teams/${team.id}`}
                      className="font-semibold text-primary text-sm hover:underline truncate"
                    >
                      {team.name}
                    </Link>
                    {team.lead && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Avatar src={team.lead.avatarUrl} name={team.lead.name} size="sm" />
                        <span className="text-[11px] text-on-surface-variant hidden md:inline">
                          {team.lead.name}
                        </span>
                      </div>
                    )}
                  </div>
                  <p className="text-[11px] text-on-surface-variant mt-0.5">
                    {team.memberCount} member{team.memberCount === 1 ? '' : 's'}
                  </p>
                </div>

                {selectedEventId ? (
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      {team.allocatedSection ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-primary/10 text-primary border border-primary/20 font-mono">
                          Section {team.allocatedSection}
                        </span>
                      ) : (
                        <span className="text-on-surface-variant text-[11px]">Not allocated</span>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant={team.allocatedSection ? 'outline' : 'primary'}
                      onClick={() => setAllocatingTeam(team)}
                    >
                      {team.allocatedSection ? 'Change' : 'Allocate'}
                    </Button>
                  </div>
                ) : (
                  <Link
                    href={`/admin/teams/${team.id}`}
                    className="flex items-center gap-1 text-xs text-on-surface-variant hover:text-primary shrink-0"
                  >
                    <span>View Team</span>
                    <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <CreateTeamModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreated={() => {
          fetchTeams();
        }}
      />

      <AllocateTeamModal
        team={allocatingTeam}
        eventId={selectedEventId || ''}
        eventTitle={selectedEvent?.title || 'Selected Event'}
        isOpen={allocatingTeam !== null && Boolean(selectedEventId)}
        onClose={() => setAllocatingTeam(null)}
        onSuccess={() => {
          fetchTeams(selectedEventId);
        }}
      />
    </AppShell>
  );
}
