import React from 'react';
import { Button } from './Button';

export interface ErrorStateProps {
  /** Plain-language message only — never a raw backend/Prisma/stack-trace string. */
  message: string;
  onRetry?: () => void;
  isRetrying?: boolean;
}

/** Standard inline error block with an optional retry — matches the rose error-banner styling already used across forms (registration, announcements). */
export function ErrorState({ message, onRetry, isRetrying = false }: ErrorStateProps) {
  return (
    <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded flex items-center justify-between gap-3">
      <span className="flex items-center gap-1.5">
        <span className="material-symbols-outlined text-[16px]">error</span>
        {message}
      </span>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} isLoading={isRetrying} className="shrink-0">
          Retry
        </Button>
      )}
    </div>
  );
}
