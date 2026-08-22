import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAnnouncements } from './useAnnouncements';
import { apiClient } from './api-client';
import type { DomainEvent, DomainEventType } from './realtime-context';

let domainEventCallback: ((event: DomainEvent) => void) | null = null;

vi.mock('./realtime-context', () => ({
  useDomainEvent: (_types: DomainEventType[], callback: (event: DomainEvent) => void) => {
    domainEventCallback = callback;
  },
}));

vi.mock('./api-client', () => ({
  apiClient: {
    getAnnouncements: vi.fn(),
  },
}));

const mockedGetAnnouncements = vi.mocked(apiClient.getAnnouncements);

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client }, children);
}

const EVENT_TYPES: DomainEventType[] = [
  'ANNOUNCEMENT_CREATED',
  'ANNOUNCEMENT_UPDATED',
  'ANNOUNCEMENT_DELETED',
  'ANNOUNCEMENT_PINNED',
  'ANNOUNCEMENT_UNPINNED',
];

describe('useAnnouncements — realtime cache sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    domainEventCallback = null;
  });

  it.each(EVENT_TYPES)('triggers a background refetch (not a loading-state drop) on %s', async (eventType) => {
    mockedGetAnnouncements.mockResolvedValueOnce({
      items: [{ id: 'ann-1', title: 'First', pinned: false } as never],
      total: 1,
      limit: 50,
      offset: 0,
    } as never);

    const { result } = renderHook(() => useAnnouncements(), { wrapper });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.isLoading).toBe(false);
    expect(mockedGetAnnouncements).toHaveBeenCalledTimes(1);
    expect(domainEventCallback).not.toBeNull();

    mockedGetAnnouncements.mockResolvedValueOnce({
      items: [{ id: 'ann-1', title: 'Updated', pinned: true } as never],
      total: 1,
      limit: 50,
      offset: 0,
    } as never);

    domainEventCallback!({
      id: 'evt-1',
      type: eventType,
      organizationId: 'org-1',
      entityId: 'ann-1',
      payload: {},
      timestamp: new Date().toISOString(),
    });

    // Old data stays visible during the refetch — no full-page loading state.
    expect(result.current.isLoading).toBe(false);

    await waitFor(() => expect(mockedGetAnnouncements).toHaveBeenCalledTimes(2));
    expect(result.current.isLoading).toBe(false);
  });
});
