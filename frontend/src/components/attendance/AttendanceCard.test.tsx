import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { AttendanceCard } from './AttendanceCard';
import { apiClient } from '../../lib/api-client';
import { AttendanceMeResponse } from '../../types/attendance';

vi.mock('../../lib/auth-context', () => ({
  useAuth: () => ({
    user: { id: 'user-1', name: 'Sarah Connor', accountStatus: 'ACTIVE' },
    isAuthenticated: true,
  }),
}));

vi.mock('../../lib/realtime-context', () => ({
  useDomainEvent: () => {},
}));

vi.mock('../../lib/api-client', () => ({
  apiClient: {
    getAttendanceMe: vi.fn(),
    checkInAttendance: vi.fn(),
    checkOutAttendance: vi.fn(),
    setAvailabilityStatus: vi.fn(),
    getAttendanceHistory: vi.fn(),
  },
}));

const mockedApi = vi.mocked(apiClient);

function buildAttendance(overrides: Partial<AttendanceMeResponse> = {}): AttendanceMeResponse {
  return {
    state: 'IN',
    presenceState: 'IN',
    availabilityState: 'FREE',
    availabilityLabel: 'Free',
    currentSession: { id: 'sess-1', arrivedAt: new Date().toISOString(), arrivedAtIST: '9:00 AM', durationSeconds: 0 },
    todaySummary: { totalSeconds: 0, totalFormatted: '0m', sessionCount: 1 },
    recentSessions: [],
    ...overrides,
  };
}

describe('AttendanceCard — check-in / check-out', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows CHECK OUT and calls checkOutAttendance when currently checked in', async () => {
    mockedApi.getAttendanceMe.mockResolvedValue(buildAttendance());
    mockedApi.checkOutAttendance.mockResolvedValue({} as never);

    render(<AttendanceCard />);
    await waitFor(() => expect(screen.getByText('CHECK OUT')).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getByText('CHECK OUT'));
    });

    expect(mockedApi.checkOutAttendance).toHaveBeenCalledTimes(1);
    expect(mockedApi.checkInAttendance).not.toHaveBeenCalled();
  });

  it('shows CHECK IN and calls checkInAttendance when currently checked out', async () => {
    mockedApi.getAttendanceMe.mockResolvedValue(
      buildAttendance({ state: 'OUT', presenceState: 'OUT', availabilityState: 'UNAVAILABLE', currentSession: null })
    );
    mockedApi.checkInAttendance.mockResolvedValue({} as never);

    render(<AttendanceCard />);
    await waitFor(() => expect(screen.getByText('CHECK IN')).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getByText('CHECK IN'));
    });

    expect(mockedApi.checkInAttendance).toHaveBeenCalledTimes(1);
    expect(mockedApi.checkOutAttendance).not.toHaveBeenCalled();
  });

  it('renders no meal/Lunch/Dinner control at all — the feature has been removed', async () => {
    mockedApi.getAttendanceMe.mockResolvedValue(buildAttendance());

    render(<AttendanceCard />);
    await waitFor(() => expect(screen.getByText('CHECK OUT')).toBeInTheDocument());

    expect(screen.queryByText('Lunch')).not.toBeInTheDocument();
    expect(screen.queryByText('Dinner')).not.toBeInTheDocument();
    expect(screen.queryByText(/End Lunch/)).not.toBeInTheDocument();
    expect(screen.queryByText(/End Dinner/)).not.toBeInTheDocument();
  });
});
