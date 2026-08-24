import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import TeamDetailPage from './page';
import { apiClient } from '../../../../lib/api-client';
import { TeamDetail, TeamPlacementPreview } from '../../../../types/team';

vi.mock('../../../../components/layout/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
}));

vi.mock('../../../../lib/realtime-context', () => ({
  useDomainEvent: () => {},
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'team-alpha' }),
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('../../../../lib/api-client', () => ({
  apiClient: {
    getTeam: vi.fn(),
    getEvents: vi.fn(),
    getTeamPlacementPreview: vi.fn(),
    allocateTeam: vi.fn(),
    replaceTeamMember: vi.fn(),
    overrideTeamPlacement: vi.fn(),
    clearTeamPlacement: vi.fn(),
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

function buildPreview(overrides: Partial<TeamPlacementPreview> = {}): TeamPlacementPreview {
  return {
    team: { id: 'team-alpha', name: 'Team Alpha', lead: null },
    event: { id: 'evt-1', title: 'Cloud Infrastructure Summit' },
    section: { letter: 'C', roomId: 'room-c' },
    subrooms: [
      {
        subroomCode: 'C1',
        capacity: 2,
        placedCount: 1,
        members: [{ id: 'm1', name: 'Nora Whitfield', email: 'n@x.com', needsReplacement: true }],
      },
      ...Array.from({ length: 7 }, (_, i) => ({
        subroomCode: `C${i + 2}`,
        capacity: 2,
        placedCount: 0,
        members: [],
      })),
    ],
    totalPositioned: 1,
    totalCapacity: 16,
    totalTeamMembers: 24,
    pool: [{ id: 'm2', name: 'Kai Osei', email: 'kai@workgrid.corp' }],
    poolCount: 1,
    currentSectionLetter: null,
    ...overrides,
  };
}

describe('Team detail page — roster and event section allocation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedApi.getEvents.mockResolvedValue([
      {
        id: 'evt-1',
        organizationId: 'org-1',
        title: 'Cloud Infrastructure Summit',
        description: '',
        scheduledAt: '2026-08-24T04:30:00.000Z',
        scheduledEndAt: '2026-08-24T12:30:00.000Z',
        dateIST: '24 Aug 2026',
        timeIST: '10:00 AM',
        endTimeIST: '6:00 PM',
        status: 'UPCOMING',
        completedAt: null,
        createdByName: 'Elena Vance',
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z',
        currentUserResponse: null,
      },
    ]);
  });

  it('renders the roster and lead', async () => {
    mockedApi.getTeam.mockResolvedValue(buildTeamDetail());

    render(<TeamDetailPage />);

    await waitFor(() => expect(screen.getByText('Nora Whitfield')).toBeInTheDocument());
    expect(screen.getByText('Kai Osei')).toBeInTheDocument();
    expect(screen.getByText(/led by priya natarajan/i)).toBeInTheDocument();
  });

  it('fetches and renders the positioned/pool preview once an event and section are chosen', async () => {
    mockedApi.getTeam.mockResolvedValue(buildTeamDetail());
    mockedApi.getTeamPlacementPreview.mockResolvedValue(buildPreview());

    render(<TeamDetailPage />);
    await waitFor(() => expect(screen.getByText('Nora Whitfield')).toBeInTheDocument());

    fireEvent.change(screen.getByDisplayValue('— Select an Event —'), { target: { value: 'evt-1' } });
    fireEvent.change(screen.getByDisplayValue('— Select a Section —'), { target: { value: 'C' } });

    await waitFor(() =>
      expect(mockedApi.getTeamPlacementPreview).toHaveBeenCalledWith('team-alpha', {
        eventId: 'evt-1',
        sectionLetter: 'C',
      })
    );
    await waitFor(() => expect(screen.getByText('1 / 16')).toBeInTheDocument());
    expect(screen.getByText(/available pool \(1\)/i)).toBeInTheDocument();
  });

  it('calls allocateTeam when Auto-Allocate is clicked', async () => {
    const emptyPreview = buildPreview({
      totalPositioned: 0,
      subrooms: buildPreview().subrooms.map((s) => ({ ...s, placedCount: 0, members: [] })),
    });
    mockedApi.getTeam.mockResolvedValue(buildTeamDetail());
    mockedApi.getTeamPlacementPreview.mockResolvedValue(emptyPreview);
    mockedApi.allocateTeam.mockResolvedValue(buildPreview({ totalPositioned: 2 }));

    render(<TeamDetailPage />);
    await waitFor(() => expect(screen.getByText('Nora Whitfield')).toBeInTheDocument());

    fireEvent.change(screen.getByDisplayValue('— Select an Event —'), { target: { value: 'evt-1' } });
    fireEvent.change(screen.getByDisplayValue('— Select a Section —'), { target: { value: 'C' } });
    await waitFor(() => expect(screen.getByText('0 / 16')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /^auto-allocate$/i }));

    await waitFor(() =>
      expect(mockedApi.allocateTeam).toHaveBeenCalledWith('team-alpha', { eventId: 'evt-1', sectionLetter: 'C' })
    );
  });

  it('flags an unavailable positioned member and calls replaceTeamMember on Replace', async () => {
    mockedApi.getTeam.mockResolvedValue(buildTeamDetail());
    mockedApi.getTeamPlacementPreview.mockResolvedValue(buildPreview());
    mockedApi.replaceTeamMember.mockResolvedValue({ removedUserId: 'm1', replacedByUserId: 'm2' });

    render(<TeamDetailPage />);
    await waitFor(() => expect(screen.getByText('Nora Whitfield')).toBeInTheDocument());

    fireEvent.change(screen.getByDisplayValue('— Select an Event —'), { target: { value: 'evt-1' } });
    fireEvent.change(screen.getByDisplayValue('— Select a Section —'), { target: { value: 'C' } });
    await waitFor(() => expect(screen.getByText('1 / 16')).toBeInTheDocument());

    const replaceButton = screen.getByRole('button', { name: /^replace$/i });
    fireEvent.click(replaceButton);

    await waitFor(() =>
      expect(mockedApi.replaceTeamMember).toHaveBeenCalledWith('team-alpha', { eventId: 'evt-1', userId: 'm1' })
    );
  });
});
