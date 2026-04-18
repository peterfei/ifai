import React from 'react';
import clsx from 'clsx';

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'outline' | 'success' | 'warning' | 'error' | 'secondary';
}

export const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant = 'default', ...props }, ref) => {
    const baseStyles = 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border';

    const variantStyles = {
      default: 'theme-badge-accent',
      outline: 'theme-panel theme-border theme-text-muted',
      success: 'theme-badge-success',
      warning: 'theme-badge-warning',
      error: 'theme-badge-danger',
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
