import React from 'react';

export interface EmptyStateProps {
  /** Material Symbols icon name, e.g. "task", "inbox", "search_off". */
  icon?: string;
  message: string;
  action?: React.ReactNode;
}

/** Standard "nothing here yet" block — matches the empty-state look already used ad hoc across task/people tables, extracted here for reuse. */
export function EmptyState({ icon = 'inbox', message, action }: EmptyStateProps) {
  return (
    <div className="p-8 text-center border border-surface-outline rounded bg-surface-bright">
      <span className="material-symbols-outlined text-[32px] text-on-surface-variant mb-2">{icon}</span>
      <p className="text-xs text-on-surface-variant font-medium">{message}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
