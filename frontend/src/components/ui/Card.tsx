import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  indicatorColor?: 'primary' | 'available' | 'busy' | 'blocked' | 'secondary';
  padded?: boolean;
}

export function Card({
  className,
  indicatorColor,
  padded = true,
  children,
  ...props
}: CardProps) {
  const indicatorStyles = {
    primary: 'before:absolute before:top-0 before:left-0 before:w-full before:h-[3px] before:bg-primary',
    available: 'before:absolute before:top-0 before:left-0 before:w-full before:h-[3px] before:bg-status-available',
    busy: 'before:absolute before:top-0 before:left-0 before:w-full before:h-[3px] before:bg-status-busy',
    blocked: 'before:absolute before:top-0 before:left-0 before:w-full before:h-[3px] before:bg-status-blocked',
    secondary: 'before:absolute before:top-0 before:left-0 before:w-full before:h-[3px] before:bg-secondary-container',
  };

  return (
    <div
      className={twMerge(
        clsx(
          'bg-surface-bright border border-surface-outline rounded relative overflow-hidden transition-all',
          indicatorColor && indicatorStyles[indicatorColor],
          padded && 'p-5',
          className
        )
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={twMerge(clsx('flex items-center justify-between pb-3 mb-4 border-b border-surface-outline', className))} {...props}>
      {children}
    </div>
  );
}

export function CardTitle({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={twMerge(clsx('text-sm font-semibold text-on-surface tracking-tight', className))} {...props}>
      {children}
    </h3>
  );
}
