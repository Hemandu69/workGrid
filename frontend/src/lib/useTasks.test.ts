import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useTasks } from './useTasks';
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
    getTasks: vi.fn(),
  },
}));

const mockedGetTasks = vi.mocked(apiClient.getTasks);

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client }, children);
}

describe('useTasks — realtime cache sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    domainEventCallback = null;
  });

  it('patches the cache via a background refetch on TASK_STATUS_CHANGED, without dropping to a loading state', async () => {
    mockedGetTasks.mockResolvedValueOnce({
      items: [{ id: 'task-1', title: 'Ship it', status: 'OPEN' }],
      total: 1,
      limit: 50,
      offset: 0,
    } as never);

    const { result } = renderHook(() => useTasks(), { wrapper });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.items[0]).toMatchObject({ id: 'task-1', status: 'OPEN' });
    expect(result.current.isLoading).toBe(false);
    expect(mockedGetTasks).toHaveBeenCalledTimes(1);
    expect(domainEventCallback).not.toBeNull();

    mockedGetTasks.mockResolvedValueOnce({
      items: [{ id: 'task-1', title: 'Ship it', status: 'IN_PROGRESS' }],
      total: 1,
      limit: 50,
      offset: 0,
    } as never);

    domainEventCallback!({
      id: 'evt-1',
      type: 'TASK_STATUS_CHANGED',
      organizationId: 'org-1',
      entityId: 'task-1',
      payload: {},
      timestamp: new Date().toISOString(),
    });

    // The previous page of data must stay visible during the refetch —
    // no full-page loading state, only isFetching flips.
    expect(result.current.isLoading).toBe(false);
    expect(result.current.data?.items[0].status).toBe('OPEN');

    await waitFor(() => expect(result.current.data?.items[0].status).toBe('IN_PROGRESS'));
    expect(mockedGetTasks).toHaveBeenCalledTimes(2);
    expect(result.current.isLoading).toBe(false);
  });
});
