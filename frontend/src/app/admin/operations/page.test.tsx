import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import AdminOperationsPage from './page';
import { apiClient, OperationalGridResponse } from '../../../lib/api-client';

const STORAGE_KEY = 'workgrid:operations-grid:selected-event';

let triggerRealtimeCallback: (() => void) | null = null;

vi.mock('../../../components/layout/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
}));

vi.mock('../../../lib/auth-context', () => ({
  useAuth: () => ({
    user: { id: 'admin-1', name: 'Elena Vance', role: 'SUPER_ADMIN', room: null },
    role: 'SUPER_ADMIN',
    isAuthenticated: true,
  }),
}));

vi.mock('../../../lib/realtime-context', () => ({
  useDomainEvent: (_events: string[], callback: () => void) => {
    triggerRealtimeCallback = callback;
  },
}));

vi.mock('../../../lib/api-client', () => ({
  apiClient: {
    getOperationalGrid: vi.fn(),
  },
}));

const mockedApi = vi.mocked(apiClient);

function createMockGridResponse(selectedEventId: string | null = null): OperationalGridResponse {
  const availableEvents = [
    {
      id: 'event-a',
      title: 'Cloud Infrastructure Summit',
      dateIST: '27 Aug 2026',
      timeIST: '10:00 AM',
      endTimeIST: '06:00 PM',
      status: 'UPCOMING' as const,
    },
    {
      id: 'event-b',
      title: 'Annual Security Briefing',
      dateIST: '28 Aug 2026',
      timeIST: '02:00 PM',
      endTimeIST: '04:00 PM',
      status: 'LIVE' as const,
    },
  ];

  let selectedEvent = null;
  if (selectedEventId === 'event-a') {
    selectedEvent = {
      id: 'event-a',
      title: 'Cloud Infrastructure Summit',
      description: 'Annual cloud summit',
      dateIST: '27 Aug 2026',
      timeIST: '10:00 AM',
      endTimeIST: '06:00 PM',
      status: 'UPCOMING' as const,
      totalEligible: 55,
      attendingCount: 20,
      maybeCount: 5,
      notAttendingCount: 2,
      noResponseCount: 28,
    };
  } else if (selectedEventId === 'event-b') {
    selectedEvent = {
      id: 'event-b',
      title: 'Annual Security Briefing',
      description: 'Security briefing',
      dateIST: '28 Aug 2026',
      timeIST: '02:00 PM',
      endTimeIST: '04:00 PM',
      status: 'LIVE' as const,
      totalEligible: 55,
      attendingCount: 35,
      maybeCount: 2,
      notAttendingCount: 1,
      noResponseCount: 17,
    };
  }

  return {
    meta: {
      timestampIST: '24 Aug 2026, 04:30 PM',
      totalTrackedPeople: 55,
      totalPresentPeople: 2,
      totalRooms: 8,
      totalSubrooms: 64,
      totalRequiredSupervisors: 24,
      totalAvailableSupervisors: 1,
    },
    availableEvents,
    selectedEvent,
    rooms: [],
    presenceSummary: { inCount: 2, outCount: 53, total: 55 },
    availabilitySummary: { freeCount: 1, busyCount: 1, partialCount: 0, offlineCount: 53, totalPeople: 55 },
    totalServersPresent: 1,
    totalServersRequired: 24,
    uncoveredSubroomsCount: 60,
  };
}

