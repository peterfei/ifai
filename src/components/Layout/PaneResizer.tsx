import React, { useState, useRef, useEffect } from 'react';

interface PaneResizerProps {
  direction: 'horizontal' | 'vertical';
  onResize: (paneId: string, delta: number) => void;
  paneId?: string;
  className?: string;
}

export const PaneResizer: React.FC<PaneResizerProps> = ({
  direction,
  onResize,
  paneId,
  className = '',
}) => {
  const [isResizing, setIsResizing] = useState(false);
  const resizerRef = useRef<HTMLDivElement>(null);
  const startPosRef = useRef({ x: 0, y: 0 });
  const startSizeRef = useRef({ width: 0, height: 0 });

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setIsResizing(true);
    startPosRef.current = { x: e.clientX, y: e.clientY };
    startSizeRef.current = {
      width: e.currentTarget.parentElement?.getBoundingClientRect().width || 0,
      height: e.currentTarget.parentElement?.getBoundingClientRect().height || 0,
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = direction === 'horizontal' ? 'ew-resize' : 'ns-resize';
    document.body.style.userSelect = 'none';
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isResizing) return;

    const deltaX = e.clientX - startPosRef.current.x;
    const deltaY = e.clientY - startPosRef.current.y;

    if (direction === 'horizontal') {
      const deltaPercent = (deltaX / startSizeRef.current.width) * 100;
      if (paneId) onResize(paneId, deltaPercent);
    } else {
      const deltaPercent = (deltaY / startSizeRef.current.height) * 100;
      if (paneId) onResize(paneId, deltaPercent);
    }
  };

  const handleMouseUp = () => {
    setIsResizing(false);
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'default';
    document.body.style.userSelect = 'auto';
  };

  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
    };
  }, []);

  const baseClasses = direction === 'horizontal'
    ? 'w-1 cursor-ew-resize hover:bg-blue-500'
    : 'h-1 cursor-ns-resize hover:bg-blue-500';

  const positionClasses = direction === 'horizontal'
    ? 'absolute top-0 bottom-0 right-0 -mr-0.5 z-10'
    : 'absolute left-0 right-0 bottom-0 -mb-0.5 z-10';

  return (
    <div
      ref={resizerRef}
      className={`
        ${baseClasses}
        ${positionClasses}
        transition-colors duration-200
        ${isResizing ? 'bg-blue-500' : 'bg-gray-600'}
        hover:brightness-125
        ${className}
      `}
      onMouseDown={handleMouseDown}
      style={{
        opacity: isResizing ? 1 : 0.3,
      }}
    >
      {/* 拖拽手柄的视觉指示器 */}
      <div className="absolute inset-0 flex items-center justify-center">
        {direction === 'horizontal' ? (
          <div className="w-px h-8 bg-gray-400 opacity-50" />
        ) : (
          <div className="h-px w-8 bg-gray-400 opacity-50" />
        )}
      </div>
    </div>
  );
};
