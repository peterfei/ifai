/**
 * v0.2.8 Composer 2.0 - 多文件 Diff 预览组件
 *
 * 对标 Cursor 的 Composer 功能：
 * - 显示多文件变更预览
 * - 支持全部接受/拒绝
 * - 支持单个文件接受/拒绝
 * - 集成 Monaco Diff Editor
 */

import React, { useState, useEffect, useRef } from 'react';
import { DiffEditor as MonacoDiffEditor } from '@monaco-editor/react';
import './ComposerDiffView.css';

// ============================================================================
// 类型定义
// ============================================================================

export interface FileChange {
  /** 文件路径 */
  path: string;

  /** 新文件内容 */
  content: string;

  /** 原文件内容（用于 Diff） */
  originalContent?: string;

  /** 变更类型：added, modified, deleted */
  changeType?: 'added' | 'modified' | 'deleted';

  /** 是否已应用 */
  applied?: boolean;
}

export interface ComposerDiffViewProps {
  /** 所有文件变更 */
  changes: FileChange[];

  /** 全部接受回调 */
  onAcceptAll?: () => void;

  /** 全部拒绝回调 */
  onRejectAll?: () => void;

  /** 单个文件接受回调 */
  onAcceptFile?: (path: string) => void;

  /** 单个文件拒绝回调 */
  onRejectFile?: (path: string) => void;

  /** 关闭回调 */
  onClose?: () => void;
}

// ============================================================================
// ComposerDiffView 组件
// ============================================================================

