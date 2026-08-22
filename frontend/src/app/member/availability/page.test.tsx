import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import AvailabilityPage from './page';
import { apiClient } from '../../../lib/api-client';
import { WeeklyAvailabilitySchedule, DayOfWeek, HourlySlot } from '../../../types/availability';

vi.mock('../../../components/layout/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
}));

vi.mock('../../../lib/auth-context', () => ({
  useAuth: () => ({ user: { id: 'user-1', name: 'Sarah Connor' } }),
}));

vi.mock('../../../lib/realtime-context', () => ({
  useDomainEvent: () => {},
}));

vi.mock('../../../lib/api-client', () => ({
  apiClient: {
    getUserAvailability: vi.fn(),
    updateUserAvailability: vi.fn(),
  },
}));

const mockedApi = vi.mocked(apiClient);

const DAYS: DayOfWeek[] = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];

function buildSchedule(): WeeklyAvailabilitySchedule {
  const days = {} as Record<DayOfWeek, HourlySlot[]>;
  for (const day of DAYS) {
    days[day] = Array.from({ length: 24 }, (_, hour) => ({ hour, state: 'UNAVAILABLE' as const }));
  }
  // Hour 3 is outside the 7-20 display range — must never be sent back.
  days.MONDAY[3] = { hour: 3, state: 'AVAILABLE' };
  // Hour 10 is task-driven BUSY — must never be sent back.
  days.MONDAY[10] = { hour: 10, state: 'BUSY', taskId: 'task-1' };
  return {
    userId: 'user-1',
    timezone: 'UTC',
    days,
    totalCapacityHours: 1,
    allocatedHours: 1,
    remainingAvailableHours: 0,
  };
}

describe('Member availability page — save handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('flattens the schedule excluding BUSY and out-of-range hours, and sends the correct shape', async () => {
    mockedApi.getUserAvailability.mockResolvedValue(buildSchedule());
    mockedApi.updateUserAvailability.mockResolvedValue(buildSchedule());

    render(<AvailabilityPage />);

    await waitFor(() => expect(screen.getByTitle('Monday 9:00 - UNAVAILABLE')).toBeInTheDocument());

    fireEvent.click(screen.getByTitle('Monday 9:00 - UNAVAILABLE'));
    const saveButton = screen.getByRole('button', { name: /Save Schedule/i });

    await act(async () => {
      fireEvent.click(saveButton);
    });

    await waitFor(() => expect(mockedApi.updateUserAvailability).toHaveBeenCalledTimes(1));
    const [, body] = mockedApi.updateUserAvailability.mock.calls[0];
    const slots = body.slots;

    expect(slots.some((s) => s.day === 'MONDAY' && s.hour === 3)).toBe(false);
    expect(slots.some((s) => s.day === 'MONDAY' && s.hour === 10)).toBe(false);
    const mondayNine = slots.find((s) => s.day === 'MONDAY' && s.hour === 9);
    expect(mondayNine).toBeDefined();
    expect(mondayNine!.state).toBe('AVAILABLE');
  });

  it('shows an error and never clears the schedule when the save fails', async () => {
    mockedApi.getUserAvailability.mockResolvedValue(buildSchedule());
    mockedApi.updateUserAvailability.mockRejectedValue(new Error('Network error, please retry'));

    render(<AvailabilityPage />);

    await waitFor(() => expect(screen.getByTitle('Monday 9:00 - UNAVAILABLE')).toBeInTheDocument());
    fireEvent.click(screen.getByTitle('Monday 9:00 - UNAVAILABLE'));
    const saveButton = screen.getByRole('button', { name: /Save Schedule/i });

    await act(async () => {
      fireEvent.click(saveButton);
    });

    expect(await screen.findByText('Network error, please retry')).toBeInTheDocument();
    // getUserAvailability was only called once (initial load) — no refetch
    // was triggered by the failed save, and the edited cell is still shown.
    expect(mockedApi.getUserAvailability).toHaveBeenCalledTimes(1);
    expect(screen.getByTitle('Monday 9:00 - AVAILABLE')).toBeInTheDocument();
  });
});
