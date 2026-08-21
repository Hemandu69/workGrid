'use client';

import React, { useState } from 'react';
import { apiClient, ApiError, AvailabilityState } from '../../lib/api-client';

const OPTIONS: Array<{ value: AvailabilityState; label: string; activeClass: string }> = [
  { value: 'FREE', label: 'FREE', activeClass: 'bg-emerald-600 text-white border-emerald-700' },
  { value: 'BUSY', label: 'BUSY', activeClass: 'bg-amber-600 text-white border-amber-700' },
  { value: 'PARTIALLY_AVAILABLE', label: 'PARTIAL', activeClass: 'bg-blue-600 text-white border-blue-700' },
];

interface AvailabilityStatusControlProps {
  /** Current authoritative state, from the server. Never local-only. */
  current: AvailabilityState | undefined;
  /** Omit to change your own availability. */
  personId?: string;
  /** Presence dominates — the control is inert while the person is not IN. */
  disabled?: boolean;
  disabledHint?: string;
  onChanged?: () => void;
}

/**
 * Compact segmented control that writes availability to the backend. The
 * displayed state always comes from the authoritative `current` prop, which is
 * refreshed by the AVAILABILITY_CHANGED domain event — this component never
 * fakes the update with local state.
 */
export function AvailabilityStatusControl({
  current,
  personId,
  disabled = false,
  disabledHint,
  onChanged,
}: AvailabilityStatusControlProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSelect = async (state: AvailabilityState) => {
    if (isSaving || disabled || state === current) return;
    setIsSaving(true);
    setError(null);
    try {
      await apiClient.setAvailabilityStatus(state, personId);
      onChanged?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update availability.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1" title={disabled ? disabledHint : undefined}>
        {OPTIONS.map((opt) => {
          const isActive = current === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              disabled={isSaving || disabled}
              onClick={() => handleSelect(opt.value)}
              className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-all border disabled:opacity-50 disabled:cursor-not-allowed ${
                isActive
                  ? `${opt.activeClass} shadow-xs`
                  : 'bg-surface-bright text-on-surface-variant border-surface-outline hover:bg-surface-container'
              }`}
              title={`Set availability to ${opt.label}`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {error && <span className="text-[10px] text-status-blocked font-medium">{error}</span>}
    </div>
  );
}
