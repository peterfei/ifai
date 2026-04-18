import React from 'react';
import clsx from 'clsx';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'ghost' | 'outline';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    const baseStyles = 'theme-focus-ring-accent inline-flex items-center justify-center rounded-[var(--radius-sm)] border text-[13px] font-medium leading-none theme-hoverable disabled:pointer-events-none disabled:opacity-50';

    const variantStyles = {
      default: 'theme-button-primary',
      ghost: 'theme-button-ghost',
      outline: 'theme-button-secondary',
    };

    const sizeStyles = {
      default: 'h-8 px-3',
      sm: 'h-7 px-2.5 text-[11px]',
      lg: 'h-9 px-4',
      icon: 'h-8 w-8',
    };

    return (
      <button
        ref={ref}
        className={clsx(baseStyles, variantStyles[variant], sizeStyles[size], className)}
        {...props}
      />
    );
  }
);

Button.displayName = 'Button';
