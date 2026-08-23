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
    startMeal: vi.fn(),
    endMeal: vi.fn(),
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

describe('AttendanceCard — meal (Lunch/Dinner) button', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows "Lunch" before 6 PM and calls startMeal on click', async () => {
    vi.spyOn(Date.prototype, 'getHours').mockReturnValue(12);
    mockedApi.getAttendanceMe.mockResolvedValue(buildAttendance());
    mockedApi.startMeal.mockResolvedValue({} as never);

    render(<AttendanceCard />);
    await waitFor(() => expect(screen.getByText('Lunch')).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getByText('Lunch'));
    });

    expect(mockedApi.startMeal).toHaveBeenCalledTimes(1);
    expect(mockedApi.checkInAttendance).not.toHaveBeenCalled();
    expect(mockedApi.checkOutAttendance).not.toHaveBeenCalled();
  });

  it('shows "Dinner" at/after 6 PM', async () => {
    vi.spyOn(Date.prototype, 'getHours').mockReturnValue(19);
    mockedApi.getAttendanceMe.mockResolvedValue(buildAttendance());

    render(<AttendanceCard />);
    await waitFor(() => expect(screen.getByText('Dinner')).toBeInTheDocument());
    expect(screen.queryByText('Lunch')).not.toBeInTheDocument();
  });

  it('shows "End Lunch" while already in a meal, and calls endMeal on click', async () => {
    vi.spyOn(Date.prototype, 'getHours').mockReturnValue(13);
    mockedApi.getAttendanceMe.mockResolvedValue(buildAttendance({ availabilityState: 'MEAL', availabilityLabel: 'Meal' }));
    mockedApi.endMeal.mockResolvedValue({} as never);

    render(<AttendanceCard />);
    await waitFor(() => expect(screen.getByText('End Lunch')).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getByText('End Lunch'));
    });

    expect(mockedApi.endMeal).toHaveBeenCalledTimes(1);
    expect(mockedApi.checkInAttendance).not.toHaveBeenCalled();
    expect(mockedApi.checkOutAttendance).not.toHaveBeenCalled();
  });

  it('disables the meal button while checked out', async () => {
    vi.spyOn(Date.prototype, 'getHours').mockReturnValue(12);
    mockedApi.getAttendanceMe.mockResolvedValue(
      buildAttendance({ state: 'OUT', presenceState: 'OUT', availabilityState: 'UNAVAILABLE', currentSession: null })
    );

    render(<AttendanceCard />);
    await waitFor(() => expect(screen.getByText('Lunch')).toBeInTheDocument());
    expect(screen.getByText('Lunch').closest('button')).toBeDisabled();
  });
});
