/**
 * v0.2.9 行内编辑小部件
 *
 * 当用户按 Cmd+K 时显示，允许输入编辑指令
 */

import React, { useState, useEffect, useRef } from 'react';
import { useInlineEditStore } from '../../stores/inlineEditStore';
import { Sparkles, X } from 'lucide-react';

/**
 * 使用一个对象选择器来确保 Zustand 能正确追踪状态变化
 * 这样可以避免 React 渲染优化导致的不更新问题
 */
function selectInlineEditState(state: any) {
  return {
    isInlineEditVisible: state.isInlineEditVisible,
    selectedText: state.selectedText,
    position: state.position,
    hideInlineEdit: state.hideInlineEdit,
    submitInstruction: state.submitInstruction,
  };
}

export const InlineEditWidget = () => {
  // 使用对象选择器获取所有需要的状态
  const storeState = useInlineEditStore(selectInlineEditState);
  const { isInlineEditVisible, selectedText, position, hideInlineEdit, submitInstruction } = storeState;

  console.log('[InlineEditWidget] Render, isInlineEditVisible:', isInlineEditVisible);

  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const [widgetStyle, setWidgetStyle] = useState<React.CSSProperties>({ display: 'none' });

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
            top: 100,
            left: 100,
          });
        }
      } else {
        console.warn('[InlineEditWidget] No editor or position, showing at default position');
        setWidgetStyle({
          display: 'flex',
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
    if (!input.trim()) {
      hideInlineEdit();
      return;
    }
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
      className="absolute z-50 bg-[#252526] border border-gray-600 rounded-lg shadow-2xl p-2 w-[400px] flex items-center gap-2 inline-edit-widget"
      style={widgetStyle}
      data-testid="inline-input-container"
    >
      <div className="text-blue-400 flex items-center justify-center w-5 h-5">
        <Sparkles size={16} />
      </div>
      <input
        ref={inputRef}
        type="text"
        className="flex-1 bg-transparent border-none outline-none text-white text-sm placeholder-gray-500"
        placeholder="Describe changes... (e.g., 'Add error handling')"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        data-testid="inline-input"
      />
      <button
        onClick={hideInlineEdit}
        className="text-gray-400 hover:text-white"
        aria-label="Close"
      >
        <X size={14} />
      </button>
    </div>
  );
};
