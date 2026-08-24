import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import TeamsPage from './page';
import { apiClient } from '../../../lib/api-client';
import { Team } from '../../../types/team';

vi.mock('../../../components/layout/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
}));

vi.mock('../../../lib/realtime-context', () => ({
  useDomainEvent: () => {},
}));

vi.mock('../../../lib/api-client', () => ({
  apiClient: {
    getTeams: vi.fn(),
    createTeam: vi.fn(),
  },
  ApiError: class ApiError extends Error {},
}));

const mockedApi = vi.mocked(apiClient);

function buildTeam(overrides: Partial<Team> = {}): Team {
  return {
    id: 'team-alpha',
    name: 'Team Alpha',
    lead: { id: 'lead-1', name: 'Priya Natarajan', email: 'priya@workgrid.corp' },
    memberCount: 24,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('Teams directory page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists teams with member counts and lead names', async () => {
    mockedApi.getTeams.mockResolvedValue([buildTeam()]);

    render(<TeamsPage />);

    await waitFor(() => expect(screen.getByText('Team Alpha')).toBeInTheDocument());
    expect(screen.getByText('24 members')).toBeInTheDocument();
    expect(screen.getByText('Priya Natarajan')).toBeInTheDocument();
  });

  it('creates a new team via the Create Team modal', async () => {
    mockedApi.getTeams.mockResolvedValue([]);
    mockedApi.createTeam.mockResolvedValue({} as never);

    render(<TeamsPage />);

    await waitFor(() => expect(screen.getByText(/no teams yet/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /create team/i }));
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. team alpha/i), { target: { value: 'Team Gamma' } });
    const createButtons = screen.getAllByRole('button', { name: /create team/i });
    fireEvent.click(createButtons[createButtons.length - 1]);

    await waitFor(() =>
      expect(mockedApi.createTeam).toHaveBeenCalledWith({ name: 'Team Gamma' })
    );
  });
});
