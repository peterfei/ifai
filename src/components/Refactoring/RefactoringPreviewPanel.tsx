/**
 * v0.3.0: 重构预览面板
 *
 * 显示重构操作的预览和确认
 */

import React, { useState } from 'react';
import { X, Check, AlertTriangle, File, Edit3 } from 'lucide-react';
import { useRefactoringStore } from '../../stores/refactoringStore';
import { useTranslation } from 'react-i18next';
import { open } from '@tauri-apps/plugin-dialog';
import { readFileContent, writeFileContent } from '../../utils/fileSystem';

interface RefactoringPreviewPanelProps {
  onClose?: () => void;
}

export const RefactoringPreviewPanel: React.FC<RefactoringPreviewPanelProps> = ({ onClose }) => {
  const { t } = useTranslation();
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
      <div className="p-6 text-center text-gray-400">
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
    if (!oldText) return 'text-green-400 bg-green-400/10';
    if (!newText) return 'text-red-400 bg-red-400/10';
    return 'text-yellow-400 bg-yellow-400/10';
  };

  const formatFilePath = (filePath: string) => {
    return filePath.split('/').pop() || filePath;
  };

  return (
    <div className="h-full flex flex-col bg-gray-900">
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <Edit3 size={18} className="text-purple-400" />
          <h2 className="text-sm font-semibold text-white">重构预览</h2>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* 重构信息 */}
      <div className="px-4 py-3 border-b border-gray-700">
        <h3 className="text-sm font-medium text-white mb-1">{currentPreview.name}</h3>
        <p className="text-xs text-gray-400 mb-2">{currentPreview.description}</p>
        <div className="flex gap-4 text-xs">
          <span className="text-gray-500">
            {currentPreview.summary.filesChanged} 个文件
          </span>
          <span className="text-gray-500">
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
            className="mb-2 rounded-lg overflow-hidden border border-gray-700"
          >
            {/* 文件路径 */}
            <div
              className="px-3 py-2 bg-gray-800 flex items-center justify-between cursor-pointer hover:bg-gray-700"
              onClick={() => toggleEditExpanded(index)}
            >
              <div className="flex items-center gap-2">
                <File size={14} className="text-gray-400" />
                <span className="text-xs text-gray-300">{formatFilePath(edit.filePath)}</span>
              </div>
              <span className="text-xs text-gray-500">
                L{edit.range.startLineNumber}
              </span>
            </div>

            {/* Diff 预览 */}
            {expandedEdits.has(index) && (
              <div className="p-3 bg-gray-900 border-t border-gray-700">
                <div className="grid grid-cols-[80px_1fr] gap-2 text-xs">
                  {/* 原代码 */}
                  <div className="text-gray-500">原代码:</div>
                  <div className="bg-gray-800 p-2 rounded font-mono text-gray-300 break-all">
                    {edit.oldText || '(空)'}
                  </div>

                  {/* 新代码 */}
                  <div className="text-gray-500">新代码:</div>
                  <div
                    className={`p-2 rounded font-mono break-all ${getDiffColor(edit.oldText, edit.newText)}`}
                  >
                    {edit.newText || '(删除)'}
                  </div>

                  {/* 位置信息 */}
                  <div className="text-gray-500">位置:</div>
                  <div className="text-gray-400">
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
      <div className="p-3 border-t border-gray-700 bg-gray-800">
        <div className="flex gap-2">
          <button
            onClick={handleExecute}
            disabled={isExecuting}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 text-white text-sm rounded-lg transition-colors"
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
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded-lg transition-colors"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
};
