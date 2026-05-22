import React from 'react';
import { MessageSquare, Code2, Columns2 } from 'lucide-react';
import { useLayoutStore } from '../../stores/layoutStore';
import type { GuiLayoutMode } from '../../stores/layoutStore';
import clsx from 'clsx';

const modes: Array<{ key: GuiLayoutMode; label: string; icon: React.ReactNode; testId: string }> = [
  { key: 'conversation', label: '对话', icon: <MessageSquare size={14} />, testId: 'gui-mode-conversation' },
  { key: 'editor', label: '编辑器', icon: <Code2 size={14} />, testId: 'gui-mode-editor' },
  { key: 'split', label: '分屏', icon: <Columns2 size={14} />, testId: 'gui-mode-split' },
];

export function GuiLayoutSwitcher() {
  const guiMode = useLayoutStore((s) => s.guiMode);
  const setGuiMode = useLayoutStore((s) => s.setGuiMode);

  return (
    <div
      data-testid="gui-layout-switcher"
      className="flex items-center bg-[#1e1e1e]/80 backdrop-blur-md p-1 rounded-full border border-gray-700/50 shadow-inner"
    >
      {modes.map(({ key, label, icon, testId }) => (
        <button
          key={key}
          data-testid={testId}
          aria-pressed={guiMode === key}
          onClick={() => setGuiMode(key)}
          className={clsx(
            'relative flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all duration-300',
            guiMode === key
              ? 'text-white bg-blue-600/80 shadow-[0_0_10px_rgba(59,130,246,0.3)]'
              : 'text-gray-500 hover:text-gray-300'
          )}
        >
          {icon}
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}
