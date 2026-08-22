'use client';

import { useCallback, useRef, useState } from 'react';

export type AsyncActionStatus = 'idle' | 'pending' | 'success' | 'error';

export interface UseAsyncActionResult<Args extends unknown[]> {
  status: AsyncActionStatus;
  isPending: boolean;
  error: string | null;
  /** Runs the action; ignores a call while one is already in flight so a double-click can never fire twice. */
  run: (...args: Args) => Promise<void>;
  reset: () => void;
}

/**
 * Extracts the isSubmitting -> try/finally -> reset idiom already
 * hand-written correctly in CreateTaskModal/AttendanceCard/EventCard into
 * one reusable hook, for newly-touched mutation buttons going forward.
 * Guards against double-submission by constrution: run() is a no-op while
 * a previous call is still pending.
 */
export function useAsyncAction<Args extends unknown[] = []>(
  action: (...args: Args) => Promise<unknown>
): UseAsyncActionResult<Args> {
  const [status, setStatus] = useState<AsyncActionStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const pendingRef = useRef(false);

  const run = useCallback(
    async (...args: Args) => {
      if (pendingRef.current) return;
      pendingRef.current = true;
      setStatus('pending');
      setError(null);
      try {
        await action(...args);
        setStatus('success');
      } catch (err) {
        setStatus('error');
        setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      } finally {
        pendingRef.current = false;
      }
    },
    [action]
  );

  const reset = useCallback(() => {
    setStatus('idle');
    setError(null);
  }, []);

  return { status, isPending: status === 'pending', error, run, reset };
}
