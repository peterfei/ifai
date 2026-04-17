/**
 * v0.3.0: 重构预览面板
 *
 * 显示重构操作的预览和确认
 */

import React, { useState } from 'react';
import { X, Check, AlertTriangle, File, Edit3 } from 'lucide-react';
import { useRefactoringStore } from '../../stores/refactoringStore';

interface RefactoringPreviewPanelProps {
  onClose?: () => void;
}

export const RefactoringPreviewPanel: React.FC<RefactoringPreviewPanelProps> = ({ onClose }) => {
  const {
    currentPreview,
    isExecuting,
    error,
    executeRefactoring,
    clearPreview,
  } = useRefactoringStore();

  const [expandedEdits, setExpandedEdits] = useState<Set<number>>(new Set());

  if (!currentPreview) {
    return (
      <div className="theme-panel theme-text-subtle flex h-full flex-col items-center justify-center p-6 text-center">
        <Edit3 size={48} className="mx-auto mb-4 opacity-50" />
        <p className="text-sm">暂无重构预览</p>
        <p className="text-xs mt-2">选择代码元素后查看重构选项</p>
      </div>
    );
  }

  const toggleEditExpanded = (index: number) => {
    setExpandedEdits(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const handleExecute = async () => {
    const success = await executeRefactoring();
    if (success && onClose) {
      onClose();
    }
  };

  const getDiffColor = (oldText: string, newText: string) => {
    if (!oldText) return 'border border-green-500/20 bg-green-500/10 text-green-500';
    if (!newText) return 'border border-red-500/20 bg-red-500/10 text-red-500';
    return 'border border-yellow-500/20 bg-yellow-500/10 text-yellow-500';
  };

  const formatFilePath = (filePath: string) => {
    return filePath.split('/').pop() || filePath;
  };

  return (
    <div className="theme-panel flex h-full flex-col">
      {/* 标题栏 */}
      <div className="theme-panel-elevated theme-border flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Edit3 size={18} className="text-purple-400" />
          <h2 className="theme-text text-sm font-semibold">重构预览</h2>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="theme-button-ghost rounded p-1"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* 重构信息 */}
      <div className="theme-panel-muted theme-border border-b px-4 py-3">
        <h3 className="theme-text mb-1 text-sm font-medium">{currentPreview.name}</h3>
        <p className="theme-text-muted mb-2 text-xs">{currentPreview.description}</p>
        <div className="flex gap-4 text-xs">
          <span className="theme-text-subtle">
            {currentPreview.summary.filesChanged} 个文件
          </span>
          <span className="theme-text-subtle">
            {currentPreview.summary.totalEdits} 处编辑
          </span>
        </div>
      </div>

      {/* 错误信息 */}
      {error && (
        <div className="mx-4 mt-3 p-3 bg-red-900/30 border border-red-700 rounded-lg">
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-300">{error}</p>
          </div>
        </div>
      )}

      {/* 编辑列表 */}
      <div className="flex-1 overflow-y-auto p-2">
        {currentPreview.edits.map((edit, index) => (
          <div
            key={`${edit.filePath}-${index}`}
            className="theme-border mb-2 overflow-hidden rounded-lg border"
          >
            {/* 文件路径 */}
            <div
              className="theme-panel-muted theme-hoverable flex cursor-pointer items-center justify-between px-3 py-2"
              onClick={() => toggleEditExpanded(index)}
            >
              <div className="flex items-center gap-2">
                <File size={14} className="theme-text-subtle" />
                <span className="theme-text-muted text-xs">{formatFilePath(edit.filePath)}</span>
              </div>
              <span className="theme-text-subtle text-xs">
                L{edit.range.startLineNumber}
              </span>
            </div>

            {/* Diff 预览 */}
            {expandedEdits.has(index) && (
              <div className="theme-panel theme-border border-t p-3">
                <div className="grid grid-cols-[80px_1fr] gap-2 text-xs">
                  {/* 原代码 */}
                  <div className="theme-text-subtle">原代码:</div>
                  <div className="theme-code-surface theme-border theme-text break-all rounded border p-2 font-mono">
                    {edit.oldText || '(空)'}
                  </div>

                  {/* 新代码 */}
                  <div className="theme-text-subtle">新代码:</div>
                  <div
                    className={`break-all rounded p-2 font-mono ${getDiffColor(edit.oldText, edit.newText)}`}
                  >
                    {edit.newText || '(删除)'}
                  </div>

                  {/* 位置信息 */}
                  <div className="theme-text-subtle">位置:</div>
                  <div className="theme-text-muted">
                    {edit.range.startLineNumber}:{edit.range.startColumn}
                    {edit.range.endLineNumber !== edit.range.startLineNumber &&
                      ` → ${edit.range.endLineNumber}:${edit.range.endColumn}`}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 操作按钮 */}
      <div className="theme-panel-elevated theme-border border-t p-3">
        <div className="flex gap-2">
          <button
            onClick={handleExecute}
            disabled={isExecuting}
            className="theme-button-primary flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isExecuting ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-transparent rounded-full animate-spin" />
                执行中...
              </>
            ) : (
              <>
                <Check size={16} />
                应用重构
              </>
            )}
          </button>
          <button
            onClick={clearPreview}
            className="theme-button-secondary rounded-lg px-4 py-2 text-sm"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
};
