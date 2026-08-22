'use client';

import { useEffect, useRef, useState } from 'react';
import { apiClient } from './api-client';

export type EmailAvailabilityStatus = 'idle' | 'invalid' | 'checking' | 'available' | 'taken' | 'error';

const DEBOUNCE_MS = 300;

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Debounced, cancellation-safe live email-availability check. Only the
 * final settled input after the debounce window results in a network
 * request; an in-flight request is aborted the moment a newer one starts,
 * so a stale response can never overwrite a fresher one.
 */
export function useEmailAvailability(email: string, enabled: boolean): EmailAvailabilityStatus {
  const [status, setStatus] = useState<EmailAvailabilityStatus>('idle');
  const requestTokenRef = useRef(0);

  useEffect(() => {
    const trimmed = email.trim();

    if (!enabled || trimmed.length === 0) {
      setStatus('idle');
      return;
    }
    if (!isValidEmail(trimmed)) {
      setStatus('invalid');
      return;
    }

    const myToken = ++requestTokenRef.current;
    const controller = new AbortController();

    setStatus('checking');
    const timer = setTimeout(async () => {
      try {
        const result = await apiClient.checkEmailAvailability(trimmed, controller.signal);
        if (requestTokenRef.current !== myToken) return; // a newer request has since started — discard
        setStatus(result.available ? 'available' : 'taken');
      } catch {
        if (controller.signal.aborted) return; // superseded, not a real error
        if (requestTokenRef.current !== myToken) return;
        setStatus('error');
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [email, enabled]);

  return status;
}
