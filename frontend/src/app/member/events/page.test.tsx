import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import MemberEventsPage from './page';
import { apiClient } from '../../../lib/api-client';
import { OrgEvent } from '../../../types/org-event';

vi.mock('../../../components/layout/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
}));

vi.mock('../../../lib/realtime-context', () => ({
  useDomainEvent: () => {},
}));

vi.mock('../../../lib/api-client', () => ({
  apiClient: {
    getEvents: vi.fn(),
    updateEventResponse: vi.fn(),
  },
  ApiError: class ApiError extends Error {},
}));

const mockedApi = vi.mocked(apiClient);

function buildEvent(overrides: Partial<OrgEvent> = {}): OrgEvent {
  return {
    id: 'evt-1',
    organizationId: 'org-1',
    title: 'Tech Conference',
    description: 'Annual tech conference',
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
    ...overrides,
  };
}

describe('Member Event Attendance page — event-scoped, not hourly availability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders each event with its own ATTENDING/MAYBE/NOT ATTENDING controls', async () => {
    mockedApi.getEvents.mockResolvedValue([buildEvent()]);

    render(<MemberEventsPage />);

    await waitFor(() => expect(screen.getByText('Tech Conference')).toBeInTheDocument());
    expect(screen.getByText('Attending')).toBeInTheDocument();
    expect(screen.getByText('Maybe')).toBeInTheDocument();
    expect(screen.getByText('Not Attending')).toBeInTheDocument();
  });

  it('renders zero hourly grid cells or time-slot pickers anywhere on the page', async () => {
    mockedApi.getEvents.mockResolvedValue([buildEvent()]);

    render(<MemberEventsPage />);

    await waitFor(() => expect(screen.getByText('Tech Conference')).toBeInTheDocument());
    expect(screen.queryByText(/09:00 AM/)).not.toBeInTheDocument();
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    expect(document.querySelector('input[type="date"]')).toBeNull();
  });

  it('keeps two same-day events fully independent — responding to one never changes the other', async () => {
    const eventA = buildEvent({ id: 'evt-a', title: 'Tech Conference', dateIST: '24 Aug 2026' });
    const eventB = buildEvent({ id: 'evt-b', title: 'Networking Event', dateIST: '24 Aug 2026' });
    mockedApi.getEvents.mockResolvedValue([eventA, eventB]);
    mockedApi.updateEventResponse.mockResolvedValue({} as never);

    render(<MemberEventsPage />);

    await waitFor(() => expect(screen.getByText('Tech Conference')).toBeInTheDocument());
    expect(screen.getByText('Networking Event')).toBeInTheDocument();

    // Respond ATTENDING on the first event only.
    const attendingButtons = screen.getAllByText('Attending');
    fireEvent.click(attendingButtons[0]);

    await waitFor(() => expect(mockedApi.updateEventResponse).toHaveBeenCalledWith('evt-a', 'ATTENDING'));
    expect(mockedApi.updateEventResponse).not.toHaveBeenCalledWith('evt-b', expect.anything());
  });

  it('groups events by date and separates Upcoming/Live from Past via tabs', async () => {
    const upcoming = buildEvent({ id: 'evt-upcoming', title: 'Upcoming Event', status: 'UPCOMING' });
    const past = buildEvent({ id: 'evt-past', title: 'Past Event', status: 'COMPLETED', currentUserResponse: 'ATTENDING' });
    mockedApi.getEvents.mockResolvedValue([upcoming, past]);

    render(<MemberEventsPage />);

    await waitFor(() => expect(screen.getByText('Upcoming Event')).toBeInTheDocument());
    expect(screen.queryByText('Past Event')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Past'));
    await waitFor(() => expect(screen.getByText('Past Event')).toBeInTheDocument());
    expect(screen.queryByText('Upcoming Event')).not.toBeInTheDocument();
  });
});
