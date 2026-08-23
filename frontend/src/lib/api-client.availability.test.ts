import { describe, it, expect, vi, afterEach } from 'vitest';
import { apiClient } from './api-client';

function mockFetchOnce(body: unknown, ok = true) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok,
      status: ok ? 200 : 400,
      json: async () => body,
    })
  );
}

// The backend serializes `days` as an array of {day, slots} objects (confirmed
// against the real API response), not the Record<DayOfWeek, HourlySlot[]> the
// rest of the frontend (AvailabilityGrid, member/availability/page) expects.
// Without normalization, every cell silently renders as blank/UNAVAILABLE and
// clicking any cell throws (`schedule.days[day].find` on undefined).
const RAW_BACKEND_RESPONSE = {
  userId: 'user-1',
  timezone: 'Asia/Kolkata',
  timezoneLabel: 'IST',
  allocatedHours: 10,
  totalCapacityHours: 5,
  remainingAvailableHours: 0,
  days: [
    { day: 'MONDAY', slots: [{ hour: 9, state: 'AVAILABLE' }] },
    { day: 'TUESDAY', slots: [{ hour: 10, state: 'BUSY' }] },
  ],
};

describe('apiClient availability normalization', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('getUserAvailability converts the array-shaped `days` response into a Record keyed by day', async () => {
    mockFetchOnce(RAW_BACKEND_RESPONSE);

    const result = await apiClient.getUserAvailability('user-1');

    expect(Array.isArray(result.days)).toBe(false);
    expect(result.days.MONDAY).toEqual([{ hour: 9, state: 'AVAILABLE' }]);
    expect(result.days.TUESDAY).toEqual([{ hour: 10, state: 'BUSY' }]);
  });

  it('updateUserAvailability also normalizes its response the same way', async () => {
    mockFetchOnce(RAW_BACKEND_RESPONSE);

    const result = await apiClient.updateUserAvailability('user-1', { slots: [] });

    expect(Array.isArray(result.days)).toBe(false);
    expect(result.days.MONDAY).toEqual([{ hour: 9, state: 'AVAILABLE' }]);
  });
});