describe('Operations Grid — Selected Event Persistence across Navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    triggerRealtimeCallback = null;
    mockedApi.getOperationalGrid.mockImplementation(async (params) => {
      return createMockGridResponse(params.eventId || null);
    });
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('1. Selecting Event A persists eventId to localStorage and fetches Event A grid', async () => {
    render(<AdminOperationsPage />);

    await waitFor(() => expect(mockedApi.getOperationalGrid).toHaveBeenCalled());

    const select = screen.getByLabelText(/Select Event:/i) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'event-a' } });

    await waitFor(() => {
      expect(localStorage.getItem(STORAGE_KEY)).toBe('event-a');
      expect(mockedApi.getOperationalGrid).toHaveBeenCalledWith(
        expect.objectContaining({ eventId: 'event-a' })
      );
    });
  });

  it('2. Navigating to /admin/operations with persisted Event A restores Event A on mount', async () => {
    localStorage.setItem(STORAGE_KEY, 'event-a');

    render(<AdminOperationsPage />);

    await waitFor(() => {
      expect(mockedApi.getOperationalGrid).toHaveBeenCalledWith(
        expect.objectContaining({ eventId: 'event-a' })
      );
    });

    const select = screen.getByLabelText(/Select Event:/i) as HTMLSelectElement;
    expect(select.value).toBe('event-a');
    expect(screen.getAllByText('Cloud Infrastructure Summit').length).toBeGreaterThanOrEqual(1);
  });

  it('3. Switching from Event A to Event B updates localStorage and restores Event B', async () => {
    localStorage.setItem(STORAGE_KEY, 'event-a');
    const { unmount } = render(<AdminOperationsPage />);

    await waitFor(() => expect(mockedApi.getOperationalGrid).toHaveBeenCalledWith(expect.objectContaining({ eventId: 'event-a' })));

    const select = screen.getByLabelText(/Select Event:/i) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'event-b' } });

    await waitFor(() => {
      expect(localStorage.getItem(STORAGE_KEY)).toBe('event-b');
    });

    unmount();

    // Re-mount (simulating returning after navigation)
    render(<AdminOperationsPage />);

    await waitFor(() => {
      expect(mockedApi.getOperationalGrid).toHaveBeenCalledWith(
        expect.objectContaining({ eventId: 'event-b' })
      );
    });
    expect(screen.getAllByText('Annual Security Briefing').length).toBeGreaterThanOrEqual(1);
  });

  it('4. Persisted event that is COMPLETED/CANCELLED or no longer in selectable events is rejected and cleared', async () => {
    localStorage.setItem(STORAGE_KEY, 'stale-completed-event');

    // API returns response where stale-completed-event is not in availableEvents
    mockedApi.getOperationalGrid.mockResolvedValueOnce(createMockGridResponse(null));

    render(<AdminOperationsPage />);

    await waitFor(() => {
      expect(mockedApi.getOperationalGrid).toHaveBeenCalledWith(
        expect.objectContaining({ eventId: 'stale-completed-event' })
      );
    });

    await waitFor(() => {
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
      const select = screen.getByLabelText(/Select Event:/i) as HTMLSelectElement;
      expect(select.value).toBe('');
    });
  });

  it('5. Persisted event that no longer exists (404) is gracefully cleared and falls back to default grid', async () => {
    localStorage.setItem(STORAGE_KEY, 'deleted-event');

    mockedApi.getOperationalGrid
      .mockRejectedValueOnce(new Error('Event not found'))
      .mockResolvedValueOnce(createMockGridResponse(null));

    render(<AdminOperationsPage />);

    await waitFor(() => {
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
      expect(mockedApi.getOperationalGrid).toHaveBeenCalledTimes(2);
    });
  });

  it('6. Realtime domain event background refresh preserves the selected event', async () => {
    localStorage.setItem(STORAGE_KEY, 'event-a');
    render(<AdminOperationsPage />);

    await waitFor(() => {
      expect(mockedApi.getOperationalGrid).toHaveBeenCalledWith(
        expect.objectContaining({ eventId: 'event-a' })
      );
    });

    expect(triggerRealtimeCallback).toBeDefined();

    // Trigger realtime background update
    act(() => {
      triggerRealtimeCallback?.();
    });

    await waitFor(() => {
      expect(mockedApi.getOperationalGrid).toHaveBeenLastCalledWith(
        expect.objectContaining({ eventId: 'event-a' })
      );
      expect(localStorage.getItem(STORAGE_KEY)).toBe('event-a');
    });
  });

  it('7. Clearing the selected event removes it from localStorage', async () => {
    localStorage.setItem(STORAGE_KEY, 'event-a');
    render(<AdminOperationsPage />);

    await waitFor(() => expect(screen.getByText('Clear')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Clear'));

    await waitFor(() => {
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
      const select = screen.getByLabelText(/Select Event:/i) as HTMLSelectElement;
      expect(select.value).toBe('');
    });
  });
});
