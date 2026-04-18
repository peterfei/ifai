import React from 'react';
import clsx from 'clsx';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={clsx(
        'theme-input-surface theme-border theme-text theme-focus-accent flex min-h-[88px] w-full rounded-[var(--radius-sm)] border px-2.5 py-2 text-[13px] leading-5 disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
  )
);

Textarea.displayName = 'Textarea';
