import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import TeamsPage from './page';
import { apiClient } from '../../../lib/api-client';
import { Team } from '../../../types/team';
import { OrgEvent } from '../../../types/org-event';

const STORAGE_KEY = 'workgrid:teams:selected-event';

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
    getEvents: vi.fn(),
    allocateTeam: vi.fn(),
    clearTeamPlacement: vi.fn(),
  },
  ApiError: class ApiError extends Error {},
}));

const mockedApi = vi.mocked(apiClient);

const mockEvents: OrgEvent[] = [
  {
    id: 'evt-1',
    organizationId: 'org-1',
    title: 'Cloud Summit',
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
  {
    id: 'evt-2',
    organizationId: 'org-1',
    title: 'Cybersecurity Forum',
    description: '',
    scheduledAt: '2026-08-25T04:30:00.000Z',
    scheduledEndAt: '2026-08-25T12:30:00.000Z',
    dateIST: '25 Aug 2026',
    timeIST: '02:00 PM',
    endTimeIST: '04:00 PM',
    status: 'LIVE',
    completedAt: null,
    createdByName: 'Elena Vance',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    currentUserResponse: null,
  },
];

function buildTeamsList(allocatedSectionAlpha: string | null = null): Team[] {
  return [
    {
      id: 'team-alpha',
      name: 'Team Alpha',
      lead: { id: 'lead-1', name: 'Priya Natarajan', email: 'priya@workgrid.corp' },
      memberCount: 24,
      allocatedSection: allocatedSectionAlpha,
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
    },
    {
      id: 'team-beta',
      name: 'Team Beta',
      lead: { id: 'lead-2', name: 'Marcus Sterling', email: 'marcus@workgrid.corp' },
      memberCount: 18,
      allocatedSection: null,
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
    },
  ];
}

describe('Teams directory page & global event allocation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockedApi.getEvents.mockResolvedValue(mockEvents);
    mockedApi.getTeams.mockResolvedValue(buildTeamsList(null));
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('1. lists teams with member counts, lead names, and View Team link when no event is selected', async () => {
    render(<TeamsPage />);

    await waitFor(() => expect(screen.getByText('Team Alpha')).toBeInTheDocument());
    expect(screen.getByText('24 members')).toBeInTheDocument();
    expect(screen.getByText('Priya Natarajan')).toBeInTheDocument();
    expect(screen.getByText('Team Beta')).toBeInTheDocument();
    expect(screen.getAllByText('View Team').length).toBe(2);
    expect(screen.getByText(/Choose an event to preview and manage team positioning/i)).toBeInTheDocument();
  });

  it('2. selecting an event loads team allocations and persists selection to localStorage', async () => {
    mockedApi.getTeams.mockImplementation(async (params) => {
      if (typeof params === 'object' && params?.eventId === 'evt-1') {
        return buildTeamsList('A');
      }
      return buildTeamsList(null);
    });

    render(<TeamsPage />);
    await waitFor(() => expect(screen.getByText('Team Alpha')).toBeInTheDocument());

    const eventSelect = screen.getByLabelText(/Event:/i) as HTMLSelectElement;
    fireEvent.change(eventSelect, { target: { value: 'evt-1' } });

    await waitFor(() => {
      expect(localStorage.getItem(STORAGE_KEY)).toBe('evt-1');
      expect(mockedApi.getTeams).toHaveBeenCalledWith(expect.objectContaining({ eventId: 'evt-1' }));
    });

    await waitFor(() => {
      expect(screen.getByText('Section A')).toBeInTheDocument();
      expect(screen.getByText('Not allocated')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Change/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Allocate/i })).toBeInTheDocument();
    });
  });

  it('3. restoring persisted event on mount loads allocations for that event', async () => {
    localStorage.setItem(STORAGE_KEY, 'evt-1');
    mockedApi.getTeams.mockResolvedValue(buildTeamsList('C'));

    render(<TeamsPage />);

    await waitFor(() => {
      expect(mockedApi.getTeams).toHaveBeenCalledWith(expect.objectContaining({ eventId: 'evt-1' }));
      expect(screen.getByText('Section C')).toBeInTheDocument();
    });

    const eventSelect = screen.getByLabelText(/Event:/i) as HTMLSelectElement;
    expect(eventSelect.value).toBe('evt-1');
  });

  it('4. clicking Allocate opens modal and calls allocateTeam', async () => {
    localStorage.setItem(STORAGE_KEY, 'evt-1');
    mockedApi.getTeams.mockResolvedValue(buildTeamsList(null));
    mockedApi.allocateTeam.mockResolvedValue({} as never);

    render(<TeamsPage />);

    await waitFor(() => expect(screen.getAllByRole('button', { name: /Allocate/i }).length).toBeGreaterThanOrEqual(1));

    const allocateButtons = screen.getAllByRole('button', { name: /Allocate/i });
    fireEvent.click(allocateButtons[0]);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Allocate Team Alpha/i })).toBeInTheDocument();
    });

    const sectionSelect = screen.getByLabelText(/Select Section/i);
    fireEvent.change(sectionSelect, { target: { value: 'D' } });

    const submitBtn = screen.getByRole('button', { name: /Allocate Team/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockedApi.allocateTeam).toHaveBeenCalledWith('team-alpha', {
        eventId: 'evt-1',
        sectionLetter: 'D',
      });
    });
  });

  it('5. clicking Change opens modal and supports clearing allocation', async () => {
    localStorage.setItem(STORAGE_KEY, 'evt-1');
    mockedApi.getTeams.mockResolvedValue(buildTeamsList('A'));
    mockedApi.clearTeamPlacement.mockResolvedValue({} as never);

    render(<TeamsPage />);

    await waitFor(() => expect(screen.getByRole('button', { name: /Change/i })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Change/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Allocate Team Alpha/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Clear Placement/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Clear Placement/i }));

    await waitFor(() => {
      expect(mockedApi.clearTeamPlacement).toHaveBeenCalledWith('team-alpha', 'evt-1');
    });
  });

  it('6. creates a new team via the Create Team modal', async () => {
    mockedApi.getTeams.mockResolvedValue([]);
    mockedApi.createTeam.mockResolvedValue({} as never);

    render(<TeamsPage />);

    await waitFor(() => expect(screen.getByText(/no teams yet/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /create team/i }));
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. team alpha/i), { target: { value: 'Team Delta' } });
    const createButtons = screen.getAllByRole('button', { name: /create team/i });
    fireEvent.click(createButtons[createButtons.length - 1]);

    await waitFor(() =>
      expect(mockedApi.createTeam).toHaveBeenCalledWith({ name: 'Team Delta' })
    );
  });
});
