import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import { FileCode, CheckCircle, Clock, Loader } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { MessageCardProps } from '../../gui/conversation/MessageCardRegistry';
import { toolApprovalRegistry } from '../../core/approval/ToolApprovalRegistry';
import styles from './StreamingCodeCard.module.css';

/* ===== 常量 ===== */

const STREAM_RENDER_CONFIG = {
  MAX_RENDER_LINES: 50,
  MAX_CHAR_LIMIT: 500000,
  PATH_ABBREVIATE_THRESHOLD: 40,
  RAF_THROTTLE_MS: 16,
} as const;

/* ===== 类型 ===== */

export interface FileWriteItem {
  id: string;
  toolName: string;
  arguments: string;
  isPartial: boolean;
  status?: 'waiting' | 'streaming' | 'ready' | 'approved' | 'rejected';
}

type FileWriteState = 'streaming' | 'ready' | 'waiting';

interface ExtractedContent {
  path?: string;
  content?: string;
  isComplete: boolean;
}

/* ===== 工具函数 ===== */

/**
 * 从 ToolCall arguments JSON 中提取 path 和 content
 * 优先 JSON.parse，失败则用子串查找兜底（支持不完整 JSON 流式场景）
 */
function extractStreamContent(
  argsStr: string,
  pathKey: string,
  contentKey: string,
): ExtractedContent {
  if (!argsStr || argsStr.trim().length === 0) {
    return { isComplete: false };
  }

  try {
    const parsed = JSON.parse(argsStr);
    return {
      path: parsed[pathKey],
      content: parsed[contentKey],
      isComplete: true,
    };
  } catch {
    // JSON 不完整（流式中）— 用子串查找提取，不要求闭合引号
    let path: string | undefined;
    let content: string | undefined;

    // 提取 path: 查找 "pathKey": "value" 或 "pathKey": "value（未闭合）
    const pathMarker = `"${pathKey}"`;
    const pathIdx = argsStr.indexOf(pathMarker);
    if (pathIdx !== -1) {
      const colonIdx = argsStr.indexOf(':', pathIdx + pathMarker.length);
      if (colonIdx !== -1) {
        const quoteStart = argsStr.indexOf('"', colonIdx + 1);
        if (quoteStart !== -1) {
          // 找到闭合引号或取到下一个键/结尾
          const afterQuote = quoteStart + 1;
          const closingQuote = argsStr.indexOf('"', afterQuote);
          if (closingQuote !== -1) {
            path = argsStr.substring(afterQuote, closingQuote)
              .replace(/\\n/g, '\n').replace(/\\"/g, '"');
          } else {
            path = argsStr.substring(afterQuote)
              .replace(/\\n/g, '\n').replace(/\\"/g, '"');
          }
        }
      }
    }

    // 提取 content: 查找 "contentKey": "value（可能未闭合）
    const contentMarker = `"${contentKey}"`;
    const contentIdx = argsStr.indexOf(contentMarker);
    if (contentIdx !== -1) {
      const colonIdx = argsStr.indexOf(':', contentIdx + contentMarker.length);
      if (colonIdx !== -1) {
        const quoteStart = argsStr.indexOf('"', colonIdx + 1);
        if (quoteStart !== -1) {
          const afterQuote = quoteStart + 1;
          // 流式 JSON 中 content 值可能没有闭合引号
          // 直接取到最后一个可能的 JSON 结束符之前
          let raw = argsStr.substring(afterQuote);
          // 移除末尾的未闭合引号或结束括号
          raw = raw.replace(/"\s*\}?$/, '').replace(/\s*$/, '');
          content = raw
            .replace(/\\n/g, '\n')
            .replace(/\\t/g, '\t')
            .replace(/\\"/g, '"')
            .replace(/\\\\/g, '\\');
        }
      }
    }

    return { path, content, isComplete: false };
  }
}

/** 缩写长路径 */
function abbreviatePath(path: string, threshold = STREAM_RENDER_CONFIG.PATH_ABBREVIATE_THRESHOLD): string {
  if (!path || path.length <= threshold) return path || '';
  const parts = path.split(/[/\\]/);
  const filename = parts[parts.length - 1];
  return `.../${filename}`;
}

/** 截断行数，只保留最后 N 行 */
function truncateLines(code: string, maxLines: number): { lines: string; truncated: number } {
  const allLines = code.split('\n');
  if (allLines.length <= maxLines) return { lines: code, truncated: 0 };
  const kept = allLines.slice(allLines.length - maxLines);
  return { lines: kept.join('\n'), truncated: allLines.length - maxLines };
}

/** 基础语法高亮（轻量，用于 <pre> 渲染） */
function highlightCode(code: string): string {
  return code
    // 转义 HTML
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // 注释
    .replace(/(\/\/.*$)/gm, '<span class="hlComment">$1</span>')
    .replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="hlComment">$1</span>')
    .replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="hlComment">$1</span>')
    // 字符串（双引号、单引号、反引号）
    .replace(/(&quot;|"|')((?:(?!\1)[^\\]|\\.)*?)(\1)/g, '<span class="hlString">$1$2$3</span>')
    .replace(/(`(?:[^`\\]|\\.)*`)/g, '<span class="hlString">$1</span>')
    // HTML 标签
    .replace(/(&lt;\/?[a-zA-Z][a-zA-Z0-9-]*)/g, '<span class="hlTag">$1</span>')
    // 关键字
    .replace(
      /\b(import|export|from|const|let|var|function|return|if|else|class|extends|interface|type|async|await|default|new|this|true|false|null|undefined)\b/g,
      '<span class="hlKeyword">$1</span>',
    )
    // 数字
    .replace(/\b(\d+\.?\d*)\b/g, '<span class="hlNumber">$1</span>');
}

/* ===== 主组件 ===== */

export function StreamingCodeCard({ message, onAction, compact }: MessageCardProps) {
  const { t } = useTranslation();

  // 从 message.toolCalls 中提取文件写入项
  const files: FileWriteItem[] = useMemo(() => {
    const toolCalls = (message as any).toolCalls;
    if (!toolCalls || !Array.isArray(toolCalls)) return [];

    return toolCalls
      .filter((tc: any) => {
        const toolName = tc.tool || tc.name || tc.function?.name;
        if (!toolApprovalRegistry.getStreamExtract(toolName)) return false;
        // 仅保留 isPartial=true（等待审批），已批准/完成的不显示
        return !!tc.isPartial;
      })
      .map((tc: any) => ({
        id: tc.id,
        toolName: tc.tool || tc.name || tc.function?.name,
        arguments: tc.function?.arguments || '',
        isPartial: tc.isPartial,
      }));
  }, [message]);

  if (files.length === 0) return null;

  const isBatch = files.length > 1;

  if (isBatch) {
    return <BatchMode files={files} message={message} onAction={onAction} compact={compact} />;
  }

  return (
    <SingleMode
      file={files[0]}
      messageId={(message as any).id}
      onAction={onAction}
      compact={compact}
    />
  );
}

/* ===== 单文件模式 ===== */

const SingleMode: React.FC<{
  file: FileWriteItem;
  messageId: string;
  onAction?: (action: string, data?: any) => void;
  compact?: boolean;
}> = ({ file, messageId, onAction, compact }) => {
  const { t } = useTranslation();
  const [displayContent, setDisplayContent] = useState('');
  const rafRef = useRef<number | null>(null);
  const contentRef = useRef(file.arguments);

  const extract = useMemo(() => {
    const config = toolApprovalRegistry.getStreamExtract(file.toolName);
    if (!config) return { path: undefined, content: undefined, isComplete: false };
    return extractStreamContent(file.arguments, config.path, config.content);
  }, [file.arguments, file.toolName]);

  const state: FileWriteState = file.isPartial
    ? extract.content
      ? 'streaming'
      : 'waiting'
    : 'ready';

  // rAF 节流更新显示内容
  useEffect(() => {
    contentRef.current = file.arguments;

    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    rafRef.current = requestAnimationFrame(() => {
      const config = toolApprovalRegistry.getStreamExtract(file.toolName);
      if (config) {
        const { content } = extractStreamContent(contentRef.current, config.path, config.content);
        setDisplayContent(content || '');
      }
    });

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [file.arguments, file.toolName]);

  // 性能保护
  const { renderedCode, truncatedCount } = useMemo(() => {
    if (!displayContent) return { renderedCode: '', truncatedCount: 0 };
    if (displayContent.length > STREAM_RENDER_CONFIG.MAX_CHAR_LIMIT) {
      return {
        renderedCode: t('aiChat.fileWrite.generating'),
        truncatedCount: 0,
      };
    }
    const { lines, truncated } = truncateLines(displayContent, STREAM_RENDER_CONFIG.MAX_RENDER_LINES);
    return { renderedCode: highlightCode(lines), truncatedCount: truncated };
  }, [displayContent, t]);

  const handleApprove = useCallback(() => {
    onAction?.('approve', { toolId: file.id });
  }, [onAction, file.id]);

  const handleReject = useCallback(() => {
    onAction?.('reject', { toolId: file.id });
  }, [onAction, file.id]);

  return (
    <div className={styles.card}>
      {/* 头部 */}
      <div className={styles.header}>
        <FileCode size={14} className={styles.headerIcon} />
        <span className={styles.headerPath} title={extract.path}>
          {extract.path ? abbreviatePath(extract.path) : '...'}
        </span>
      </div>

      {/* 代码预览 */}
      {displayContent ? (
        <div className={styles.codeArea}>
          {truncatedCount > 0 && (
            <div className={styles.codeTruncated}>
              {t('aiChat.fileWrite.truncated', { count: truncatedCount })}
            </div>
          )}
          <pre className={styles.codeContent}>
            <code dangerouslySetInnerHTML={{ __html: renderedCode }} />
            {state === 'streaming' && <span className={styles.cursor} />}
          </pre>
        </div>
      ) : (
        <div className={styles.emptyState}>
          <Clock size={14} style={{ marginRight: 6, opacity: 0.5 }} />
          {t('aiChat.fileWrite.waiting')}
        </div>
      )}

      {/* 状态栏 */}
      <div className={styles.statusBar}>
        <div className={styles.statusText}>
          <span
            className={`${styles.statusDot} ${
              state === 'streaming' ? styles.streaming : state === 'ready' ? styles.ready : styles.waiting
            }`}
          />
          {state === 'streaming' && (
            <span>{t('aiChat.fileWrite.streaming', { count: displayContent.length })}</span>
          )}
          {state === 'ready' && (
            <span>{t('aiChat.fileWrite.previewDone', { lines: displayContent.split('\n').length })}</span>
          )}
          {state === 'waiting' && <span>{t('aiChat.fileWrite.waiting')}</span>}
        </div>
      </div>

      {/* 审批按钮 — 仅在 isPartial=true（等待审批）时显示 */}
      {file.isPartial && extract.isComplete && (
        <div className={styles.approvalBar}>
          <button className={`${styles.btn} ${styles.btnReject}`} onClick={handleReject}>
            {t('aiChat.fileWrite.reject')}
          </button>
          <button className={`${styles.btn} ${styles.btnApprove}`} onClick={handleApprove}>
            {t('aiChat.fileWrite.approve')}
          </button>
        </div>
      )}
    </div>
  );
};

/* ===== 批量模式 ===== */

const BatchMode: React.FC<{
  files: FileWriteItem[];
  message: any;
  onAction?: (action: string, data?: any) => void;
  compact?: boolean;
}> = ({ files, message, onAction, compact }) => {
  const { t } = useTranslation();
  const [activeIndex, setActiveIndex] = useState(0);

  const completedCount = files.filter((f) => !f.isPartial).length;
  const activeFile = files[activeIndex] || files[0];

  const handleApprove = useCallback(() => {
    // 批量审批：approve all
    const toolIds = files.map((f) => f.id);
    onAction?.('approve', { toolIds });
  }, [onAction, files]);

  const handleReject = useCallback(() => {
    const toolIds = files.map((f) => f.id);
    onAction?.('reject', { toolIds });
  }, [onAction, files]);

  return (
    <div className={styles.card}>
      {/* 批量头部 */}
      <div className={styles.batchHeader}>
        <span className={styles.batchProgress}>
          {t('aiChat.fileWrite.batchProgress', { done: completedCount, total: files.length })}
        </span>
      </div>

      {/* 文件列表 */}
      <div className={styles.fileList}>
        {files.map((f, i) => {
          const config = toolApprovalRegistry.getStreamExtract(f.toolName);
          const { path } = config
            ? extractStreamContent(f.arguments, config.path, config.content)
            : { path: undefined };
          const isStreaming = f.isPartial && !!config;
          const isDone = !f.isPartial;
          const isActive = i === activeIndex;

          return (
            <div
              key={f.id}
              className={`${styles.fileItem} ${isActive ? styles.active : ''}`}
              onClick={() => setActiveIndex(i)}
            >
              {isDone ? (
                <CheckCircle size={13} className={styles.fileIcon} />
              ) : isStreaming ? (
                <Loader size={13} className={`${styles.fileIcon} ${styles.streaming}`} />
              ) : (
                <Clock size={13} className={styles.fileIcon} />
              )}
              <span className={styles.fileName} title={path}>
                {path ? abbreviatePath(path) : f.toolName}
              </span>
              <span className={styles.fileStatus}>
                {isDone ? t('aiChat.fileWrite.done') : isStreaming ? t('aiChat.fileWrite.streamingStatus') : t('aiChat.fileWrite.waitingStatus')}
              </span>
            </div>
          );
        })}
      </div>

      {/* 当前文件代码预览 */}
      <SingleMode
        file={activeFile}
        messageId={(message as any).id}
        onAction={undefined} // 批量模式下不使用单文件的审批
        compact={compact}
      />

      {/* 批量审批按钮 */}
      <div className={styles.approvalBar}>
        <button className={`${styles.btn} ${styles.btnReject}`} onClick={handleReject}>
          {t('aiChat.fileWrite.reject')}
        </button>
        <button className={`${styles.btn} ${styles.btnApprove}`} onClick={handleApprove}>
          {t('aiChat.fileWrite.approveAll')}
        </button>
      </div>
    </div>
  );
};
