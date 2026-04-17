import React from 'react';
import clsx from 'clsx';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'ghost' | 'outline';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    const baseStyles = 'inline-flex items-center justify-center rounded-md font-medium theme-hoverable focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:opacity-50 disabled:pointer-events-none';

    const variantStyles = {
      default: 'theme-button-primary',
      ghost: 'theme-button-ghost',
      outline: 'theme-button-secondary',
    };

    const sizeStyles = {
      default: 'h-10 px-4 py-2',
      sm: 'h-9 px-3 text-xs',
      lg: 'h-11 px-8',
      icon: 'h-10 w-10',
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
