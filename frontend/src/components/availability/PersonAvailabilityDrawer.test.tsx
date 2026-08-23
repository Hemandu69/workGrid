import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { PersonAvailabilityDrawer } from './PersonAvailabilityDrawer';
import { apiClient, PersonAvailabilityDetailResponse } from '../../lib/api-client';

vi.mock('../../lib/realtime-context', () => ({
  useDomainEvent: () => {},
}));

let mockRole = 'MEMBER';
vi.mock('../../lib/auth-context', () => ({
  useAuth: () => ({ role: mockRole }),
}));

vi.mock('../../lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api-client')>('../../lib/api-client');
  return {
    ...actual,
    apiClient: {
      getPersonAvailabilityDetail: vi.fn(),
      updatePresence: vi.fn(),
      setAvailabilityStatus: vi.fn(),
    },
  };
});

const mockedApi = vi.mocked(apiClient);

function buildDetail(): PersonAvailabilityDetailResponse {
  return {
    person: {
      id: 'user-2',
      name: 'Sarah Connor',
      email: 'sarah.connor@workgrid.corp',
      role: 'MEMBER',
      status: 'ONLINE',
      attendanceState: 'IN',
      presenceState: 'IN',
      arrivedAtIST: '9:00 AM',
      capacityLimitHours: 40,
      currentAllocatedHours: 10,
    },
    currentStatus: { state: 'FREE', reason: 'Available for assignment' },
    nextFree: { isCurrentlyFree: true, statusText: 'Available now' },
    weeklyTimeline: [
      {
        date: '2026-08-23',
        dayName: 'Sun 23',
        dayOfWeek: 'SUNDAY',
        isToday: true,
        status: 'FREE',
        windows: [{ startHour: 0, endHour: 24, startFormatted: '12:00 AM', endFormatted: '12:00 AM', label: 'Free' }],
      },
      {
        date: '2026-08-24',
        dayName: 'Mon 24',
        dayOfWeek: 'MONDAY',
        isToday: false,
        status: 'BUSY',
        windows: [{ startHour: 0, endHour: 24, startFormatted: '12:00 AM', endFormatted: '12:00 AM', label: 'Busy' }],
      },
    ],
    upcomingCommitments: [],
  } as unknown as PersonAvailabilityDetailResponse;
}

describe('PersonAvailabilityDrawer — read-only + collapsible days', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRole = 'MEMBER';
    mockedApi.getPersonAvailabilityDetail.mockResolvedValue(buildDetail());
  });

  it('renders no mutation controls for another person, even for SUPER_ADMIN', async () => {
    mockRole = 'SUPER_ADMIN';
    render(<PersonAvailabilityDrawer userId="user-2" onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByText('Sarah Connor')).toBeInTheDocument());

    expect(screen.queryByTitle(/Set availability to/i)).not.toBeInTheDocument();
    expect(screen.queryByTitle('Set attendance to IN')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Set attendance to OUT')).not.toBeInTheDocument();
    // The [ IN ] attendance state is shown, but only as a read-only badge —
    // never as a clickable button.
    expect(screen.getByText('[ IN ]').closest('button')).toBeNull();
  });

  it('renders no mutation controls for ADMIN either', async () => {
    mockRole = 'ADMIN';
    render(<PersonAvailabilityDrawer userId="user-2" onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByText('Sarah Connor')).toBeInTheDocument());
    expect(screen.queryByTitle(/Set availability to/i)).not.toBeInTheDocument();
  });

  it('defaults to today expanded, other days collapsed', async () => {
    render(<PersonAvailabilityDrawer userId="user-2" onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByText('Sun 23')).toBeInTheDocument());

    // Today's window chip is visible; Monday's is not (collapsed).
    const windowChips = screen.getAllByText('12:00 AM – 12:00 AM');
    expect(windowChips).toHaveLength(1);
  });

  it('clicking a collapsed day expands it and reveals its merged windows', async () => {
    render(<PersonAvailabilityDrawer userId="user-2" onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByText('Mon 24')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Mon 24'));

    await waitFor(() => expect(screen.getAllByText('12:00 AM – 12:00 AM')).toHaveLength(1));
  });
});
