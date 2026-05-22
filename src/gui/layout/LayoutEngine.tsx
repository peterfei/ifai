import React from 'react';
import type { GuiLayoutMode } from '../../stores/layoutStore';
import { layoutRegistry } from './layout-registry';
import { PaneShell } from './PaneShell';

interface LayoutEngineProps {
  mode: GuiLayoutMode;
  paneRenderer: (paneId: string) => React.ReactNode;
}

export function LayoutEngine({ mode, paneRenderer }: LayoutEngineProps) {
  const descriptor = layoutRegistry.get(mode);

  if (!descriptor) {
    return (
      <div data-testid="layout-engine">
        <div>Unknown layout: {mode}</div>
      </div>
    );
  }

  return (
    <div data-testid="layout-engine" style={{ display: 'flex', width: '100%', height: '100%' }}>
      {descriptor.panes.map((pane) => (
        <PaneShell key={pane.id} width={pane.width} flex={pane.flex}>
          <div data-pane-id={pane.id} style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {paneRenderer(pane.id)}
          </div>
        </PaneShell>
      ))}
    </div>
  );
}
