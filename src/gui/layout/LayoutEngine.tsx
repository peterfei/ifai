import React, { useCallback } from 'react';
import type { GuiLayoutMode } from '../../stores/layoutStore';
import { useLayoutStore } from '../../stores/layoutStore';
import { layoutRegistry } from './layout-registry';
import { PaneShell } from './PaneShell';
import { PaneCollapseToggle } from './PaneCollapseToggle';

interface LayoutEngineProps {
  mode: GuiLayoutMode;
  paneRenderer: (paneId: string) => React.ReactNode;
}

/** conversation 三栏的水平拖拽分隔线 */
function HorizontalDivider({
  side,
  onResizeStart,
}: {
  /** 'left' 拖拽左分隔线，'right' 拖拽右分隔线 */
  side: 'left' | 'right';
  onResizeStart: (side: 'left' | 'right', e: React.MouseEvent) => void;
}) {
  return (
    <div
      data-testid="pane-resizer"
      onMouseDown={(e) => onResizeStart(side, e)}
      style={{
        width: 6,
        cursor: 'ew-resize',
        background: '#2D2D2D',
        flexShrink: 0,
        transition: 'background 0.2s',
        position: 'relative',
        zIndex: 10,
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.background = '#4b89ff';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = '#2D2D2D';
      }}
    >
      {/* 视觉指示线 */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 2,
          height: 32,
          background: '#6B7280',
          opacity: 0.6,
          borderRadius: 1,
        }}
      />
    </div>
  );
}

export function LayoutEngine({ mode, paneRenderer }: LayoutEngineProps) {
  const descriptor = layoutRegistry.get(mode);
  const conversationLeftWidth = useLayoutStore((s) => s.conversationLeftWidth);
  const conversationRightWidth = useLayoutStore((s) => s.conversationRightWidth);
  const conversationLeftCollapsed = useLayoutStore((s) => s.conversationLeftCollapsed);
  const conversationRightCollapsed = useLayoutStore((s) => s.conversationRightCollapsed);
  const setConversationPaneWidth = useLayoutStore((s) => s.setConversationPaneWidth);

  if (!descriptor) {
    return (
      <div data-testid="layout-engine">
        <div>Unknown layout: {mode}</div>
      </div>
    );
  }

  const isConversation = mode === 'conversation';

  // 拖拽开始：记录起始位置和宽度
  const handleResizeStart = useCallback(
    (side: 'left' | 'right', e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startLeft = conversationLeftWidth;
      const startRight = conversationRightWidth;

      const handleMouseMove = (ev: MouseEvent) => {
        const delta = ev.clientX - startX;
        if (side === 'left') {
          // 拖左分隔线：左栏宽度随鼠标移动
          setConversationPaneWidth('left', startLeft + delta);
        } else {
          // 拖右分隔线：右栏宽度反向跟随鼠标
          setConversationPaneWidth('right', startRight - delta);
        }
      };

      const handleMouseUp = () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';
    },
    [conversationLeftWidth, conversationRightWidth, setConversationPaneWidth],
  );

  // conversation 三栏宽度：按索引映射，不依赖 pane ID
  // index 0 → 左栏 (conversationLeftWidth)
  // index 1 → 中栏 (flex, 不设固定宽度)
  // index 2 → 右栏 (conversationRightWidth)
  const convWidths = isConversation
    ? [conversationLeftWidth, undefined, conversationRightWidth]
    : [];

  // 折叠映射表: pane index → collapsed
  const collapsedMap = isConversation
    ? { 0: conversationLeftCollapsed, 2: conversationRightCollapsed }
    : {};

  return (
    <div data-testid="layout-engine" style={{ display: 'flex', flexDirection: 'column', width: '100%', flex: '1 1 0%', minHeight: 0, transition: 'opacity 150ms ease' }}>
      <div style={{ display: 'flex', flex: '1 1 0%', minHeight: 0 }}>
        {descriptor.panes.map((pane, index) => {
          const isCollapsed = collapsedMap[index as keyof typeof collapsedMap] === true;
          // conversation 模式：用索引取覆盖宽度；折叠时 width=0
          const width = isCollapsed ? 0 : (isConversation ? (convWidths[index] ?? pane.width) : pane.width);
          const flex = isCollapsed ? 0 : pane.flex;

          // conversation 三栏：index 0 的分隔线控制左栏，index 1 的控制右栏
          const dividerSide = index === 0 ? 'left' : 'right';
          // 折叠面板旁的分隔线和相邻面板的分隔线都不渲染
          const nextCollapsed = collapsedMap[(index + 1) as keyof typeof collapsedMap] === true;
          const showDivider = isConversation && index < descriptor.panes.length - 1 && !isCollapsed && !nextCollapsed;

          return (
            <React.Fragment key={pane.id}>
              {isCollapsed ? (
                /* 折叠态：脱离 PaneShell，使用固定最小宽度保证展开按钮可见 */
                <div
                  style={{
                    width: 24,
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                    zIndex: 20,
                  }}
                >
                  <PaneCollapseToggle side={index === 0 ? 'left' : 'right'} />
                </div>
              ) : (
                <PaneShell width={width} flex={flex}>
                  <div data-pane-id={pane.id} style={{ display: 'flex', flexDirection: 'column', flex: '1 1 0%', minHeight: 0, position: 'relative' }}>
                    {paneRenderer(pane.id)}
                    {/* conversation 模式面板内嵌折叠按钮 */}
                    {isConversation && (index === 0 || index === 2) && (
                      <div style={{ position: 'absolute', top: 8, [index === 0 ? 'right' : 'left']: 4, zIndex: 20 }}>
                        <PaneCollapseToggle side={index === 0 ? 'left' : 'right'} />
                      </div>
                    )}
                  </div>
                </PaneShell>
              )}

              {showDivider && (
                <HorizontalDivider
                  side={dividerSide as 'left' | 'right'}
                  onResizeStart={handleResizeStart}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
