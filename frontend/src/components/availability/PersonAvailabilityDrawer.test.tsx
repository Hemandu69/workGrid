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
    upcomingCommitments: [],
  } as unknown as PersonAvailabilityDetailResponse;
}

describe('PersonAvailabilityDrawer — read-only live status, no schedule/timeline', () => {
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

  it('shows the live operations status, with no "Next Free Window" or weekly schedule anywhere', async () => {
    render(<PersonAvailabilityDrawer userId="user-2" onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByText('Live Operations Status')).toBeInTheDocument());

    expect(screen.queryByText('Next Free Window')).not.toBeInTheDocument();
    expect(screen.queryByText(/7-Day Availability Schedule/i)).not.toBeInTheDocument();
  });
});

describe('PersonAvailabilityDrawer — Reassign Room affordance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedApi.getPersonAvailabilityDetail.mockResolvedValue(buildDetail());
  });

  it('renders an unmistakable "Reassign Room" button (not plain text) for ADMIN/SUPER_ADMIN', async () => {
    mockRole = 'ADMIN';
    render(<PersonAvailabilityDrawer userId="user-2" onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByText('Sarah Connor')).toBeInTheDocument());

    const reassignButton = screen.getByRole('button', { name: /Reassign Room/i });
    expect(reassignButton).toBeInTheDocument();
    expect(reassignButton).toHaveAttribute('title', "Change this person's assigned room");
  });

  it('does not render the Reassign Room control for a MEMBER viewer (unauthorized to manage room assignment)', async () => {
    mockRole = 'MEMBER';
    render(<PersonAvailabilityDrawer userId="user-2" onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByText('Sarah Connor')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Reassign Room/i })).not.toBeInTheDocument();
  });

  it('clicking Reassign Room opens the existing room assignment modal (functionality unchanged)', async () => {
    mockRole = 'SUPER_ADMIN';
    render(<PersonAvailabilityDrawer userId="user-2" onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByText('Sarah Connor')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Reassign Room/i }));

    // RoomAssignmentModal's own title text confirms it opened.
    await waitFor(() => expect(screen.getByText(/Reassign Room — Sarah Connor/i)).toBeInTheDocument());
  });
});
