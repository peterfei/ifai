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
import { useInlineEditStore } from '../../stores/inlineEditStore';
import { shallow } from 'zustand/shallow';
import { useSettingsStore } from '../../stores/settingsStore';
import { getMonacoTheme, isDarkTheme } from '../../utils/theme';

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
  /** 原始代码（可选，优先使用 store 中的值） */
  originalCode?: string;

  /** 修改后的代码（可选，优先使用 store 中的值） */
  modifiedCode?: string;

  /** 文件路径（可选，优先使用 store 中的值） */
  filePath?: string;

  /** 语言 */
  language?: string;

  /** 用户指令（可选，优先使用 store 中的值） */
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
 * @param path 文件路径（字符串或 Monaco Uri 对象）
 */
function getLanguageFromPath(path: string | { path: string; toString(): string }): string {
  // 处理 Monaco Uri 对象
  let pathStr: string;
  if (typeof path === 'string') {
    pathStr = path;
  } else if (path && typeof path.toString === 'function') {
    pathStr = path.toString();
    // 移除 Monaco Uri 的 scheme (如 "file://")
    pathStr = pathStr.replace(/^file:\/\//, '');
  } else {
    return 'typescript';
  }

  const ext = pathStr.split('.').pop()?.toLowerCase();
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
    'vue': 'vue',
    'svelte': 'svelte',
  };
  return languageMap[ext || ''] || 'typescript';
}

/**
 * 将文件路径转换为可显示的字符串
 * @param path 文件路径（字符串或 Monaco Uri 对象）
 */
function filePathToString(path: string | { path: string; toString(): string } | undefined | null): string {
  if (!path) return 'unknown';
  if (typeof path === 'string') return path;
  if (typeof path.toString === 'function') {
    const str = path.toString();
    // 移除 Monaco Uri 的 scheme (如 "file://")
    return str.replace(/^file:\/\//, '');
  }
  return String(path);
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
  originalCode: propOriginalCode,
  modifiedCode: propModifiedCode,
  filePath: propFilePath,
  language,
  instruction: propInstruction,
  onAccept,
  onReject,
}) => {
  const theme = useSettingsStore(state => state.theme);
  const dark = isDarkTheme(theme);
  // 🔥 修复无限循环：使用单独的选择器，避免对象选择器导致引用不稳定
  const isDiffEditorVisible = useInlineEditStore(state => state.isDiffEditorVisible);
  const storeOriginalCode = useInlineEditStore(state => state.originalCode);
  const storeModifiedCode = useInlineEditStore(state => state.modifiedCode);
  const storeFilePath = useInlineEditStore(state => state.currentFilePath);
  const storeInstruction = useInlineEditStore(state => state.instruction);

  // 优先使用 props，如果没有 props 则使用 store 状态
  const isVisible = isDiffEditorVisible;
  const originalCode = storeOriginalCode || propOriginalCode || '';
  const modifiedCode = storeModifiedCode || propModifiedCode || '';
  const filePath = storeFilePath || propFilePath || 'unknown';
  const instruction = storeInstruction || propInstruction || '';

  const [monaco, setMonaco] = useState<Monaco | null>(null);
  const editorRef = useRef<any>(null);
  const diffStats = calculateDiffStats(originalCode, modifiedCode);
  const actualLanguage = language || getLanguageFromPath(filePath);

  // 卸载时清理
  useEffect(() => {
    return () => {
      if (editorRef.current) {
        try {
          editorRef.current.setModel(null);
        } catch (e) {}
        editorRef.current = null;
      }
    };
  }, []);

  // 🔥 修复无限循环：使用 useMemo 缓存文件路径字符串，避免每次渲染都重新计算
  const filePathStr = React.useMemo(() => filePathToString(filePath), [filePath]);
  // 🔥 修复无限循环：使用 useMemo 缓存 DiffEditor 的 key，避免不必要的 remount
  const diffEditorKey = React.useMemo(
    () => `${filePathStr}-${originalCode.length}-${modifiedCode.length}`,
    [filePathStr, originalCode.length, modifiedCode.length]
  );

  // 🔥 修复无限循环：使用 ref 存储 onReject/onAccept，避免 useEffect 依赖变化
  const onRejectRef = useRef(onReject);
  const onAcceptRef = useRef(onAccept);
  onRejectRef.current = onReject;
  onAcceptRef.current = onAccept;

  // Esc 键关闭模态框
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isVisible) {
        onRejectRef.current();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isVisible]); // 🔥 移除 onReject 依赖，使用 ref 代替

  if (!isVisible) {
    return null;
  }

  return (
    <div
      className="theme-backdrop-strong fixed inset-0 z-[295] flex items-center justify-center backdrop-blur-sm"
      data-testid="diff-modal"
    >
      <div className="theme-panel-elevated theme-border theme-shadow flex h-[80vh] w-[90vw] max-w-6xl flex-col rounded-lg border">
        {/* Header */}
        <div className="theme-panel-muted theme-border flex items-center justify-between border-b p-4">
          <div className="flex items-center gap-3">
            <Diff className="text-blue-400" size={20} />
            <div>
              <h2 className="theme-text text-lg font-semibold">代码修改预览</h2>
              {instruction && (
                <p className="theme-text-subtle mt-0.5 text-xs">"{instruction}"</p>
              )}
            </div>
          </div>
          <button
            onClick={onReject}
            className="theme-button-ghost rounded p-1"
          >
            <X size={20} />
          </button>
        </div>

        {/* Stats */}
        <div className="theme-panel theme-border flex items-center gap-4 border-b px-4 py-2">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-green-400">+{diffStats.additions} 行</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-red-400">-{diffStats.deletions} 行</span>
          </div>
          <div className="theme-text-subtle ml-auto text-xs">
            {filePathStr}
          </div>
        </div>

        {/* Diff Editor */}
        <div className="flex-1 overflow-hidden" data-testid="diff-editor">
          <DiffEditor
            height="100%"
            language={actualLanguage}
            theme={getMonacoTheme(theme)}
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
              editorRef.current = editor;
            }}
          />
        </div>

        {/* Footer */}
        <div className="theme-panel-muted theme-border flex items-center justify-between rounded-b-lg border-t p-4">
          <button
            onClick={() => onRejectRef.current()}
            className="theme-button-secondary flex items-center gap-2 rounded px-4 py-2 text-sm"
            data-testid="reject-diff-button"
          >
            <XCircle size={16} />
            <span>拒绝 (Reject)</span>
          </button>

          <div className="flex gap-2">
            <button
              onClick={() => {
                onAcceptRef.current();
                toast.success('已应用代码修改');
              }}
              className="theme-button-success flex items-center gap-2 rounded px-4 py-2 text-sm"
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
