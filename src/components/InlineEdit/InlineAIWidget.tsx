import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, X, CornerDownLeft, Loader2, Zap, ShieldCheck, Search, CheckCircle2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PivoStage } from '../../stores/types';
import { GhostTaskList, GhostTask } from './GhostTaskList';
import { FilePortal } from './FilePortal';
import { formatKeybinding } from '../../utils/keyboard';

interface InlineAIWidgetProps {
  onClose: () => void;
  onSubmit: (text: string) => void;
  onNavigate?: (path: string) => void;
  stage?: PivoStage;
  isLoading?: boolean;
  tasks?: GhostTask[];
  modifiedFiles?: string[];
  selectedText?: string;
  currentFilePath?: string;
}

export const InlineAIWidget: React.FC<InlineAIWidgetProps> = ({ 
  onClose, 
  onSubmit, 
  onNavigate,
  stage = 'idle',
  isLoading = false,
  tasks = [],
  modifiedFiles = [],
  selectedText = '',
  currentFilePath = ''
}) => {
  const { t } = useTranslation();
  const [inputValue, setInputValue] = useState('');
  const acceptShortcutLabel = formatKeybinding('Mod+Enter');
  const newLineShortcutLabel = formatKeybinding('Shift+Enter');

  // 初始化输入框：如果有选中代码，预填充
  useEffect(() => {
    if (selectedText && stage === 'idle' && !inputValue) {
      // 仅在初始空闲状态且没有输入时填充
      // 限制字数以避免输入框过载
      if (selectedText.length < 500) {
        setInputValue(selectedText);
      }
    }
  }, [selectedText, stage]);

  // 快捷键处理：Mod+Enter 接受修改
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (stage !== 'idle' && (e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        onSubmit('__ACCEPT_ALL__');
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [stage, onSubmit]);

  // PIVO 进度条颜色映射
  const getStageColor = (s: PivoStage) => {
    switch (s) {
      case 'plan': return 'bg-[var(--accent-color)]';
      case 'implement': return 'bg-[var(--info-color)]';
      case 'verify': return 'bg-[var(--success-color)]';
      case 'optimize': return 'bg-[var(--warning-color)]';
      default: return 'bg-[var(--border-strong)]';
    }
  };

  const getStageLabel = (s: PivoStage) => {
    switch (s) {
      case 'plan': return t('inlineAIWidget.stage.plan');
      case 'implement': return t('inlineAIWidget.stage.implement');
      case 'verify': return t('inlineAIWidget.stage.verify');
      case 'optimize': return t('inlineAIWidget.stage.optimize');
      default: return '';
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: -10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.98 }}
      className="inline-ai-widget theme-panel-elevated theme-border theme-shadow relative min-w-[480px] max-w-[600px] overflow-hidden rounded-xl border backdrop-blur-xl"
    >
      <div className="theme-panel-muted absolute top-0 left-0 right-0 h-[2px] overflow-hidden">
        <motion.div 
          initial={{ x: '-100%' }}
          animate={{ x: (stage === 'idle' && !isLoading) ? '-100%' : '0%' }}
          transition={{ type: 'spring', damping: 20, stiffness: 100 }}
          className={`h-full w-full ${getStageColor(stage)}`}
          style={{ boxShadow: '0 0 10px var(--accent-soft-border)' }}
        />
      </div>

      <div className="px-4 py-3">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className={`p-1 rounded-md ${stage === 'idle' ? 'theme-badge-accent' : 'theme-panel-muted theme-text-muted'}`}>
              <Sparkles size={14} className={isLoading ? "animate-pulse" : ""} />
            </div>
            <span className="theme-text-subtle text-[11px] font-bold uppercase tracking-widest">
              {stage !== 'idle' ? getStageLabel(stage) : t('inlineAIWidget.title')}
            </span>
            
            {/* 🔥 显示当前操作文件 */}
            {currentFilePath && (
              <div className="theme-panel-muted theme-border flex items-center gap-1 ml-2 rounded border px-1.5 py-0.5">
                <span className="theme-text-subtle text-[9px]">{t('inlineAIWidget.targetLabel')}:</span>
                <span className="theme-text-accent max-w-[120px] truncate text-[9px] font-mono">
                  {currentFilePath.split('/').pop()}
                </span>
              </div>
            )}
          </div>
          <button 
            onClick={onClose}
            className="theme-button-ghost rounded-md p-1 transition-all"
          >
            <X size={14} />
          </button>
        </div>

        {/* 选中的代码预览 (仅在空闲且有选中时显示) */}
        {selectedText && stage === 'idle' && (
          <div className="theme-code-surface theme-border mb-3 overflow-hidden rounded-lg border p-2">
            <div className="theme-text-subtle mb-1 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-tighter">
              <Search size={10} />
              {t('inlineAIWidget.currentContext')}
            </div>
            <pre className="theme-text-muted truncate whitespace-pre text-[10px] font-mono leading-relaxed">
              {selectedText.length > 200 ? selectedText.substring(0, 200) + '...' : selectedText}
            </pre>
          </div>
        )}

        {/* Input Area */}
        <div className="relative group">
          <textarea
            autoFocus
            rows={1}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            disabled={isLoading}
            data-testid="inline-ai-input"
            className="theme-input-surface theme-border theme-focus-accent theme-text w-full resize-none overflow-hidden rounded-lg border px-3 py-2.5 text-sm transition-all"
            placeholder={t('inlineAIWidget.placeholder')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (inputValue.trim()) onSubmit(inputValue);
              } else if (e.key === 'Escape') {
                onClose();
              }
            }}
          />
          
          <div className="absolute right-2 bottom-2 flex items-center gap-2">
            <span className="theme-text-subtle hidden text-[10px] font-medium animate-in fade-in duration-300 group-focus-within:block">
              {t('inlineAIWidget.newLineHint', { shortcut: newLineShortcutLabel })}
            </span>
            <div className="theme-panel-muted theme-border theme-text-subtle rounded-md border p-1.5">
              <CornerDownLeft size={12} />
            </div>
          </div>
        </div>

        {/* 👻 Ghost Task List */}
        <GhostTaskList tasks={tasks} />

        {/* 🔥 v0.3.7: 验证阶段交互增强 */}
        <AnimatePresence>
          {stage === 'verify' && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="theme-border mt-3 flex items-center justify-between border-t pt-3"
            >
              <div className="theme-text-success flex items-center gap-2 text-[10px] font-medium">
                <CheckCircle2 size={12} />
                {t('inlineAIWidget.applied')}
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={onClose}
                  className="theme-button-success flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-bold transition-all"
                >
                  <Zap size={12} />
                  {t('inlineAIWidget.acceptAndClose')}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 🚪 File Portal (Cross-file Navigation) */}
        {onNavigate && <FilePortal files={modifiedFiles} onNavigate={onNavigate} />}

        {/* Action Footer */}
        <AnimatePresence>
          {(isLoading || stage !== 'idle') && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="theme-border mt-3 flex items-center justify-between gap-3 border-t pt-3"
            >
              {isLoading ? (
                <div className="flex items-center gap-3 flex-1">
                  <div className="theme-badge-accent flex items-center gap-2 rounded-full px-2 py-1 text-[10px] font-bold">
                    <Loader2 size={10} className="animate-spin" />
                    {t('inlineAIWidget.processing')}
                  </div>
                  <div className="theme-panel-muted h-1 flex-1 overflow-hidden rounded-full">
                    <motion.div 
                      animate={{ x: ['-100%', '100%'] }}
                      transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
                      className="h-full w-1/3 rounded-full bg-[var(--accent-soft-border)]"
                    />
                  </div>
                </div>
              ) : (
                <>
                  <div className="theme-text-subtle flex items-center gap-2 text-[10px] font-medium">
                    <Zap size={10} />
                    {t('inlineAIWidget.readyToApply')}
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={onClose}
                      className="theme-button-secondary rounded-lg border border-[var(--danger-soft-border)] px-3 py-1.5 text-xs font-bold transition-all hover:bg-[var(--danger-soft-bg)] hover:text-[var(--danger-color)]"
                    >
                      {t('inlineAIWidget.discard')}
                    </button>
                    <button 
                      onClick={() => onSubmit('__ACCEPT_ALL__')}
                      className="theme-button-primary theme-glow-accent flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all"
                    >
                      <CheckCircle2 size={12} />
                      {t('inlineAIWidget.accept')} <span className="opacity-50 text-[10px]">{acceptShortcutLabel}</span>
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};
