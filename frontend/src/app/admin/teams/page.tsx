'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '../../../components/layout/AppShell';
import { apiClient, ApiError } from '../../../lib/api-client';
import { Avatar } from '../../../components/ui/Avatar';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { Team } from '../../../types/team';
import { useDomainEvent } from '../../../lib/realtime-context';

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

export default function TeamsPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const fetchTeams = useCallback(() => {
    apiClient
      .getTeams()
      .then(setTeams)
      .catch(() => setTeams([]))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    fetchTeams();
  }, [fetchTeams]);

  useDomainEvent(['TEAM_EVENT_PLACEMENT_CHANGED', 'EMPLOYEE_UPDATED'], () => fetchTeams());

  return (
    <AppShell
      breadcrumbs={[
        { label: 'WorkGrid', href: '/' },
        { label: 'Admin', href: '/admin' },
        { label: 'Teams' },
      ]}
    >
      <div className="space-y-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-between border-b border-surface-outline pb-4">
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

        {isLoading ? (
          <p className="text-xs text-on-surface-variant text-center py-12">Loading teams...</p>
        ) : teams.length === 0 ? (
          <div className="p-8 border border-surface-outline rounded bg-surface-container-low text-center text-xs text-on-surface-variant">
            No teams yet. Create one to start bulk-positioning members into sections.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {teams.map((team) => (
              <Link
                key={team.id}
                href={`/admin/teams/${team.id}`}
                className="p-4 border border-surface-outline rounded bg-surface-bright hover:border-primary transition-colors flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-primary text-sm truncate">{team.name}</p>
                  <p className="text-[11px] text-on-surface-variant mt-0.5">
                    {team.memberCount} member{team.memberCount === 1 ? '' : 's'}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {team.lead && (
                    <div className="flex items-center gap-1.5">
                      <Avatar src={team.lead.avatarUrl} name={team.lead.name} size="sm" />
                      <span className="text-[11px] text-on-surface-variant">{team.lead.name}</span>
                    </div>
                  )}
                  <span className="material-symbols-outlined text-[18px] text-on-surface-variant">chevron_right</span>
                </div>
              </Link>
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
    </AppShell>
  );
}
