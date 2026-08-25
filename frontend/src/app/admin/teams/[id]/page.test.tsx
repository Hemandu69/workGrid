import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import TeamDetailPage from './page';
import { apiClient } from '../../../../lib/api-client';
import { TeamDetail } from '../../../../types/team';

vi.mock('../../../../components/layout/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
}));

vi.mock('../../../../lib/realtime-context', () => ({
  useDomainEvent: () => {},
}));

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'team-alpha' }),
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('../../../../lib/api-client', () => ({
  apiClient: {
    getTeam: vi.fn(),
    addTeamMember: vi.fn(),
    removeTeamMember: vi.fn(),
    deleteTeam: vi.fn(),
    getUsers: vi.fn(),
  },
  ApiError: class ApiError extends Error {},
}));

const mockedApi = vi.mocked(apiClient);

function buildTeamDetail(overrides: Partial<TeamDetail> = {}): TeamDetail {
  return {
    id: 'team-alpha',
    name: 'Team Alpha',
    lead: { id: 'lead-1', name: 'Priya Natarajan', email: 'priya@workgrid.corp' },
    members: [
      { id: 'm1', name: 'Nora Whitfield', email: 'nora@workgrid.corp', role: 'MEMBER' },
      { id: 'm2', name: 'Kai Osei', email: 'kai@workgrid.corp', role: 'MEMBER' },
    ],
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('Team detail page — focused roster and member management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the roster, member count, and lead', async () => {
    mockedApi.getTeam.mockResolvedValue(buildTeamDetail());

    render(<TeamDetailPage />);

    await waitFor(() => expect(screen.getByText('Nora Whitfield')).toBeInTheDocument());
    expect(screen.getByText('Kai Osei')).toBeInTheDocument();
    expect(screen.getByText(/led by priya natarajan/i)).toBeInTheDocument();
    expect(screen.getByText(/2 members/i)).toBeInTheDocument();
  });

  it('does NOT render the Event Section Allocation section on Team Detail', async () => {
    mockedApi.getTeam.mockResolvedValue(buildTeamDetail());

    render(<TeamDetailPage />);

    await waitFor(() => expect(screen.getByText('Nora Whitfield')).toBeInTheDocument());
    expect(screen.queryByText('Event Section Allocation')).not.toBeInTheDocument();
    expect(screen.queryByText('— Select a Section —')).not.toBeInTheDocument();
  });

  it('calls removeTeamMember when Remove is clicked', async () => {
    mockedApi.getTeam.mockResolvedValue(buildTeamDetail());
    mockedApi.removeTeamMember.mockResolvedValue(buildTeamDetail({ members: [] }));

    render(<TeamDetailPage />);

    await waitFor(() => expect(screen.getByText('Nora Whitfield')).toBeInTheDocument());
    const removeButtons = screen.getAllByRole('button', { name: /remove/i });
    fireEvent.click(removeButtons[0]);

    await waitFor(() => {
      expect(mockedApi.removeTeamMember).toHaveBeenCalledWith('team-alpha', 'm1');
    });
  });

  it('deletes the team and navigates back to /admin/teams', async () => {
    mockedApi.getTeam.mockResolvedValue(buildTeamDetail());
    mockedApi.deleteTeam.mockResolvedValue({ message: 'Team deleted' });

    render(<TeamDetailPage />);

    await waitFor(() => expect(screen.getByRole('button', { name: /delete team/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /delete team/i }));

    await waitFor(() => {
      expect(mockedApi.deleteTeam).toHaveBeenCalledWith('team-alpha');
      expect(mockPush).toHaveBeenCalledWith('/admin/teams');
    });
  });
});
