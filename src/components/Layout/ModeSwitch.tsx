import React from 'react';
import { Zap, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLayoutStore } from '../../stores/layoutStore';
import clsx from 'clsx';

const activeModeClass = 'theme-selection-accent border border-[var(--accent-soft-border)] text-[var(--accent-color)] shadow-sm';

export const ModeSwitch: React.FC = () => {
  const { t } = useTranslation();
  const { editorMode, setEditorMode } = useLayoutStore();
  const buttonClass = 'theme-focus-ring-accent theme-soft-hover flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-semibold tracking-[0.08em] uppercase transition-all duration-200';

  const handleModeChange = (mode: 'vibe' | 'spec') => {
    // 1. 物理层立即同步 (防止 React 闭包延迟)
    if (typeof window !== 'undefined') {
      (window as any).__IFAI_EDITOR_MODE__ = mode;
      // 🔥 FIX v0.3.9: Vibe 模式下也允许意图识别，以便自然语言触发 Agent
      (window as any).__IFAI_DISABLE_INTENT__ = false; 
      console.log('[ModeSwitch] 🚀 PHYSICAL SYNC:', mode);
    }
    // 2. React 状态更新
    setEditorMode(mode);
  };

  return (
    <div className="theme-panel-muted theme-border flex items-center rounded-full border p-0.5">
      <button
        onClick={() => handleModeChange('vibe')}
        data-testid="mode-toggle-vibe"
        aria-pressed={editorMode === 'vibe'}
        className={clsx(
          buttonClass,
          editorMode === 'vibe'
            ? activeModeClass
            : 'theme-text-subtle hover:bg-[var(--selected-bg)] hover:text-[var(--text-primary)]'
        )}
      >
        <Zap size={14} />
        <span className="tracking-widest uppercase">{t('layout.modeSwitch.vibe')}</span>
      </button>

      <button
        onClick={() => handleModeChange('spec')}
        data-testid="mode-toggle-spec"
        aria-pressed={editorMode === 'spec'}
        className={clsx(
          buttonClass,
          editorMode === 'spec'
            ? activeModeClass
            : 'theme-text-subtle hover:bg-[var(--selected-bg)] hover:text-[var(--text-primary)]'
        )}
      >
        <ShieldCheck size={14} />
        <span className="tracking-widest uppercase">{t('layout.modeSwitch.spec')}</span>
      </button>
    </div>
  );
};
