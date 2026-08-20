import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function Table({ className, children, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto border border-surface-outline rounded bg-surface-bright">
      <table className={twMerge(clsx('w-full text-left text-xs border-collapse', className))} {...props}>
        {children}
      </table>
    </div>
  );
}

export function TableHeader({ className, children, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead className={twMerge(clsx('bg-surface-container-low border-b-2 border-primary text-on-surface select-none', className))} {...props}>
      {children}
    </thead>
  );
}

export function TableRow({ className, children, isHeader, ...props }: React.HTMLAttributes<HTMLTableRowElement> & { isHeader?: boolean }) {
  return (
    <tr
      className={twMerge(
        clsx(
          'border-b border-surface-outline transition-colors',
          !isHeader && 'hover:bg-surface-container-low/80',
          className
        )
      )}
      {...props}
    >
      {children}
    </tr>
  );
}

export function TableHead({ className, children, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={twMerge(
        clsx('py-2.5 px-3.5 font-semibold text-[11px] uppercase tracking-wider text-on-surface-variant', className)
      )}
      {...props}
    >
      {children}
    </th>
  );
}

export function TableCell({ className, children, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={twMerge(clsx('py-3 px-3.5 text-on-surface align-middle', className))} {...props}>
      {children}
    </td>
  );
}
