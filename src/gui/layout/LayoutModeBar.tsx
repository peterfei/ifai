/**
 * LayoutModeBar — conversation 模式底部的模式切换栏
 *
 * DSL 查表驱动，零 if-else：
 * MODE_SWITCHES[guiMode] → 要显示的切换按钮数组
 */

import React from 'react';
import { Code2, Columns2, MessageSquare } from 'lucide-react';
import { useLayoutStore } from '../../stores/layoutStore';
import type { GuiLayoutMode } from '../../stores/layoutStore';

interface ModeSwitch {
  target: GuiLayoutMode;
  label: string;
  icon: React.ReactNode;
}

/** DSL: 各模式下显示的切换按钮 */
const MODE_SWITCHES: Record<GuiLayoutMode, ModeSwitch[]> = {
  conversation: [
    { target: 'editor', label: '编辑器', icon: <Code2 size={12} /> },
    { target: 'split', label: '分屏', icon: <Columns2 size={12} /> },
  ],
  editor: [],
  split: [],
};

export function LayoutModeBar() {
  const guiMode = useLayoutStore((s) => s.guiMode);
  const setGuiMode = useLayoutStore((s) => s.setGuiMode);
  const switches = MODE_SWITCHES[guiMode];

  if (!switches || switches.length === 0) return null;

  return (
    <div
      data-testid="layout-mode-bar"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: '4px 0',
        borderTop: '1px solid rgba(255,255,255,0.05)',
        background: 'rgba(0,0,0,0.2)',
      }}
    >
      {switches.map(({ target, label, icon }) => (
        <button
          key={target}
          data-testid={`layout-mode-switch-${target}`}
          onClick={() => setGuiMode(target)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '4px 12px',
            borderRadius: 6,
            border: '1px solid rgba(255,255,255,0.1)',
            background: 'rgba(255,255,255,0.03)',
            color: '#9CA3AF',
            fontSize: 12,
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)';
            (e.currentTarget as HTMLElement).style.color = '#E5E7EB';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)';
            (e.currentTarget as HTMLElement).style.color = '#9CA3AF';
          }}
        >
          {icon}
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}
