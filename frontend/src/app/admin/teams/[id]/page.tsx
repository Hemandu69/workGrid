'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AppShell } from '../../../../components/layout/AppShell';
import { apiClient, ApiError } from '../../../../lib/api-client';
import { useDomainEvent } from '../../../../lib/realtime-context';
import { Avatar } from '../../../../components/ui/Avatar';
import { Badge } from '../../../../components/ui/Badge';
import { Button } from '../../../../components/ui/Button';
import { Modal } from '../../../../components/ui/Modal';
import { TeamDetail, TeamPlacementPreview } from '../../../../types/team';
import { User } from '../../../../types/auth';
import { OrgEvent } from '../../../../types/org-event';

const SECTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

function AddMemberModal({
  teamId,
  isOpen,
  onClose,
  onAdded,
}: {
  teamId: string;
  isOpen: boolean;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<User[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setIsSearching(true);
    const handle = setTimeout(() => {
      apiClient
        .getUsers({ role: 'MEMBER', search: search.trim() || undefined, limit: 20 })
        .then((res) => setResults(res.items))
        .catch(() => setResults([]))
        .finally(() => setIsSearching(false));
    }, 250);
    return () => clearTimeout(handle);
  }, [isOpen, search]);

  const handleAdd = async (userId: string) => {
    setAddingId(userId);
    try {
      await apiClient.addTeamMember(teamId, userId);
      onAdded();
    } catch {
      // Handled by leaving the row actionable to retry
    } finally {
      setAddingId(null);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Team Member" maxWidth="md">
      <div className="space-y-3">
        <input
          type="text"
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search MEMBER users by name or email..."
          className="w-full px-3 py-1.5 bg-surface-container-low border border-surface-outline rounded text-xs text-on-surface placeholder:text-outline focus:outline-none focus:border-primary"
        />
        <div className="max-h-80 overflow-y-auto space-y-1.5">
          {isSearching ? (
            <p className="text-xs text-on-surface-variant text-center py-6">Searching...</p>
          ) : results.length === 0 ? (
            <p className="text-xs text-on-surface-variant text-center py-6">No matching MEMBER users found.</p>
          ) : (
            results.map((u) => (
              <div
                key={u.id}
                className="flex items-center justify-between gap-2 p-2 rounded border border-surface-outline bg-surface-bright"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Avatar src={u.avatarUrl} name={u.name} size="sm" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-primary truncate">{u.name}</p>
                    <p className="text-[10px] text-on-surface-variant truncate">{u.email}</p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  isLoading={addingId === u.id}
                  onClick={() => handleAdd(u.id)}
                >
                  Add
                </Button>
              </div>
            ))
          )}
        </div>
      </div>
    </Modal>
  );
}

export default function TeamDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const teamId = params.id;

  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);

  const [events, setEvents] = useState<OrgEvent[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [selectedSection, setSelectedSection] = useState<string>('');
  const [preview, setPreview] = useState<TeamPlacementPreview | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isActing, setIsActing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchTeam = useCallback(() => {
    apiClient
      .getTeam(teamId)
      .then(setTeam)
      .catch(() => setTeam(null))
      .finally(() => setIsLoading(false));
  }, [teamId]);

  useEffect(() => {
    fetchTeam();
  }, [fetchTeam]);

  useEffect(() => {
    apiClient
      .getEvents()
      .then((all) => setEvents(all.filter((e) => e.status !== 'COMPLETED' && e.status !== 'CANCELLED')))
      .catch(() => setEvents([]));
  }, []);

  const fetchPreview = useCallback(
    (silent = false) => {
      if (!selectedEventId || !selectedSection) {
        setPreview(null);
        return;
      }
      if (!silent) setIsPreviewLoading(true);
      apiClient
        .getTeamPlacementPreview(teamId, { eventId: selectedEventId, sectionLetter: selectedSection })
        .then(setPreview)
        .catch(() => setPreview(null))
        .finally(() => setIsPreviewLoading(false));
    },
    [teamId, selectedEventId, selectedSection]
  );

  useEffect(() => {
    fetchPreview();
  }, [fetchPreview]);

  useDomainEvent(
    ['TEAM_EVENT_PLACEMENT_CHANGED', 'PRESENCE_CHANGED', 'AVAILABILITY_CHANGED', 'EMPLOYEE_CHECKED_IN', 'EMPLOYEE_CHECKED_OUT'],
    () => {
      fetchTeam();
      fetchPreview(true);
    }
  );

  const subroomCodes = useMemo(
    () => (selectedSection ? Array.from({ length: 8 }, (_, i) => `${selectedSection}${i + 1}`) : []),
    [selectedSection]
  );

  const runAction = async (action: () => Promise<unknown>) => {
    setIsActing(true);
    setActionError(null);
    try {
      await action();
      fetchPreview();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Action failed.');
    } finally {
      setIsActing(false);
    }
  };

  const handleAllocate = () =>
    runAction(() => apiClient.allocateTeam(teamId, { eventId: selectedEventId, sectionLetter: selectedSection }));

  const handleClear = () => runAction(() => apiClient.clearTeamPlacement(teamId, selectedEventId));

  const handleReplace = (userId: string) =>
    runAction(() => apiClient.replaceTeamMember(teamId, { eventId: selectedEventId, userId }));

  const handleOverride = (userId: string, subroomCode: string) =>
    runAction(() => apiClient.overrideTeamPlacement(teamId, userId, { eventId: selectedEventId, subroomCode }));

  const handleRemoveMember = async (userId: string) => {
    try {
      await apiClient.removeTeamMember(teamId, userId);
      fetchTeam();
    } catch {
      // Handled
    }
  };

  const handleDeleteTeam = async () => {
    try {
      await apiClient.deleteTeam(teamId);
      router.push('/admin/teams');
    } catch {
      // Handled
    }
  };

  if (isLoading) {
    return (
      <AppShell breadcrumbs={[{ label: 'WorkGrid', href: '/' }, { label: 'Teams', href: '/admin/teams' }]}>
        <p className="text-xs text-on-surface-variant text-center py-12">Loading team...</p>
      </AppShell>
    );
  }

  if (!team) {
    return (
      <AppShell breadcrumbs={[{ label: 'WorkGrid', href: '/' }, { label: 'Teams', href: '/admin/teams' }]}>
        <div className="p-8 border border-surface-outline rounded bg-surface-container-low text-center text-xs text-on-surface-variant">
          Team not found.
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      breadcrumbs={[
        { label: 'WorkGrid', href: '/' },
        { label: 'Teams', href: '/admin/teams' },
        { label: team.name },
      ]}
    >
      <div className="space-y-6 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-surface-outline pb-4">
          <div>
            <h1 className="text-xl font-bold text-primary tracking-tight">{team.name}</h1>
            <p className="text-xs text-on-surface-variant mt-1">
              {team.members.length} member{team.members.length === 1 ? '' : 's'}
              {team.lead ? ` · Led by ${team.lead.name}` : ' · No Team Lead assigned'}
            </p>
          </div>
          <Button variant="danger" size="sm" onClick={handleDeleteTeam}>
            Delete Team
          </Button>
        </div>

        {/* Roster */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-primary">Roster</h2>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsAddMemberOpen(true)}
              leftIcon={<span className="material-symbols-outlined text-[16px]">person_add</span>}
            >
              Add Member
            </Button>
          </div>
          {team.members.length === 0 ? (
            <div className="p-6 border border-surface-outline rounded bg-surface-container-low text-center text-xs text-on-surface-variant">
              No members yet.
            </div>
          ) : (
            <div className="space-y-1.5">
              {team.members.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between gap-2 p-2.5 rounded border border-surface-outline bg-surface-bright"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Avatar src={m.avatarUrl} name={m.name} size="sm" status={m.status} />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-primary truncate">{m.name}</p>
                      <p className="text-[10px] text-on-surface-variant truncate">{m.email}</p>
                    </div>
                    <Badge role={m.role || 'MEMBER'} variant="role" />
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => handleRemoveMember(m.id)}>
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Section Allocation */}
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-primary">Event Section Allocation</h2>
          <div className="p-3.5 bg-surface-bright border border-surface-outline rounded shadow-2xs space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">
                  Event
                </label>
                <select
                  value={selectedEventId}
                  onChange={(e) => setSelectedEventId(e.target.value)}
                  className="text-xs bg-surface border border-surface-outline rounded px-3 py-1.5 font-medium text-on-surface focus:outline-none focus:ring-1 focus:ring-primary min-w-[220px]"
                >
                  <option value="">— Select an Event —</option>
                  {events.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.title} ({e.dateIST} • {e.status})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">
                  Section
                </label>
                <select
                  value={selectedSection}
                  onChange={(e) => setSelectedSection(e.target.value)}
                  className="text-xs bg-surface border border-surface-outline rounded px-3 py-1.5 font-medium text-on-surface focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">— Select a Section —</option>
                  {SECTION_LETTERS.map((letter) => (
                    <option key={letter} value={letter}>
                      Section {letter}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {actionError && (
              <div className="p-2 bg-rose-50 border border-rose-200 rounded text-xs text-rose-800 font-medium">
                {actionError}
              </div>
            )}

            {!selectedEventId || !selectedSection ? (
              <p className="text-xs text-on-surface-variant py-4 text-center">
                Choose an event and a section to preview and manage this team&apos;s positioning.
              </p>
            ) : isPreviewLoading || !preview ? (
              <p className="text-xs text-on-surface-variant py-4 text-center">Loading preview...</p>
            ) : (
              <div className="space-y-4">
                {preview.currentSectionLetter && preview.currentSectionLetter !== selectedSection && (
                  <div className="p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-900">
                    Team currently positioned in Section {preview.currentSectionLetter} for this event.
                    Allocating here will move them to Section {selectedSection}.
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <p className="text-xs text-on-surface-variant">
                    <span className="font-bold text-primary font-mono">
                      {preview.totalPositioned} / {preview.totalCapacity}
                    </span>{' '}
                    positioned in Section {selectedSection} · {preview.poolCount} in available pool ·{' '}
                    {preview.totalTeamMembers} total eligible members
                  </p>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" isLoading={isActing} onClick={handleClear}>
                      Clear
                    </Button>
                    <Button size="sm" variant="primary" isLoading={isActing} onClick={handleAllocate}>
                      {preview.totalPositioned > 0 ? 'Re-Allocate / Move Here' : 'Auto-Allocate'}
                    </Button>
                  </div>
                </div>

                {/* Positioned subrooms grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {preview.subrooms.map((s) => (
                    <div key={s.subroomCode} className="p-2.5 border border-surface-outline rounded bg-surface-container-low">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[11px] font-bold text-primary font-mono">{s.subroomCode}</span>
                        <span className="text-[10px] font-mono text-on-surface-variant tabular-nums">
                          {s.placedCount}/{s.capacity}
                        </span>
                      </div>
                      <div className="space-y-1">
                        {s.members.length === 0 ? (
                          <p className="text-[10px] text-on-surface-variant italic">Empty</p>
                        ) : (
                          s.members.map((m) => (
                            <div key={m.id} className="space-y-1">
                              <div className="flex items-center justify-between gap-1">
                                <span className="text-[11px] text-on-surface truncate flex items-center gap-1">
                                  {m.needsReplacement && (
                                    <span
                                      className="material-symbols-outlined text-[13px] text-rose-600"
                                      title="Currently unavailable"
                                    >
                                      warning
                                    </span>
                                  )}
                                  {m.name}
                                </span>
                                {m.needsReplacement && (
                                  <button
                                    onClick={() => handleReplace(m.id)}
                                    className="text-[10px] text-rose-700 hover:underline shrink-0"
                                  >
                                    Replace
                                  </button>
                                )}
                              </div>
                              <select
                                value={s.subroomCode}
                                onChange={(e) => handleOverride(m.id, e.target.value)}
                                className="w-full text-[10px] bg-surface border border-surface-outline rounded px-1 py-0.5 focus:outline-none"
                              >
                                {subroomCodes.map((code) => (
                                  <option key={code} value={code}>
                                    Move to {code}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Available pool */}
                <div>
                  <h3 className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">
                    Available Pool ({preview.poolCount})
                  </h3>
                  {preview.pool.length === 0 ? (
                    <p className="text-xs text-on-surface-variant">No remaining eligible members.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {preview.pool.map((u) => (
                        <span
                          key={u.id}
                          className="px-2 py-0.5 rounded text-[10px] bg-surface-container text-on-surface-variant border border-surface-outline"
                        >
                          {u.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <AddMemberModal
        teamId={teamId}
        isOpen={isAddMemberOpen}
        onClose={() => setIsAddMemberOpen(false)}
        onAdded={() => {
          fetchTeam();
        }}
      />
    </AppShell>
  );
}
