import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export function Button({
  className,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  leftIcon,
  rightIcon,
  children,
  disabled,
  ...props
}: ButtonProps) {
  const baseStyles =
    'inline-flex items-center justify-center font-medium rounded transition-all focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed select-none';

  const variants = {
    primary: 'bg-primary text-on-primary hover:bg-primary-container active:bg-primary border border-transparent shadow-sm',
    secondary: 'bg-secondary-container text-on-secondary-container hover:bg-secondary-fixed active:bg-secondary-container border border-transparent',
    outline: 'bg-surface-bright text-on-surface hover:bg-surface-container border border-surface-outline active:bg-surface-container-high',
    ghost: 'bg-transparent text-on-surface-variant hover:bg-surface-container hover:text-on-surface border border-transparent',
    danger: 'bg-status-blocked text-white hover:bg-red-700 active:bg-red-800 border border-transparent',
  };

  const sizes = {
    sm: 'text-xs px-2.5 py-1 gap-1.5 h-[28px]',
    md: 'text-xs px-3.5 py-1.5 gap-2 h-[36px]',
    lg: 'text-sm px-4 py-2 gap-2.5 h-[44px]',
  };

  return (
    <button
      className={twMerge(clsx(baseStyles, variants[variant], sizes[size], className))}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : (
        leftIcon
      )}
      <span>{children}</span>
      {!isLoading && rightIcon}
    </button>
  );
}
