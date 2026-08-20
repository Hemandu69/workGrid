import React, { forwardRef } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, helperText, leftIcon, rightIcon, id, ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className="w-full space-y-1">
        {label && (
          <label htmlFor={inputId} className="block text-xs font-semibold text-on-surface uppercase tracking-wider">
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {leftIcon && <div className="absolute left-3 text-on-surface-variant flex items-center pointer-events-none">{leftIcon}</div>}
          <input
            id={inputId}
            ref={ref}
            className={twMerge(
              clsx(
                'w-full bg-surface-bright border border-surface-outline rounded px-3 py-2 text-sm text-on-surface placeholder:text-outline focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all disabled:opacity-50 disabled:bg-surface-container-low',
                leftIcon && 'pl-9',
                rightIcon && 'pr-9',
                error && 'border-status-blocked focus:border-status-blocked focus:ring-status-blocked',
                className
              )
            )}
            {...props}
          />
          {rightIcon && <div className="absolute right-3 text-on-surface-variant flex items-center">{rightIcon}</div>}
        </div>
        {error && <p className="text-xs text-status-blocked font-medium">{error}</p>}
        {helperText && !error && <p className="text-xs text-on-surface-variant">{helperText}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';
