import React from 'react';
import clsx from 'clsx';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'text' | 'circular' | 'rectangular' | 'modal' | 'message';
  width?: string | number;
  height?: string | number;
}

export const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(
  ({ className, variant = 'text', width, height, ...props }, ref) => {
    const variantStyles = {
      text: 'rounded',
      circular: 'rounded-full',
      rectangular: 'rounded-sm',
      modal: 'rounded-lg',
      message: 'rounded-md',
    };

    return (
      <div
        ref={ref}
        className={clsx(
          'animate-pulse',
          variantStyles[variant],
          className
        )}
        style={{ width, height, backgroundColor: 'var(--bg-tertiary)' }}
        {...props}
      />
    );
  }
);

Skeleton.displayName = 'Skeleton';

// 预定义的骨架变体
export const ModalSkeleton: React.FC<SkeletonProps> = (props) => (
  <Skeleton variant="modal" width="100%" height="200px" {...props} />
);

export const MessageSkeleton: React.FC<SkeletonProps> = (props) => (
  <div className="space-y-2" {...props}>
    <Skeleton variant="text" width="60%" height={16} />
    <Skeleton variant="text" width="100%" height={16} />
    <Skeleton variant="text" width="80%" height={16} />
  </div>
);
