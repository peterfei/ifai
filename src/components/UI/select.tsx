import React from 'react';
import clsx from 'clsx';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={clsx(
        'theme-input-surface theme-select-input theme-border theme-text theme-focus-accent flex h-8 w-full items-center justify-between rounded-[var(--radius-sm)] border px-2.5 py-1.5 text-[13px] leading-5 disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    >
      {children}
    </select>
  )
);

Select.displayName = 'Select';
