import React from 'react';
import { PaneView } from './PaneView';
import { PaneResizer } from './PaneResizer';
import { useLayoutStore, Pane } from '../../stores/layoutStore';

interface SplitPaneContainerProps {
  className?: string;
}

export const SplitPaneContainer: React.FC<SplitPaneContainerProps> = ({ className = '' }) => {
  const { panes, splitDirection, activePaneId } = useLayoutStore();

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    width: '100%',
    height: '100%',
    flexDirection: splitDirection === 'horizontal' ? 'row' : 'column',
  };

  const handleResize = (paneId: string, delta: number) => {
    const pane = panes.find(p => p.id === paneId);
    if (!pane) return;

    const currentSize = pane.size;
    const newSize = currentSize + delta;

    useLayoutStore.getState().resizePane(paneId, newSize);
  };

  const handlePaneClick = (paneId: string) => {
    useLayoutStore.getState().setActivePane(paneId);
  };

  return (
    <div className={className} style={containerStyle}>
      {panes.map((pane, index) => (
        <React.Fragment key={pane.id}>
          <PaneView
            pane={pane}
            isActive={pane.id === activePaneId}
            splitDirection={splitDirection}
            onResize={handleResize}
            onClick={() => handlePaneClick(pane.id)}
            index={index}
          />

          {/* 在窗格之间添加分割线（最后一个窗格之后不添加） */}
          {index < panes.length - 1 && (
            <PaneResizer
              direction={splitDirection}
              paneId={pane.id}
              onResize={(id, delta) => {
                handleResize(id, delta);
              }}
            />
          )}
        </React.Fragment>
      ))}
    </div>
  );
};
