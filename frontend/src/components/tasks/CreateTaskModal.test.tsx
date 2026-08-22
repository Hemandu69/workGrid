import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CreateTaskModal } from './CreateTaskModal';
import { apiClient } from '../../lib/api-client';

vi.mock('../../lib/auth-context', () => ({
  useAuth: () => ({
    user: { id: 'admin-1', name: 'Test Admin', room: undefined, subroom: undefined },
    role: 'ADMIN',
  }),
}));

vi.mock('../../lib/api-client', () => ({
  apiClient: {
    getUsers: vi.fn(),
    getRooms: vi.fn(),
    getCampaigns: vi.fn(),
    createTask: vi.fn(),
  },
}));

const mockedApi = vi.mocked(apiClient);

function renderModal(isOpen: boolean, onClose = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CreateTaskModal isOpen={isOpen} onClose={onClose} />
    </QueryClientProvider>
  );
}

describe('CreateTaskModal — idempotency key generation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedApi.getUsers.mockResolvedValue({
      items: [{ id: 'member-1', name: 'Sarah Connor', role: 'MEMBER', room: 'Room B', subroom: 'B3', title: 'Engineer' }],
      total: 1,
      limit: 200,
      offset: 0,
    } as never);
    mockedApi.getRooms.mockResolvedValue([]);
    mockedApi.getCampaigns.mockResolvedValue([]);
    mockedApi.createTask.mockResolvedValue({} as never);
  });

  it('sends an Idempotency-Key header on submission, and a fresh one on reopen', async () => {
    const { rerender } = renderModal(true);

    await waitFor(() => expect(screen.getByLabelText('Task Title')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Task Title'), { target: { value: 'First attempt' } });
    fireEvent.click(screen.getByRole('button', { name: /Assign Task/i }));

    await waitFor(() => expect(mockedApi.createTask).toHaveBeenCalledTimes(1));
    const firstKey = mockedApi.createTask.mock.calls[0][2];
    expect(typeof firstKey).toBe('string');
    expect(firstKey).toMatch(/^[0-9a-f-]{36}$/i);

    // Close, then reopen — a genuinely new attempt must get a new key.
    rerender(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <CreateTaskModal isOpen={false} onClose={vi.fn()} />
      </QueryClientProvider>
    );
    rerender(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <CreateTaskModal isOpen={true} onClose={vi.fn()} />
      </QueryClientProvider>
    );

    await waitFor(() => expect(screen.getByLabelText('Task Title')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Task Title'), { target: { value: 'Second attempt' } });
    fireEvent.click(screen.getByRole('button', { name: /Assign Task/i }));

    await waitFor(() => expect(mockedApi.createTask).toHaveBeenCalledTimes(2));
    const secondKey = mockedApi.createTask.mock.calls[1][2];
    expect(secondKey).not.toBe(firstKey);
  });

  it('reuses the same key if the same open attempt is retried (component does not regenerate mid-attempt)', async () => {
    // Make the first createTask call hang so the modal stays open mid-submission,
    // simulating a slow network the user might retry against.
    let resolveCreate!: (v: unknown) => void;
    mockedApi.createTask.mockImplementationOnce(
      () =>
        new Promise<unknown>((resolve) => {
          resolveCreate = resolve;
        }) as never
    );
    mockedApi.createTask.mockResolvedValueOnce({} as never);

    renderModal(true);
    await waitFor(() => expect(screen.getByLabelText('Task Title')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Task Title'), { target: { value: 'Retry me' } });
    fireEvent.click(screen.getByRole('button', { name: /Assign Task/i }));

    await waitFor(() => expect(mockedApi.createTask).toHaveBeenCalledTimes(1));
    const key = mockedApi.createTask.mock.calls[0][2];

    await act(async () => {
      resolveCreate({});
      await Promise.resolve();
    });

    // The isOpen prop never changed during this whole attempt — the ref
    // backing the key must not have been regenerated.
    expect(mockedApi.createTask.mock.calls[0][2]).toBe(key);
  });
});
