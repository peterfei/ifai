import React from 'react';
import clsx from 'clsx';

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'outline' | 'success' | 'warning' | 'error' | 'secondary';
}

export const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant = 'default', ...props }, ref) => {
    const baseStyles = 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border';

    const variantStyles = {
      default: 'border-blue-500/20 bg-blue-500/12 text-blue-500',
      outline: 'theme-panel theme-border theme-text-muted',
      success: 'border-emerald-500/20 bg-emerald-500/12 text-emerald-500',
      warning: 'border-amber-500/20 bg-amber-500/12 text-amber-500',
      error: 'border-red-500/20 bg-red-500/12 text-red-500',
      secondary: 'theme-panel-muted theme-border theme-text-muted',
    };

    return (
      <div
        ref={ref}
        className={clsx(baseStyles, variantStyles[variant], className)}
        {...props}
      />
    );
  }
);

Badge.displayName = 'Badge';
