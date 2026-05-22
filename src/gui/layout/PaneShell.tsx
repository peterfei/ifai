import React from 'react';

interface PaneShellProps {
  children?: React.ReactNode;
  width?: number;
  flex?: number;
  'data-testid'?: string;
}

export function PaneShell({ children, width, flex, 'data-testid': testId }: PaneShellProps) {
  const style: React.CSSProperties = {};
  if (width !== undefined) style.width = `${width}px`;
  if (flex !== undefined) style.flex = String(flex);

  return (
    <div data-testid={testId} style={style}>
      {children ?? <div>Empty Pane</div>}
    </div>
  );
}
