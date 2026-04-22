import React from 'react';
import { Zap, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLayoutStore } from '../../stores/layoutStore';
import clsx from 'clsx';

export const ModeSwitch: React.FC = () => {
  const { t } = useTranslation();
  const { editorMode, setEditorMode } = useLayoutStore();
  const buttonClass = 'theme-focus-ring-accent theme-soft-hover relative flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-bold transition-all duration-500 overflow-hidden';

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
    <div className="flex items-center bg-[#1e1e1e]/80 backdrop-blur-md p-1 rounded-full border border-gray-700/50 shadow-inner">
      <button
        onClick={() => handleModeChange('vibe')}
        data-testid="mode-toggle-vibe"
        aria-pressed={editorMode === 'vibe'}
        className={clsx(
          buttonClass,
          editorMode === 'vibe'
            ? 'text-white shadow-[0_0_15px_rgba(168,85,247,0.4)]'
            : 'text-gray-500 hover:text-gray-300'
        )}
      >
        {editorMode === 'vibe' && (
          <div className="absolute inset-0 bg-gradient-to-r from-purple-600 to-pink-500 opacity-90 -z-10" />
        )}
        <Zap size={14} className={clsx(editorMode === 'vibe' && 'animate-pulse')} />
        <span className="tracking-widest uppercase">{t('layout.modeSwitch.vibe')}</span>
      </button>

      <button
        onClick={() => handleModeChange('spec')}
        data-testid="mode-toggle-spec"
        aria-pressed={editorMode === 'spec'}
        className={clsx(
          buttonClass,
          editorMode === 'spec'
            ? 'text-white shadow-[0_0_15px_rgba(6,182,212,0.4)]'
            : 'text-gray-500 hover:text-gray-300'
        )}
      >
        {editorMode === 'spec' && (
          <div className="absolute inset-0 bg-gradient-to-r from-cyan-600 to-blue-600 opacity-90 -z-10" />
        )}
        <ShieldCheck size={14} className={clsx(editorMode === 'spec' && 'animate-pulse')} />
        <span className="tracking-widest uppercase">{t('layout.modeSwitch.spec')}</span>
      </button>
    </div>
  );
};
