/**
 * v0.2.9 行内编辑小部件
 *
 * 当用户按 Cmd+K 时显示，允许输入编辑指令
 * 使用 Zustand store 管理状态
 *
 * 🔥 修复无限循环：使用 CSS class 控制显示/隐藏，避免动态 style 对象
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useInlineEditStore } from '../../stores/inlineEditStore';
import { Sparkles, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '../../stores/settingsStore';
import { isDarkTheme } from '../../utils/theme';

export const InlineEditWidget = () => {
  const { t } = useTranslation();
  const theme = useSettingsStore(state => state.theme);
  const dark = isDarkTheme(theme);
  // 🔥 使用选择器订阅 store
  const isInlineEditVisible = useInlineEditStore(state => state.isInlineEditVisible);
  const selectedText = useInlineEditStore(state => state.selectedText);
  const position = useInlineEditStore(state => state.position);
  const hideInlineEdit = useInlineEditStore(state => state.hideInlineEdit);
  const submitInstruction = useInlineEditStore(state => state.submitInstruction);
  const isProcessing = useInlineEditStore(state => state.isProcessing); // 🔥 v0.3.0: 添加加载状态

  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 🔥 使用 useState 存储 top 位置，而不是整个 style 对象
  const [topPosition, setTopPosition] = useState(100);

  // 🔥 使用 ref 追踪上一次的 position，避免重复计算
  const lastPositionRef = useRef<string>('');

  // 🔥 使用 useCallback 缓存事件处理函数
  const handleClose = useCallback(() => {
    hideInlineEdit();
  }, [hideInlineEdit]);

  const handleSubmit = useCallback(() => {
    if (!input.trim()) {
      hideInlineEdit();
      return;
    }
    submitInstruction(input);
    setInput('');
  }, [input, hideInlineEdit, submitInstruction]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      hideInlineEdit();
    }
  }, [handleSubmit, hideInlineEdit]);

  // 🔥 使用 useMemo 缓存 position 的字符串表示，用于比较
  const positionKey = useMemo(() => {
    return position ? `${position.lineNumber}:${position.column}` : '';
  }, [position]);

  // 当显示状态或位置改变时，更新位置
  useEffect(() => {
    if (!isInlineEditVisible) {
      setTopPosition(100);
      setInput('');
      return;
    }

    // 🔥 检查 position 是否真正改变
    if (positionKey === lastPositionRef.current) {
      return;
    }

    lastPositionRef.current = positionKey;

    const editor = (window as any).__activeEditor;
    let newTop = 100;

    if (editor && position) {
      try {
        newTop = editor.getTopForPosition(position.lineNumber, position.column) + 30;
      } catch (e) {
        console.warn('[InlineEditWidget] Failed to get position:', e);
      }
    }

    setTopPosition(newTop);

    // 延迟聚焦输入框
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  }, [isInlineEditVisible, positionKey]); // 🔥 只依赖 positionKey 而不是 position 对象

  // 当选中的文本改变时，预填充输入框
  useEffect(() => {
    if (selectedText && isInlineEditVisible) {
      setInput(selectedText);
    }
  }, [selectedText, isInlineEditVisible]);

  // 🔥 使用 CSS class 控制显示/隐藏，而不是动态 style 对象
  const containerClassName = `theme-panel-elevated theme-border theme-shadow absolute z-[280] w-[400px] rounded-lg border inline-edit-widget transition-opacity duration-200 ${
    isInlineEditVisible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
  }`;

  const containerStyle = useMemo(() => ({
    top: topPosition,
    left: 100,
  }), [topPosition]); // 🔥 只依赖 topPosition

  return (
    <div
      ref={containerRef}
      className={containerClassName}
      style={containerStyle}
      data-testid="inline-input-container"
    >
      {/* Header */}
      <div className="theme-panel-muted theme-border flex items-center gap-2 border-b px-3 py-2">
        <Sparkles className="theme-text-accent" size={16} />
        <span className="theme-text text-xs font-medium">{t('editor.inlineWidget.title')}</span>
        <button
          onClick={handleClose}
          className="theme-button-ghost ml-auto rounded p-1"
          aria-label={t('common.close')}
        >
          <X size={14} />
        </button>
      </div>

      {/* Input */}
      <div className="flex items-center gap-2 px-3 py-2">
        <input
          ref={inputRef}
          type="text"
          className="theme-input-surface theme-border theme-text theme-focus-accent flex-1 rounded border px-3 py-2 text-sm"
          placeholder={t('editor.inlineWidget.placeholder')}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isProcessing}
          data-testid="inline-input"
        />
      </div>

      {/* 🔥 v0.3.0: 加载状态指示器 */}
      {isProcessing && (
        <div className="theme-text-subtle flex items-center gap-2 px-3 py-2 text-sm animate-pulse">
          <div className="flex items-center gap-1">
            {/* 简洁的 spinner 动画 */}
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--accent-color)] border-t-transparent" />
            <span>{t('editor.inlineWidget.processing')}</span>
          </div>
        </div>
      )}

      {/* Footer hint */}
      <div className="theme-panel-muted theme-border rounded-b-lg border-t px-3 py-1.5">
        <div className="theme-text-subtle flex items-center gap-3 text-xs">
          <span>
            <kbd className="theme-input-surface theme-border theme-text rounded border px-1.5 py-0.5 text-[10px]">Enter</kbd>
            <span className="ml-1">{t('editor.inlineWidget.submit')}</span>
          </span>
          <span>
            <kbd className="theme-input-surface theme-border theme-text rounded border px-1.5 py-0.5 text-[10px]">Esc</kbd>
            <span className="ml-1">{t('editor.inlineWidget.cancel')}</span>
          </span>
        </div>
      </div>
    </div>
  );
};

export default InlineEditWidget;
