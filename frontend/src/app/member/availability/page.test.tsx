import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import AvailabilityPage from './page';
import { apiClient } from '../../../lib/api-client';
import { WeekAvailabilityResponse, DayOfWeek, HourlySlot } from '../../../types/availability';

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
    getWeekAvailability: vi.fn(),
    updateWeekAvailability: vi.fn(),
  },
}));

// Fixes "today" to 2026-08-17 (a Monday) without touching global fake timers
// — vi.useFakeTimers() interferes with @testing-library's waitFor polling.
vi.mock('../../../lib/time-utils', () => ({
  getCurrentISTDateString: () => '2026-08-17',
}));

const mockedApi = vi.mocked(apiClient);

// 2026-08-17 is a Monday — the week under test is Mon 17 -> Sun 23, entirely
// inside August, so every day is in-month (no disabled rows to worry about).
const WEEK_DAYS: { date: string; dayOfWeek: DayOfWeek }[] = [
  { date: '2026-08-17', dayOfWeek: 'MONDAY' },
  { date: '2026-08-18', dayOfWeek: 'TUESDAY' },
  { date: '2026-08-19', dayOfWeek: 'WEDNESDAY' },
  { date: '2026-08-20', dayOfWeek: 'THURSDAY' },
  { date: '2026-08-21', dayOfWeek: 'FRIDAY' },
  { date: '2026-08-22', dayOfWeek: 'SATURDAY' },
  { date: '2026-08-23', dayOfWeek: 'SUNDAY' },
];

function buildWeek(): WeekAvailabilityResponse {
  const days = WEEK_DAYS.map(({ date, dayOfWeek }) => {
    const slots: HourlySlot[] = Array.from({ length: 24 }, (_, hour) => ({ hour, state: 'UNAVAILABLE' as const }));
    if (dayOfWeek === 'MONDAY') {
      // Hour 3 is outside the 7-20 display range — must never be sent back.
      slots[3] = { hour: 3, state: 'AVAILABLE' };
      // Hour 10 is task-driven BUSY — must never be sent back.
      slots[10] = { hour: 10, state: 'BUSY', taskId: 'task-1' };
    }
    return { date, dayOfWeek, slots };
  });

  return {
    userId: 'user-1',
    timezone: 'Asia/Kolkata',
    weekStart: '2026-08-17',
    weekEnd: '2026-08-23',
    days,
    totalCapacityHours: 1,
    allocatedHours: 1,
    remainingAvailableHours: 0,
  };
}

describe('Member availability page — calendar-aware save handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('flattens the selected week excluding BUSY-with-taskId and out-of-range hours, keyed by real date', async () => {
    mockedApi.getWeekAvailability.mockResolvedValue(buildWeek());
    mockedApi.updateWeekAvailability.mockResolvedValue(buildWeek());

    render(<AvailabilityPage />);

    await waitFor(() => expect(screen.getByTitle('Monday Aug 17 9:00 - UNAVAILABLE')).toBeInTheDocument());

    fireEvent.click(screen.getByTitle('Monday Aug 17 9:00 - UNAVAILABLE'));
    const saveButton = screen.getByRole('button', { name: /Save Schedule/i });

    await act(async () => {
      fireEvent.click(saveButton);
    });

    await waitFor(() => expect(mockedApi.updateWeekAvailability).toHaveBeenCalledTimes(1));
    const [, body] = mockedApi.updateWeekAvailability.mock.calls[0];
    expect(body.weekStart).toBe('2026-08-17');

    const monday = body.days.find((d) => d.date === '2026-08-17');
    expect(monday).toBeDefined();
    expect(monday!.slots.some((s) => s.hour === 3)).toBe(false); // outside 7-20
    expect(monday!.slots.some((s) => s.hour === 10)).toBe(false); // task-locked
    const nine = monday!.slots.find((s) => s.hour === 9);
    expect(nine).toBeDefined();
    expect(nine!.state).toBe('AVAILABLE');
  });

  it('only ever includes the 7 real dates of the currently viewed week — no other week can leak in', async () => {
    mockedApi.getWeekAvailability.mockResolvedValue(buildWeek());
    mockedApi.updateWeekAvailability.mockResolvedValue(buildWeek());

    render(<AvailabilityPage />);
    await waitFor(() => expect(screen.getByTitle('Monday Aug 17 9:00 - UNAVAILABLE')).toBeInTheDocument());

    fireEvent.click(screen.getByTitle('Monday Aug 17 9:00 - UNAVAILABLE'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Save Schedule/i }));
    });

    await waitFor(() => expect(mockedApi.updateWeekAvailability).toHaveBeenCalledTimes(1));
    const [, body] = mockedApi.updateWeekAvailability.mock.calls[0];
    expect(body.days.map((d) => d.date).sort()).toEqual(WEEK_DAYS.map((d) => d.date).sort());
  });

  it('shows an error and never clears the schedule when the save fails', async () => {
    mockedApi.getWeekAvailability.mockResolvedValue(buildWeek());
    mockedApi.updateWeekAvailability.mockRejectedValue(new Error('Network error, please retry'));

    render(<AvailabilityPage />);

    await waitFor(() => expect(screen.getByTitle('Monday Aug 17 9:00 - UNAVAILABLE')).toBeInTheDocument());
    fireEvent.click(screen.getByTitle('Monday Aug 17 9:00 - UNAVAILABLE'));
    const saveButton = screen.getByRole('button', { name: /Save Schedule/i });

    await act(async () => {
      fireEvent.click(saveButton);
    });

    expect(await screen.findByText('Network error, please retry')).toBeInTheDocument();
    // getWeekAvailability was only called once (initial load) — no refetch
    // was triggered by the failed save, and the edited cell is still shown.
    expect(mockedApi.getWeekAvailability).toHaveBeenCalledTimes(1);
    expect(screen.getByTitle('Monday Aug 17 9:00 - AVAILABLE')).toBeInTheDocument();
  });
});
