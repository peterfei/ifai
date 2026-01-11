/**
 * v0.2.9 行内编辑小部件组件
 *
 * 功能：
 * - Cmd+K 触发的 AI 编辑输入框
 * - 显示在编辑器中当前行下方
 * - 输入自然语言指令后提交给 AI
 */

import React, { useState, useEffect, useRef } from 'react';
import { Send, X, Sparkles } from 'lucide-react';
import { useEditorStore } from '../../stores/editorStore';

// ============================================================================
// Props
// ============================================================================

interface InlineEditWidgetProps {
  /** 是否显示小部件 */
  isVisible: boolean;

  /** 当前选中的文本（如果有） */
  selectedText?: string;

  /** 当前位置（行号、列号） */
  position?: { lineNumber: number; column: number };

  /** 提交回调 */
  onSubmit: (instruction: string) => void;

  /** 取消回调 */
  onCancel: () => void;
}

// ============================================================================
// 组件
// ============================================================================

export const InlineEditWidget: React.FC<InlineEditWidgetProps> = ({
  isVisible,
  selectedText = '',
  position,
  onSubmit,
  onCancel,
}) => {
  const [instruction, setInstruction] = useState(selectedText);
  const inputRef = useRef<HTMLInputElement>(null);

  // 当显示时自动聚焦输入框
  useEffect(() => {
    if (isVisible && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isVisible]);

  // 当选中文本改变时更新输入
  useEffect(() => {
    if (selectedText) {
      setInstruction(selectedText);
    }
  }, [selectedText]);

  // 处理键盘事件
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && instruction.trim()) {
      e.preventDefault();
      onSubmit(instruction.trim());
      setInstruction('');
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
      setInstruction('');
    }
  };

  if (!isVisible) {
    return null;
  }

  return (
    <div
      className="inline-edit-widget fixed z-[300] bg-[#252526] border border-blue-500/50 rounded-lg shadow-2xl"
      data-testid="inline-edit-widget"
      style={{
        boxShadow: '0 0 0 1px rgba(59, 130, 246, 0.5), 0 4px 20px rgba(0, 0, 0, 0.5)',
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-700">
        <Sparkles className="text-blue-400" size={16} />
        <span className="text-xs font-medium text-gray-300">AI 编辑</span>
        <button
          onClick={onCancel}
          className="ml-auto text-gray-400 hover:text-white transition-colors"
          data-testid="cancel-inline-edit"
        >
          <X size={14} />
        </button>
      </div>

      {/* Input */}
      <div className="flex items-center gap-2 px-3 py-2">
        <input
          ref={inputRef}
          type="text"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="描述您想要的修改..."
          className="flex-1 bg-[#1e1e1e] text-white text-sm px-3 py-2 rounded border border-gray-600 focus:border-blue-500 focus:outline-none min-w-[300px]"
          data-testid="inline-input"
        />
        <button
          onClick={() => {
            if (instruction.trim()) {
              onSubmit(instruction.trim());
              setInstruction('');
            }
          }}
          disabled={!instruction.trim()}
          className="p-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded transition-colors"
          data-testid="submit-inline-edit"
        >
          <Send size={16} />
        </button>
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
