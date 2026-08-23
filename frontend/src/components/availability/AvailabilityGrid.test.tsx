import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { AvailabilityGrid } from './AvailabilityGrid';
import { WeeklyAvailabilitySchedule, DayOfWeek, HourlySlot } from '../../types/availability';

const DAYS: DayOfWeek[] = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];

function buildSchedule(): WeeklyAvailabilitySchedule {
  const days = {} as Record<DayOfWeek, HourlySlot[]>;
  for (const day of DAYS) {
    days[day] = Array.from({ length: 24 }, (_, hour) => ({ hour, state: 'UNAVAILABLE' as const }));
  }
  return {
    userId: 'user-1',
    timezone: 'UTC',
    days,
    totalCapacityHours: 0,
    allocatedHours: 0,
    remainingAvailableHours: 0,
  };
}

describe('AvailabilityGrid — save flow', () => {
  it('awaits onSave, shows Saving..., and clears hasChanges only on success', async () => {
    let resolveSave!: () => void;
    const onSave = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSave = resolve;
        })
    );

    render(<AvailabilityGrid initialSchedule={buildSchedule()} onSave={onSave} />);

    fireEvent.click(screen.getByTitle('Monday 9:00 - UNAVAILABLE'));
    const saveButton = screen.getByRole('button', { name: /Save Schedule/i });

    fireEvent.click(saveButton);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /Saving/i })).toBeInTheDocument();

    await act(async () => {
      resolveSave();
      await Promise.resolve();
    });

    // Save succeeded — the Save button (only rendered while hasChanges) disappears.
    await waitFor(() => expect(screen.queryByRole('button', { name: /Save Schedule/i })).not.toBeInTheDocument());
  });

  it('keeps hasChanges (and the Save button) visible when onSave rejects, so a retry is possible', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('network error'));

    render(<AvailabilityGrid initialSchedule={buildSchedule()} onSave={onSave} />);

    fireEvent.click(screen.getByTitle('Monday 9:00 - UNAVAILABLE'));
    const saveButton = screen.getByRole('button', { name: /Save Schedule/i });

    await act(async () => {
      fireEvent.click(saveButton);
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    // Still visible — the edit was not discarded, retry remains possible.
    expect(screen.getByRole('button', { name: /Save Schedule/i })).toBeInTheDocument();
  });
});

describe('AvailabilityGrid — calendar-aware props (dateLabels, disabledDays, todayDayOfWeek)', () => {
  it('renders the real date under the day name when dateLabels is provided', () => {
    render(
      <AvailabilityGrid
        initialSchedule={buildSchedule()}
        dateLabels={{ MONDAY: 'Sep 1', TUESDAY: 'Sep 2' }}
      />
    );

    expect(screen.getByText('Sep 1')).toBeInTheDocument();
    expect(screen.getByText('Sep 2')).toBeInTheDocument();
  });

  it('makes a disabled day non-interactive — clicking it never changes state or fires onSave-eligible changes', () => {
    const onSave = vi.fn();
    render(
      <AvailabilityGrid
        initialSchedule={buildSchedule()}
        onSave={onSave}
        dateLabels={{ MONDAY: 'Aug 31' }}
        disabledDays={{ MONDAY: true }}
      />
    );

    fireEvent.click(screen.getByTitle('Monday Aug 31 9:00 - Outside selected month'));

    // No Save button ever appears — the click was a no-op.
    expect(screen.queryByRole('button', { name: /Save Schedule/i })).not.toBeInTheDocument();
  });

  it('an in-month day next to a disabled day remains fully editable', () => {
    render(
      <AvailabilityGrid
        initialSchedule={buildSchedule()}
        dateLabels={{ MONDAY: 'Aug 31', TUESDAY: 'Sep 1' }}
        disabledDays={{ MONDAY: true, TUESDAY: false }}
      />
    );

    fireEvent.click(screen.getByTitle('Tuesday Sep 1 9:00 - UNAVAILABLE'));
    expect(screen.getByRole('button', { name: /Save Schedule/i })).toBeInTheDocument();
  });

  it('highlights the todayDayOfWeek row', () => {
    render(<AvailabilityGrid initialSchedule={buildSchedule()} todayDayOfWeek="WEDNESDAY" />);
    expect(screen.getByText('Today')).toBeInTheDocument();
  });

  it('does not render a "Today" marker when todayDayOfWeek is null', () => {
    render(<AvailabilityGrid initialSchedule={buildSchedule()} todayDayOfWeek={null} />);
    expect(screen.queryByText('Today')).not.toBeInTheDocument();
  });
});
