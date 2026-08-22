import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** CSS width, e.g. "100%" or "8rem". Defaults to full width of the parent. */
  width?: string;
  /** CSS height, e.g. "1rem". Defaults to a single text-line height. */
  height?: string;
}

/** A single loading placeholder block — reuse for any "content not loaded yet" state instead of a bespoke per-page skeleton. */
export function Skeleton({ className, width, height = '1rem', style, ...props }: SkeletonProps) {
  return (
    <div
      className={twMerge(clsx('animate-pulse bg-surface-container-low rounded', className))}
      style={{ width, height, ...style }}
      {...props}
    />
  );
}
