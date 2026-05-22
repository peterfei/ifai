import React from 'react';
import { TabBar } from '../../components/Editor/TabBar';
import { SplitPaneContainer } from '../../components/Layout/SplitPaneContainer';
import { Statusbar } from '../../components/Layout/Statusbar';

export function EditorPanel() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', background: '#1e1e1e' }}>
      <TabBar />
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <SplitPaneContainer className="split-pane-container" />
      </div>
      <Statusbar />
    </div>
  );
}
