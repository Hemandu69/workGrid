import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import NotificationsPage from './page';
import { NotificationsProvider } from '../../lib/notifications-context';
import { apiClient } from '../../lib/api-client';

vi.mock('../../components/layout/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
}));

vi.mock('../../components/events/EventCard', () => ({
  EventCard: () => null,
}));

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
    getAnnouncements: vi.fn(),
    getEvents: vi.fn(),
    getNotificationReadState: vi.fn(),
    markNotificationRead: vi.fn(),
    markAllNotificationsRead: vi.fn(),
  },
}));

const mockedApi = vi.mocked(apiClient);

const OLD = '2026-08-24T09:00:00.000Z';
const NEW = '2026-08-24T11:00:00.000Z';

function buildAnnouncement(id: string, createdAt: string) {
  return {
    id,
    title: `Notice ${id}`,
    content: `Body of ${id}`,
    createdAt,
  } as never;
}

/** Renders the real provider so read-state derivation is exercised, not mocked away. */
function renderPage() {
  return render(
    <NotificationsProvider>
      <NotificationsPage />
    </NotificationsProvider>
  );
}

describe('Notifications page — server-persisted read state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedApi.getEvents.mockResolvedValue([]);
    mockedApi.getAnnouncements.mockResolvedValue({
      items: [buildAnnouncement('a1', OLD), buildAnnouncement('a2', NEW)],
      total: 2,
      limit: 50,
      offset: 0,
    } as never);
    mockedApi.getNotificationReadState.mockResolvedValue({ readKeys: [], readAllAt: null });
    mockedApi.markNotificationRead.mockResolvedValue({ notificationKey: 'ann-a1', readAt: NEW });
    mockedApi.markAllNotificationsRead.mockResolvedValue({ readAllAt: NEW });
  });

  it('shows a "Mark as read" control on every unread notification', async () => {
    renderPage();

    await waitFor(() => expect(screen.getAllByRole('button', { name: /Mark notification .* as read/ })).toHaveLength(2));
  });

  it('clicking "Mark as read" calls the backend with that notification key', async () => {
    renderPage();

    const button = await screen.findByRole('button', { name: 'Mark notification "Announcement: Notice a1" as read' });
    fireEvent.click(button);

    await waitFor(() => expect(mockedApi.markNotificationRead).toHaveBeenCalledWith('ann-a1'));
  });

  it('a notification that is read shows "Read" instead of the action', async () => {
    renderPage();

    const button = await screen.findByRole('button', { name: 'Mark notification "Announcement: Notice a1" as read' });
    fireEvent.click(button);

    await waitFor(() => expect(screen.getAllByText('Read')).toHaveLength(1));
    expect(
      screen.queryByRole('button', { name: 'Mark notification "Announcement: Notice a1" as read' })
    ).not.toBeInTheDocument();
  });

  it('REGRESSION: read state loaded from the server renders as read (a reload keeps them read)', async () => {
    // Exactly what the backend returns after a previous session marked a1 read.
    mockedApi.getNotificationReadState.mockResolvedValue({ readKeys: ['ann-a1'], readAllAt: null });

    renderPage();

    await waitFor(() => expect(screen.getByText('Read')).toBeInTheDocument());
    // Only the other one is still actionable.
    expect(screen.getAllByRole('button', { name: /Mark notification .* as read/ })).toHaveLength(1);
  });

  it('REGRESSION: the readAllAt watermark from the server marks older notifications read', async () => {
    mockedApi.getNotificationReadState.mockResolvedValue({ readKeys: [], readAllAt: '2026-08-24T10:00:00.000Z' });

    renderPage();

    // a1 (09:00) predates the watermark and is read; a2 (11:00) postdates it and is not.
    await waitFor(() => expect(screen.getAllByText('Read')).toHaveLength(1));
    expect(screen.getAllByRole('button', { name: /Mark notification .* as read/ })).toHaveLength(1);
    expect(
      screen.getByRole('button', { name: 'Mark notification "Announcement: Notice a2" as read' })
    ).toBeInTheDocument();
  });

  it('"Mark All as Read" calls the backend and marks everything read', async () => {
    mockedApi.markAllNotificationsRead.mockResolvedValue({ readAllAt: '2026-08-24T23:00:00.000Z' });
    renderPage();

    const markAll = await screen.findByRole('button', { name: 'Mark All as Read' });
    await waitFor(() => expect(markAll).not.toBeDisabled());
    fireEvent.click(markAll);

    await waitFor(() => expect(mockedApi.markAllNotificationsRead).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getAllByText('Read')).toHaveLength(2));
  });

  it('the unread count drops to zero after marking all read', async () => {
    mockedApi.markAllNotificationsRead.mockResolvedValue({ readAllAt: '2026-08-24T23:00:00.000Z' });
    renderPage();

    const markAll = await screen.findByRole('button', { name: 'Mark All as Read' });
    await waitFor(() => expect(screen.getByText('2')).toBeInTheDocument()); // unread badge
    fireEvent.click(markAll);

    await waitFor(() => expect(screen.getByText('0')).toBeInTheDocument());
  });

  it('the unread count drops by one after marking a single notification read', async () => {
    renderPage();

    await waitFor(() => expect(screen.getByText('2')).toBeInTheDocument());

    fireEvent.click(await screen.findByRole('button', { name: 'Mark notification "Announcement: Notice a1" as read' }));

    await waitFor(() => expect(screen.getByText('1')).toBeInTheDocument());
  });

  it('"Mark All as Read" is disabled once nothing is unread', async () => {
    mockedApi.getNotificationReadState.mockResolvedValue({ readKeys: ['ann-a1', 'ann-a2'], readAllAt: null });
    renderPage();

    const markAll = await screen.findByRole('button', { name: 'Mark All as Read' });
    await waitFor(() => expect(markAll).toBeDisabled());
  });

  // -------------------------------------------------------------------------
  // Failure handling — optimistic UI must never permanently claim success
  // -------------------------------------------------------------------------

  it('a failed single mark-read rolls back, leaving the notification unread', async () => {
    mockedApi.markNotificationRead.mockRejectedValue(new Error('network down'));
    renderPage();

    const button = await screen.findByRole('button', { name: 'Mark notification "Announcement: Notice a1" as read' });
    fireEvent.click(button);

    await waitFor(() => expect(mockedApi.markNotificationRead).toHaveBeenCalled());
    // Rolled back: still actionable, still counted as unread.
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Mark notification "Announcement: Notice a1" as read' })
      ).toBeInTheDocument()
    );
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('a failed mark-all rolls back, leaving notifications unread', async () => {
    mockedApi.markAllNotificationsRead.mockRejectedValue(new Error('network down'));
    renderPage();

    const markAll = await screen.findByRole('button', { name: 'Mark All as Read' });
    await waitFor(() => expect(markAll).not.toBeDisabled());
    fireEvent.click(markAll);

    await waitFor(() => expect(mockedApi.markAllNotificationsRead).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: /Mark notification .* as read/ })).toHaveLength(2)
    );
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('rapid double-clicking "Mark All as Read" issues only one request', async () => {
    let resolveIt: (v: { readAllAt: string }) => void = () => {};
    mockedApi.markAllNotificationsRead.mockReturnValue(
      new Promise((res) => {
        resolveIt = res;
      }) as never
    );
    renderPage();

    const markAll = await screen.findByRole('button', { name: 'Mark All as Read' });
    await waitFor(() => expect(markAll).not.toBeDisabled());

    fireEvent.click(markAll);
    fireEvent.click(markAll);
    fireEvent.click(markAll);

    expect(mockedApi.markAllNotificationsRead).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveIt({ readAllAt: NEW });
    });
  });

  it('never marks anything read locally when the read-state fetch fails', async () => {
    mockedApi.getNotificationReadState.mockRejectedValue(new Error('offline'));
    renderPage();

    // Everything stays unread — no fabricated local read state.
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: /Mark notification .* as read/ })).toHaveLength(2)
    );
    expect(screen.queryByText('Read')).not.toBeInTheDocument();
  });
});
