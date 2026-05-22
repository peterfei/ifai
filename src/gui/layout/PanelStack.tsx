/**
 * PanelStack — 垂直面板堆叠组件
 *
 * 批量生成面板 + 分隔线，用于右栏多面板并列布局
 * 支持折叠/展开、拖拽分隔线调整高度
 */

import React, { useState, useRef, useCallback } from 'react';
import type { PanelConfig } from './types';

interface PanelStackProps {
  panels: PanelConfig[];
}

/** 单个面板的运行时状态 */
interface PanelState {
  size: number;
  collapsed: boolean;
}

export function PanelStack({ panels }: PanelStackProps) {
  // 初始化每个面板的状态
  const [panelStates, setPanelStates] = useState<Record<string, PanelState>>(() => {
    const initial: Record<string, PanelState> = {};
    for (const p of panels) {
      initial[p.id] = {
        size: p.defaultSize,
        collapsed: false,
      };
    }
    return initial;
  });

  const draggingRef = useRef<{ index: number; startY: number; startSizes: number[] } | null>(null);

  const toggleCollapse = useCallback((id: string) => {
    setPanelStates(prev => ({
      ...prev,
      [id]: {
        ...prev[id],
        collapsed: !prev[id].collapsed,
      },
    }));
  }, []);

  const handleDividerMouseDown = useCallback((index: number, e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startSizes = panels.map(p => panelStates[p.id]?.size ?? p.defaultSize);
    draggingRef.current = { index, startY, startSizes };

    const handleMouseMove = (ev: MouseEvent) => {
      if (!draggingRef.current) return;
      const delta = ev.clientY - draggingRef.current.startY;
      const idx = draggingRef.current.index;

      setPanelStates(prev => {
        const abovePanel = panels[idx];
        const belowPanel = panels[idx + 1];
        if (!abovePanel || !belowPanel) return prev;

        const aboveMin = abovePanel.minSize ?? 40;
        const belowMin = belowPanel.minSize ?? 40;
        const aboveCurrent = draggingRef.current!.startSizes[idx];
        const belowCurrent = draggingRef.current!.startSizes[idx + 1];

        let newAbove = aboveCurrent + delta;
        let newBelow = belowCurrent - delta;

        // 限制最小尺寸
        if (newAbove < aboveMin) {
          newBelow -= (aboveMin - newAbove);
          newAbove = aboveMin;
        }
        if (newBelow < belowMin) {
          newAbove -= (belowMin - newBelow);
          newBelow = belowMin;
        }

        return {
          ...prev,
          [abovePanel.id]: { ...prev[abovePanel.id], size: Math.max(aboveMin, newAbove) },
          [belowPanel.id]: { ...prev[belowPanel.id], size: Math.max(belowMin, newBelow) },
        };
      });
    };

    const handleMouseUp = () => {
      draggingRef.current = null;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
  }, [panels, panelStates]);

  return (
    <div
      data-testid="panel-stack"
      style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}
    >
      {panels.map((panel, index) => {
        const state = panelStates[panel.id];
        const collapsed = state?.collapsed ?? false;
        const size = state?.size ?? panel.defaultSize;
        const minSize = panel.minSize ?? 40;
        const collapsible = panel.collapsible ?? true;
        const PanelComponent = panel.component;

        return (
          <React.Fragment key={panel.id}>
            {/* 面板项 */}
            <div
              data-testid={`panel-item-${panel.id}`}
              style={{
                height: collapsed ? 'auto' : `${size}px`,
                minHeight: collapsed ? undefined : `${minSize}px`,
                overflow: 'hidden',
                position: 'relative',
                flexShrink: 0,
              }}
            >
              {/* 标题栏 */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  height: '32px',
                  padding: '0 8px',
                  background: '#1E1E1E',
                  borderBottom: collapsed ? undefined : '1px solid #2D2D2D',
                  flexShrink: 0,
                }}
              >
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#eef2f6' }}>
                  {panel.title}
                </span>
                {collapsible && (
                  <button
                    aria-label={collapsed ? `展开面板 ${panel.title}` : `折叠面板 ${panel.title}`}
                    onClick={() => toggleCollapse(panel.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#9aa6b4',
                      cursor: 'pointer',
                      fontSize: '12px',
                      padding: '2px 4px',
                      lineHeight: 1,
                    }}
                  >
                    {collapsed ? '▶' : '▼'}
                  </button>
                )}
              </div>

              {/* 面板内容 */}
              {!collapsed && <PanelComponent title={panel.title} />}
            </div>

            {/* 分隔线（最后一个面板之后不加） */}
            {index < panels.length - 1 && (
              <div
                data-testid={`panel-divider-${index}`}
                onMouseDown={(e) => handleDividerMouseDown(index, e)}
                style={{
                  height: '4px',
                  cursor: 'ns-resize',
                  background: '#2D2D2D',
                  flexShrink: 0,
                  transition: 'background 0.2s',
                }}
                onMouseEnter={(e) => {
                  (e.target as HTMLElement).style.background = '#4b89ff';
                }}
                onMouseLeave={(e) => {
                  (e.target as HTMLElement).style.background = '#2D2D2D';
                }}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
