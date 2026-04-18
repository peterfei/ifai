import React from 'react';
import clsx from 'clsx';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        ref={ref}
        className={clsx(
          'theme-input-surface theme-border theme-text theme-focus-accent flex h-8 w-full rounded-[var(--radius-sm)] border px-2.5 py-1.5 text-[13px] leading-5 file:border-0 file:bg-transparent file:text-[13px] file:font-medium disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        {...props}
      />
    );
  }
);

Input.displayName = 'Input';
