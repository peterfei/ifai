/**
 * v0.2.9 Diff 编辑器模态框组件
 *
 * 功能：
 * - 显示原始代码和修改后代码的对比
 * - 提供接受/拒绝按钮
 * - 支持查看修改详情
 */

import React, { useState, useEffect, useRef } from 'react';
import { X, Check, XCircle, Diff } from 'lucide-react';
import Editor, { Monaco, DiffEditor } from '@monaco-editor/react';
import { toast } from 'sonner';

// 简单的 diff 行计算
function computeLineDiff(original: string, modified: string): {
  originalLines: string[];
  modifiedLines: string[];
  unchanged: number;
  added: number;
  removed: number;
} {
  const originalLines = original.split('\n');
  const modifiedLines = modified.split('\n');

  // 简单的行级 diff
  let i = 0, j = 0;
  const unchanged = [];
  const added = [];
  const removed = [];

  while (i < originalLines.length || j < modifiedLines.length) {
    if (i < originalLines.length && j < modifiedLines.length && originalLines[i] === modifiedLines[j]) {
      unchanged.push({ line: originalLines[i], originalIndex: i, modifiedIndex: j });
      i++;
      j++;
    } else {
      if (i < originalLines.length) {
        removed.push({ line: originalLines[i], index: i });
        i++;
      }
      if (j < modifiedLines.length) {
        added.push({ line: modifiedLines[j], index: j });
        j++;
      }
    }
  }

  return {
    originalLines,
    modifiedLines,
    unchanged: unchanged.length,
    added: added.length,
    removed: removed.length,
  };
}

// ============================================================================
// Props
// ============================================================================

interface DiffEditorModalProps {
  /** 是否显示模态框 */
  isVisible: boolean;

  /** 原始代码 */
  originalCode: string;

  /** 修改后的代码 */
  modifiedCode: string;

  /** 文件路径 */
  filePath?: string;

  /** 语言 */
  language?: string;

  /** 用户指令 */
  instruction?: string;

  /** 接受修改回调 */
  onAccept: () => void;

  /** 拒绝修改回调 */
  onReject: () => void;
}

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 根据文件路径推断语言
 */
function getLanguageFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  const languageMap: Record<string, string> = {
    'ts': 'typescript',
    'tsx': 'typescript',
    'js': 'javascript',
    'jsx': 'javascript',
    'py': 'python',
    'go': 'go',
    'rs': 'rust',
    'c': 'c',
    'cpp': 'cpp',
    'h': 'c',
    'hpp': 'cpp',
    'java': 'java',
    'kt': 'kotlin',
    'swift': 'swift',
    'rb': 'ruby',
    'php': 'php',
    'sql': 'sql',
    'sh': 'shell',
    'yaml': 'yaml',
    'yml': 'yaml',
    'json': 'json',
    'xml': 'xml',
    'html': 'html',
    'css': 'css',
    'scss': 'scss',
    'md': 'markdown',
  };
  return languageMap[ext || ''] || 'typescript';
}

/**
 * 计算修改统计
 */
function calculateDiffStats(original: string, modified: string): {
  additions: number;
  deletions: number;
} {
  const originalLines = original.split('\n').length;
  const modifiedLines = modified.split('\n').length;
  return {
    additions: Math.max(0, modifiedLines - originalLines),
    deletions: Math.max(0, originalLines - modifiedLines),
  };
}

// ============================================================================
// 组件
// ============================================================================

export const DiffEditorModal: React.FC<DiffEditorModalProps> = ({
  isVisible,
  originalCode,
  modifiedCode,
  filePath = 'unknown',
  language,
  instruction = '',
  onAccept,
  onReject,
}) => {
  const [monaco, setMonaco] = useState<Monaco | null>(null);
  const diffStats = calculateDiffStats(originalCode, modifiedCode);
  const actualLanguage = language || getLanguageFromPath(filePath);

  // Esc 键关闭模态框
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isVisible) {
        onReject();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isVisible, onReject]);

  if (!isVisible) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[290] flex items-center justify-center bg-black bg-opacity-70"
      data-testid="diff-modal"
    >
      <div className="w-[90vw] max-w-6xl h-[80vh] bg-[#252526] rounded-lg shadow-2xl border border-gray-700 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <Diff className="text-blue-400" size={20} />
            <div>
              <h2 className="text-lg font-semibold text-white">代码修改预览</h2>
              {instruction && (
                <p className="text-xs text-gray-400 mt-0.5">"{instruction}"</p>
              )}
            </div>
          </div>
          <button
            onClick={onReject}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 px-4 py-2 bg-[#1e1e1e] border-b border-gray-700">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-green-400">+{diffStats.additions} 行</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-red-400">-{diffStats.deletions} 行</span>
          </div>
          <div className="ml-auto text-xs text-gray-500">
            {filePath}
          </div>
        </div>

        {/* Diff Editor */}
        <div className="flex-1 overflow-hidden" data-testid="diff-editor">
          <DiffEditor
            height="100%"
            language={actualLanguage}
            theme="vs-dark"
            original={originalCode}
            modified={modifiedCode}
            options={{
              readOnly: true,
              minimap: { enabled: false },
              fontSize: 13,
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              renderSideBySide: true,
              enableSplitViewResizing: false,
            }}
            onMount={(editor, monaco) => {
              setMonaco(monaco);
            }}
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-gray-700 bg-[#1e1e1e] rounded-b-lg">
          <button
            onClick={onReject}
            className="flex items-center gap-2 px-4 py-2 text-sm text-gray-300 hover:text-white hover:bg-white/5 rounded transition-colors"
            data-testid="reject-diff-button"
          >
            <XCircle size={16} />
            <span>拒绝 (Reject)</span>
          </button>

          <div className="flex gap-2">
            <button
              onClick={() => {
                onAccept();
                toast.success('已应用代码修改');
              }}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-green-600 hover:bg-green-700 text-white rounded transition-colors"
              data-testid="accept-diff-button"
            >
              <Check size={16} />
              <span>接受 (Accept)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DiffEditorModal;
