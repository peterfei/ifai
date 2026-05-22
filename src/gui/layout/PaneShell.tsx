import React from 'react';

interface PaneShellProps {
  children?: React.ReactNode;
  width?: number | string;
  flex?: number;
  'data-testid'?: string;
}

export function PaneShell({ children, width, flex, 'data-testid': testId }: PaneShellProps) {
  const style: React.CSSProperties = {
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    position: 'relative',
    transition: 'flex 300ms cubic-bezier(0.4, 0, 0.2, 1)',
  };
  if (width !== undefined) {
    if (typeof width === 'number') {
      style.width = `${width}px`;
      style.flexShrink = 0;
    } else {
      style.width = width;
      if (width === 'auto') {
        style.flex = '1';
      } else {
        style.flexShrink = 0;
      }
    }
  }
  if (flex !== undefined) style.flex = String(flex);

  return (
    <div data-testid={testId} style={style}>
      {children ?? <div>Empty Pane</div>}
    </div>
  );
}