export const ComposerDiffView: React.FC<ComposerDiffViewProps> = ({
  changes,
  onAcceptAll,
  onRejectAll,
  onAcceptFile,
  onRejectFile,
  onClose,
}) => {
  const [selectedPath, setSelectedPath] = useState<string>(changes[0]?.path || '');
  const [appliedFiles, setAppliedFiles] = useState<Set<string>>(new Set());

  // 获取当前选中的文件变更
  const selectedChange = changes.find(c => c.path === selectedPath);

  // 处理单个文件接受
  const handleAcceptFile = (path: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setAppliedFiles(prev => new Set(prev).add(path));
    onAcceptFile?.(path);
  };

  // 处理单个文件拒绝
  const handleRejectFile = (path: string, e: React.MouseEvent) => {
    e.stopPropagation();
    // 从已应用列表中移除
    setAppliedFiles(prev => {
      const newSet = new Set(prev);
      newSet.delete(path);
      return newSet;
    });
    onRejectFile?.(path);
  };

  // 处理全部接受
  const handleAcceptAll = () => {
    const allPaths = new Set(changes.map(c => c.path));
    setAppliedFiles(allPaths);
    onAcceptAll?.();
  };

  // 处理全部拒绝
  const handleRejectAll = () => {
    setAppliedFiles(new Set());
    onRejectAll?.();
  };

  // 🔥 同步外部 changes.applied 状态到本地 appliedFiles
  // 这样当父组件重置 applied 状态时，UI 也会正确更新
  useEffect(() => {
    const appliedFromProps = new Set(
      changes
        .filter(c => c.applied)
        .map(c => c.path)
    );
    setAppliedFiles(appliedFromProps);
  }, [changes]);

  // 获取变更类型图标
  const getChangeIcon = (change: FileChange) => {
    switch (change.changeType) {
      case 'added':
        return '➕';
      case 'deleted':
        return '🗑️';
      case 'modified':
      default:
        return '📝';
    }
  };

  // 获取变更类型样式
  const getChangeTypeClass = (change: FileChange) => {
    switch (change.changeType) {
      case 'added':
        return 'change-type-added';
      case 'deleted':
        return 'change-type-deleted';
      case 'modified':
      default:
        return 'change-type-modified';
    }
  };

  // 获取文件名显示
  const getFileName = (path: string) => {
    const parts = path.split('/');
    return parts[parts.length - 1] || path;
  };

  // 获取目录显示
  const getDirName = (path: string) => {
    const parts = path.split('/');
    return parts.slice(0, -1).join('/') || 'root';
  };

  if (changes.length === 0) {
    return (
      <div className="composer-diff-empty">
        <p>没有文件变更</p>
        {onClose && (
          <button onClick={onClose} className="btn-close">
            关闭
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="composer-diff-container">
      {/* 头部：标题和全局操作 */}
      <div className="composer-diff-header">
        <div className="composer-diff-title">
          <h3>代码变更预览</h3>
          <span className="file-count">{changes.length} 个文件</span>
        </div>

        <div className="composer-diff-actions">
          <button
            onClick={handleAcceptAll}
            className="btn-accept-all"
            title="接受所有变更"
          >
            ✓ 全部接受
          </button>
          <button
            onClick={handleRejectAll}
            className="btn-reject-all"
            title="拒绝所有变更"
          >
            ✗ 全部拒绝
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="btn-close"
              title="关闭"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* 主内容区：文件列表 + Diff 编辑器 */}
      <div className="composer-diff-body">
        {/* 左侧：文件列表 */}
        <div className="composer-file-list">
          {changes.map((change) => {
            const isSelected = change.path === selectedPath;
            const isApplied = appliedFiles.has(change.path);

            return (
              <div
                key={change.path}
                className={`composer-file-item ${isSelected ? 'selected' : ''} ${isApplied ? 'applied' : ''}`}
                onClick={() => setSelectedPath(change.path)}
              >
                <div className="file-item-main">
                  <span className="file-icon">{getChangeIcon(change)}</span>
                  <div className="file-info">
                    <div className="file-name" title={change.path}>
                      {getFileName(change.path)}
                    </div>
                    <div className="file-dir" title={change.path}>
                      {getDirName(change.path)}
                    </div>
                  </div>
                </div>

                {/* 单个文件操作按钮 */}
                <div className="file-item-actions">
                  {isApplied ? (
                    <>
                      <span className="applied-badge">已应用</span>
                      {/* 🔥 已应用的文件也可以拒绝（回滚） */}
                      <button
                        className="btn-reject-single"
                        onClick={(e) => handleRejectFile(change.path, e)}
                        title="拒绝此文件变更（回滚）"
                      >
                        ✗
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="btn-accept-single"
                        onClick={(e) => handleAcceptFile(change.path, e)}
                        title="接受此文件变更"
                      >
                        ✓
                      </button>
                      <button
                        className="btn-reject-single"
                        onClick={(e) => handleRejectFile(change.path, e)}
                        title="拒绝此文件变更"
                      >
                        ✗
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* 右侧：Diff 编辑器 */}
        <div className="composer-diff-editor">
          {selectedChange ? (
            <DiffEditor
              original={selectedChange.originalContent || ''}
              modified={selectedChange.content}
              language={getLanguage(selectedChange.path)}
              path={selectedChange.path}
              readOnly={true}
            />
          ) : (
            <div className="diff-empty">
              选择一个文件查看变更
            </div>
          )}
        </div>
      </div>

      {/* 底部：状态栏 */}
      <div className="composer-diff-footer">
        <div className="status-info">
          <span>已应用: {appliedFiles.size}/{changes.length}</span>
          {appliedFiles.size === changes.length && (
            <span className="all-applied-badge">✓ 所有变更已应用</span>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// DiffEditor 组件（Monaco Diff Editor）
// ============================================================================

interface DiffEditorProps {
  original: string;
  modified: string;
  language: string;
  path: string;
  readOnly?: boolean;
}

const DiffEditor: React.FC<DiffEditorProps> = ({
  original,
  modified,
  language,
  path,
  readOnly = true,
}) => {
  const [isMonacoLoaded, setIsMonacoLoaded] = useState(false);

  useEffect(() => {
    // Monaco 需要一点时间来初始化
    const timer = setTimeout(() => setIsMonacoLoaded(true), 100);
    return () => clearTimeout(timer);
  }, []);

  if (!isMonacoLoaded) {
    return (
      <div className="simple-diff-view">
        <div className="diff-header">
          <span className="diff-path">{path}</span>
          <span className="diff-language">{language}</span>
        </div>
        <div className="diff-content">
          <div className="diff-panel diff-original">
            <div className="diff-panel-title">原始内容</div>
            <pre>{original || '<空文件>'}</pre>
          </div>
          <div className="diff-panel diff-modified">
            <div className="diff-panel-title">新内容</div>
            <pre>{modified || '<空文件>'}</pre>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="monaco-diff-editor-wrapper">
      <MonacoDiffEditor
        key={`${path}-${language}`}
        language={language}
        original={original || ''}
        modified={modified || ''}
        theme="vs-dark"
        options={{
          readOnly: readOnly,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          wordWrap: 'on',
          lineNumbers: 'on',
          renderSideBySide: true,
          enableSplitViewResizing: false,
        }}
      />
    </div>
  );
};

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 根据文件路径检测编程语言
 */
function getLanguage(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'ts':
    case 'tsx':
      return 'typescript';
    case 'js':
    case 'jsx':
      return 'javascript';
    case 'rs':
      return 'rust';
    case 'py':
      return 'python';
    case 'go':
      return 'go';
    case 'java':
      return 'java';
    case 'cpp':
    case 'cc':
    case 'cxx':
    case 'hpp':
    case 'h':
      return 'cpp';
    case 'c':
      return 'c';
    case 'css':
      return 'css';
    case 'html':
    case 'htm':
      return 'html';
    case 'json':
      return 'json';
    case 'md':
      return 'markdown';
    case 'xml':
    case 'yaml':
    case 'yml':
      return ext;
    default:
      return 'plaintext';
  }
}

// ============================================================================
// 默认导出
// ============================================================================

export default ComposerDiffView;
