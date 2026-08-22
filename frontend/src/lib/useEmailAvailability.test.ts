import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useEmailAvailability } from './useEmailAvailability';
import { apiClient } from './api-client';

vi.mock('./api-client', () => ({
  apiClient: {
    checkEmailAvailability: vi.fn(),
  },
}));

const mockedCheck = vi.mocked(apiClient.checkEmailAvailability);

describe('useEmailAvailability', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockedCheck.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts idle when disabled or empty', () => {
    const { result } = renderHook(({ email, enabled }) => useEmailAvailability(email, enabled), {
      initialProps: { email: '', enabled: true },
    });
    expect(result.current).toBe('idle');
  });

  it('reports invalid for a malformed email without making a network request', () => {
    const { result } = renderHook(({ email, enabled }) => useEmailAvailability(email, enabled), {
      initialProps: { email: 'not-an-email', enabled: true },
    });
    expect(result.current).toBe('invalid');
    expect(mockedCheck).not.toHaveBeenCalled();
  });

  it('debounces rapid keystrokes into exactly one request for the final value', async () => {
    mockedCheck.mockResolvedValue({ available: true });

    const { rerender } = renderHook(({ email, enabled }) => useEmailAvailability(email, enabled), {
      initialProps: { email: 'a', enabled: true },
    });

    // Simulate fast typing: each keystroke arrives well inside the debounce window.
    for (const partial of ['an', 'ana', 'anan', 'anan@example.com']) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(50);
      });
      rerender({ email: partial, enabled: true });
    }

    // Nothing should have fired yet — still within the debounce window of the last keystroke.
    expect(mockedCheck).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(mockedCheck).toHaveBeenCalledTimes(1);
    expect(mockedCheck).toHaveBeenCalledWith('anan@example.com', expect.anything());
  });

  it('never lets a stale response overwrite a newer one', async () => {
    // "alex@example.com" resolves slowly with a taken result; "alexander@example.com"
    // is queried afterwards and resolves quickly with available — the final
    // status must reflect the second (newer) query, not whichever resolves last.
    let resolveFirst!: (v: { available: boolean }) => void;
    const firstCall = new Promise<{ available: boolean }>((resolve) => {
      resolveFirst = resolve;
    });
    mockedCheck.mockImplementationOnce(() => firstCall);
    mockedCheck.mockImplementationOnce(() => Promise.resolve({ available: true }));

    const { result, rerender } = renderHook(({ email, enabled }) => useEmailAvailability(email, enabled), {
      initialProps: { email: 'alex@example.com', enabled: true },
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(mockedCheck).toHaveBeenCalledTimes(1);

    rerender({ email: 'alexander@example.com', enabled: true });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(mockedCheck).toHaveBeenCalledTimes(2);
    expect(result.current).toBe('available');

    // The stale first request now resolves late — it must not flip the status back.
    await act(async () => {
      resolveFirst({ available: false });
      await Promise.resolve();
    });
    expect(result.current).toBe('available');
  });

  it('reports taken/available correctly for a settled valid email', async () => {
    mockedCheck.mockResolvedValue({ available: false });

    const { result } = renderHook(({ email, enabled }) => useEmailAvailability(email, enabled), {
      initialProps: { email: 'taken@example.com', enabled: true },
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(result.current).toBe('taken');
  });
});
