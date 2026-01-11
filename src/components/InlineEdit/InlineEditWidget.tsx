/**
 * v0.2.9 行内编辑小部件
 *
 * 当用户按 Cmd+K 时显示，允许输入编辑指令
 * 使用 Zustand store 管理状态
 */

import React, { useState, useEffect, useRef, useSyncExternalStore } from 'react';
import { useInlineEditStore } from '../../stores/inlineEditStore';
import { Sparkles, X } from 'lucide-react';

export const InlineEditWidget = () => {
  // 使用 useSyncExternalStore 直接订阅 Zustand store
  // 这是确保 React 能正确追踪状态变化的最可靠方法
  const storeState = useSyncExternalStore(
    useInlineEditStore.subscribe,
    () => useInlineEditStore.getState(),
    () => useInlineEditStore.getState()
  );

  const { isInlineEditVisible, selectedText, position, hideInlineEdit, submitInstruction } = storeState;

  console.log('[InlineEditWidget] Render, isInlineEditVisible:', isInlineEditVisible);

  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const [widgetStyle, setWidgetStyle] = useState<React.CSSProperties>({
    display: 'none',
    top: 100,
    left: 100,
  });

  // 当显示状态或位置改变时，更新样式
  useEffect(() => {
    console.log('[InlineEditWidget] Position effect triggered, isInlineEditVisible:', isInlineEditVisible, 'position:', position);

    if (isInlineEditVisible) {
      const editor = (window as any).__activeEditor;
      console.log('[InlineEditWidget] editor:', !!editor, 'position:', position);

      if (editor && position) {
        try {
          // 使用 getTopForPosition 获取位置
          const top = editor.getTopForPosition(position.lineNumber, position.column);
          console.log('[InlineEditWidget] Calculated top:', top);

          setWidgetStyle({
            display: 'flex',
            flexDirection: 'column',
            top: top + 30,
            left: 100,
          });

          // 延迟聚焦输入框
          setTimeout(() => {
            console.log('[InlineEditWidget] Focusing input');
            inputRef.current?.focus();
          }, 50);
        } catch (e) {
          console.warn('[InlineEditWidget] Failed to get position:', e);
          setWidgetStyle({
            display: 'flex',
            flexDirection: 'column',
            top: 100,
            left: 100,
          });
        }
      } else {
        console.warn('[InlineEditWidget] No editor or position, showing at default position');
        setWidgetStyle({
          display: 'flex',
          flexDirection: 'column',
          top: 100,
          left: 100,
        });
      }
    } else {
      console.log('[InlineEditWidget] Hiding widget');
      setWidgetStyle({ display: 'none' });
      setInput('');
    }
  }, [isInlineEditVisible, position]);

  // 当选中的文本改变时，预填充输入框
  useEffect(() => {
    if (selectedText) {
      setInput(selectedText);
    }
  }, [selectedText]);

  const handleSubmit = () => {
    console.log('[InlineEditWidget] handleSubmit called, input:', input);
    if (!input.trim()) {
      hideInlineEdit();
      return;
    }
    console.log('[InlineEditWidget] Calling submitInstruction with:', input);
    submitInstruction(input);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      hideInlineEdit();
    }
  };

  console.log('[InlineEditWidget] Rendering, widgetStyle.display:', widgetStyle.display);

  // 始终渲染组件，通过 style 控制可见性（而不是条件返回 null）
  return (
    <div
      className="absolute z-[280] bg-[#252526] border border-blue-500/50 rounded-lg shadow-2xl w-[400px] inline-edit-widget"
      style={widgetStyle}
      data-testid="inline-input-container"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-700">
        <Sparkles className="text-blue-400" size={16} />
        <span className="text-xs font-medium text-gray-300">AI 编辑</span>
        <button
          onClick={hideInlineEdit}
          className="ml-auto text-gray-400 hover:text-white transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      {/* Input */}
      <div className="flex items-center gap-2 px-3 py-2">
        <input
          ref={inputRef}
          type="text"
          className="flex-1 bg-[#1e1e1e] text-white text-sm px-3 py-2 rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
          placeholder="描述您想要的修改... (e.g., 'Add error handling')"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          data-testid="inline-input"
        />
      </div>

      {/* Footer hint */}
      <div className="px-3 py-1.5 bg-[#1e1e1e] rounded-b-lg border-t border-gray-700">
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span>
            <kbd className="px-1.5 py-0.5 bg-[#333] rounded text-[10px]">Enter</kbd>
            <span className="ml-1">提交</span>
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 bg-[#333] rounded text-[10px]">Esc</kbd>
            <span className="ml-1">取消</span>
          </span>
        </div>
      </div>
    </div>
  );
};

export default InlineEditWidget;
