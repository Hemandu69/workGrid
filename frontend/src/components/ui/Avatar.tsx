/* eslint-disable @next/next/no-img-element */
import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  src?: string;
  name?: string;
  size?: 'sm' | 'md' | 'lg';
  status?: 'ONLINE' | 'BUSY' | 'OFFLINE' | 'AWAY';
}

export function Avatar({
  src,
  name,
  size = 'md',
  status,
  className,
  ...props
}: AvatarProps) {
  const sizeClasses = {
    sm: 'w-6 h-6 text-[10px]',
    md: 'w-8 h-8 text-xs',
    lg: 'w-10 h-10 text-sm',
  };

  const statusColors = {
    ONLINE: 'bg-status-available',
    BUSY: 'bg-status-busy',
    OFFLINE: 'bg-slate-400',
    AWAY: 'bg-amber-400',
  };

  const getInitials = (n?: string) => {
    if (!n) return '?';
    return n
      .split(' ')
      .map((part) => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="relative inline-flex shrink-0">
      <div
        className={twMerge(
          clsx(
            'rounded bg-surface-container text-primary font-semibold flex items-center justify-center border border-surface-outline overflow-hidden select-none',
            sizeClasses[size],
            className
          )
        )}
        {...props}
      >
        {src ? (
          <img src={src} alt={name || 'Avatar'} className="w-full h-full object-cover" />
        ) : (
          <span>{getInitials(name)}</span>
        )}
      </div>
      {status && (
        <span
          className={clsx(
            'absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-surface-bright',
            statusColors[status]
          )}
        />
      )}
    </div>
  );
}
