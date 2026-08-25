'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AppShell } from '../../../../components/layout/AppShell';
import { apiClient } from '../../../../lib/api-client';
import { useDomainEvent } from '../../../../lib/realtime-context';
import { Avatar } from '../../../../components/ui/Avatar';
import { Badge } from '../../../../components/ui/Badge';
import { Button } from '../../../../components/ui/Button';
import { Modal } from '../../../../components/ui/Modal';
import { TeamDetail } from '../../../../types/team';
import { User } from '../../../../types/auth';

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

  useDomainEvent(
    ['TEAM_EVENT_PLACEMENT_CHANGED', 'EMPLOYEE_UPDATED', 'PRESENCE_CHANGED', 'AVAILABILITY_CHANGED'],
    () => {
      fetchTeam();
    }
  );

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
