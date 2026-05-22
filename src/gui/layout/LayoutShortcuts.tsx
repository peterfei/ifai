/**
 * LayoutShortcuts — Cmd+1/2/3 切换 GUI 布局模式
 *
 * 查表驱动：KEY_TO_MODE 映射按键到布局模式
 * 输入框/文本域中不拦截，避免影响正常编辑
 */

import { useEffect } from 'react';
import { useLayoutStore } from '../../stores/layoutStore';
import type { GuiLayoutMode } from '../../stores/layoutStore';

/** 按键 → 布局模式查表 */
const KEY_TO_MODE: Record<string, GuiLayoutMode> = {
  '1': 'conversation',
  '2': 'editor',
  '3': 'split',
};

export function useLayoutShortcuts() {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // 输入框/文本域中不拦截
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      // 需要 Cmd (Mac) 或 Ctrl (Windows/Linux)
      if (!(e.metaKey || e.ctrlKey)) return;

      const mode = KEY_TO_MODE[e.key];
      if (!mode) return;

      e.preventDefault();
      useLayoutStore.getState().setGuiMode(mode);
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}

/** 纯逻辑组件，无 UI */
export function LayoutShortcuts() {
  useLayoutShortcuts();
  return null;
}
