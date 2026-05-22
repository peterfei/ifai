/**
 * PaneCollapseToggle — conversation 模式左栏/右栏折叠触发按钮
 *
 * 点击后 toggle layoutStore 中对应栏的 collapsed 状态。
 * 仅在 conversation 模式下渲染。
 */

import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useLayoutStore } from '../../stores/layoutStore';

interface PaneCollapseToggleProps {
  side: 'left' | 'right';
}

/** 查表：方向 → 折叠/展开的标签和图标 */
const COLLAPSE_CONFIG = {
  left: {
    collapseLabel: '收起左栏',
    expandLabel: '展开左栏',
    CollapseIcon: ChevronLeft,
    ExpandIcon: ChevronRight,
  },
  right: {
    collapseLabel: '收起右栏',
    expandLabel: '展开右栏',
    CollapseIcon: ChevronRight,
    ExpandIcon: ChevronLeft,
  },
} as const;

export function PaneCollapseToggle({ side }: PaneCollapseToggleProps) {
  const guiMode = useLayoutStore((s) => s.guiMode);
  const collapsed = useLayoutStore((s) =>
    side === 'left' ? s.conversationLeftCollapsed : s.conversationRightCollapsed,
  );
  const toggle = useLayoutStore((s) => s.toggleConversationPaneCollapse);

  if (guiMode !== 'conversation') return null;

  const config = COLLAPSE_CONFIG[side];
  const label = collapsed ? config.expandLabel : config.collapseLabel;
  const Icon = collapsed ? config.ExpandIcon : config.CollapseIcon;

  return (
    <button
      data-testid={`pane-collapse-${side}`}
      aria-label={label}
      onClick={() => toggle(side)}
      style={{
        width: 24,
        height: 24,
        borderRadius: 4,
        border: 'none',
        background: 'rgba(255,255,255,0.05)',
        color: '#9CA3AF',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'background 0.2s',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.1)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)';
      }}
    >
      <Icon size={14} />
    </button>
  );
}
