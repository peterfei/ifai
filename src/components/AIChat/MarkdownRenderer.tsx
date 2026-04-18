import React, { useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import styles from './MessageItem.module.css';

interface MarkdownRendererProps {
  content: string;
  isStreaming?: boolean;
  maxLinesBeforeCollapse?: number;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  index?: number;
}

const prismTheme = {
  'code[class*="language-"]': {
    color: 'var(--text-secondary)',
    background: 'transparent',
    fontFamily: 'var(--font-mono)',
    fontSize: '12px',
    lineHeight: '1.6',
    textShadow: 'none',
  },
  'pre[class*="language-"]': {
    color: 'var(--text-secondary)',
    background: 'transparent',
    fontFamily: 'var(--font-mono)',
    fontSize: '12px',
    lineHeight: '1.6',
    textShadow: 'none',
  },
  comment: {
    color: 'var(--text-subtle)',
    fontStyle: 'italic',
  },
  prolog: { color: 'var(--text-subtle)' },
  doctype: { color: 'var(--text-subtle)' },
  cdata: { color: 'var(--text-subtle)' },
  punctuation: { color: 'var(--text-muted)' },
  property: { color: 'var(--info-color)' },
  tag: { color: 'var(--danger-color)' },
  boolean: { color: 'var(--warning-color)' },
  number: { color: 'var(--warning-color)' },
  constant: { color: 'var(--warning-color)' },
  symbol: { color: 'var(--warning-color)' },
  inserted: { color: 'var(--success-color)' },
  selector: { color: 'var(--info-color)' },
  'attr-name': { color: 'var(--info-color)' },
  string: { color: 'var(--success-color)' },
  char: { color: 'var(--success-color)' },
  builtin: { color: 'var(--accent-color)' },
  deleted: { color: 'var(--danger-color)' },
  operator: { color: 'var(--text-secondary)' },
  entity: { color: 'var(--accent-color)' },
  url: { color: 'var(--info-color)' },
  atrule: { color: 'var(--accent-color)' },
  'attr-value': { color: 'var(--success-color)' },
  keyword: { color: 'var(--accent-color)' },
  function: { color: 'var(--warning-color)' },
  'class-name': { color: 'var(--info-color)' },
  regex: { color: 'var(--warning-color)' },
  important: {
    color: 'var(--danger-color)',
    fontWeight: '600',
  },
  variable: { color: 'var(--text-primary)' },
};

/**
 * 统一的 Markdown 渲染器
 *
 * 关键设计原则：
 * 1. 流式和完成状态使用相同的样式，避免闪烁
 * 2. 使用 CSS Modules 隔离样式，防止全局污染
 * 3. 语法高亮在流式和完成状态都启用
 * 4. 使用 opacity 而非 display 控制可见性，避免布局跳动
 */
export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  isStreaming = false,
  maxLinesBeforeCollapse = 50,
  isExpanded = false,
  onToggleExpand,
  index = 0,
}) => {
  const { t } = useTranslation();
  // 检查是否需要折叠
  const shouldCollapse = !isStreaming && content.split('\n').length > maxLinesBeforeCollapse;

  // 准备显示内容
  const getDisplayContent = useCallback(() => {
    if (!shouldCollapse || isExpanded) {
      return content;
    }
    const lines = content.split('\n');
    return `${lines.slice(0, maxLinesBeforeCollapse).join('\n')}\n... (${t('aiChat.markdown.expandHint')})`;
  }, [content, shouldCollapse, isExpanded, maxLinesBeforeCollapse, t]);

  // Markdown 组件配置
  const markdownComponents = {
    p: ({ node, ...props }: any) => (
      <div {...props} className="mb-2 last:mb-0 theme-text-muted" />
    ),
    strong: ({ node, ...props }: any) => (
      <strong {...props} className="font-bold theme-text" />
    ),
    em: ({ node, ...props }: any) => (
      <em {...props} className="italic theme-text-muted" />
    ),
    h1: ({ node, ...props }: any) => (
      <h1 {...props} className="text-xl font-bold mb-2 theme-text" />
    ),
    h2: ({ node, ...props }: any) => (
      <h2 {...props} className="text-lg font-bold mb-2 theme-text" />
    ),
    h3: ({ node, ...props }: any) => (
      <h3 {...props} className="text-md font-bold mb-2 theme-text" />
    ),
    ul: ({ node, ...props }: any) => (
      <ul {...props} className="list-disc list-inside mb-2 theme-text-muted" />
    ),
    ol: ({ node, ...props }: any) => (
      <ol {...props} className="list-decimal list-inside mb-2 theme-text-muted" />
    ),
    li: ({ node, ...props }: any) => (
      <li {...props} className="ml-4" />
    ),
    a: ({ node, ...props }: any) => (
      <a
        {...props}
        className="theme-text-accent underline hover:text-[var(--accent-hover)]"
        target="_blank"
        rel="noopener noreferrer"
      />
    ),
    code: ({ node, className, children, ...rest }: any) => {
      const match = /language-(\w+)/.exec(className || '');
      const { inline } = rest as any;

      // 行内代码
      if (inline) {
        return (
          <code
            {...rest}
            className="px-1 py-0.5 theme-code-inline theme-text-muted rounded text-sm font-mono"
          >
            {children}
          </code>
        );
      }

      // 代码块 - 使用语法高亮
      const language = match ? match[1] : 'text';

      return (
        <div className="my-2">
          <SyntaxHighlighter
            {...rest}
            children={String(children).replace(/\n$/, '')}
            style={prismTheme}
            language={language}
            PreTag="div"
            wrapLines={true}
            customStyle={{
              margin: '0.5rem 0',        // 对应 my-2
              borderRadius: '0.375rem',   // 对应 rounded
              fontSize: '0.75rem',        // 12px，与 SimpleMarkdownRenderer 一致
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              display: 'block',
              padding: '1rem',            // 对应 p-4
              backgroundColor: 'var(--code-bg)',
              border: '1px solid var(--border-color)',
              minHeight: '60px',          // 确保最小高度一致，避免布局跳动
            }}
          />
        </div>
      );
    },
  };

  return (
    <div className={styles.markdownContent}>
      <ReactMarkdown
        children={getDisplayContent()}
        components={markdownComponents}
      />

      {/* 折叠按钮 - 仅在非流式状态且内容超过阈值时显示 */}
      {shouldCollapse && onToggleExpand && (
        <button
          onClick={onToggleExpand}
          className={styles.collapseButton}
        >
          {isExpanded ? (
            <>
              <ChevronUp size={12} />
              {t('aiChat.markdown.collapse', { count: content.split('\n').length })}
            </>
          ) : (
            <>
              <ChevronDown size={12} />
              {t('aiChat.markdown.expandAll', { count: content.split('\n').length })}
            </>
          )}
        </button>
      )}

      {/* 流式状态指示器 - 仅在流式状态时显示 */}
      {isStreaming && (
        <span className={styles.streamingIndicator}>
          <span className={styles.streamingDot} />
          {t('aiChat.markdown.streaming')}
        </span>
      )}
    </div>
  );
};

/**
 * 简化版 Markdown 渲染器 - 用于性能敏感场景
 * 不使用语法高亮，减少渲染开销
 */
export const SimpleMarkdownRenderer: React.FC<{ content: string }> = ({ content }) => {
  const markdownComponents = {
    p: ({ node, ...props }: any) => (
      <div {...props} className="mb-2 last:mb-0 theme-text-muted" />
    ),
    code: ({ node, className, children, ...rest }: any) => {
      const { inline } = rest as any;

      if (!inline) {
        // 代码块 - 无语法高亮
        // ⚡️ FIX: 统一代码块样式，与 SyntaxHighlighter 保持一致，避免布局跳动
        return (
          <pre className="whitespace-pre-wrap break-word text-[12px] font-mono theme-text-muted theme-code-surface p-4 rounded border theme-border my-2 overflow-x-auto min-h-[60px]">
            {String(children)}
          </pre>
        );
      }

      // 行内代码
      return (
        <code
          {...rest}
          className="px-1 py-0.5 theme-code-inline theme-text-muted rounded text-sm font-mono"
        >
          {children}
        </code>
      );
    },
    strong: ({ node, ...props }: any) => (
      <strong {...props} className="font-bold theme-text" />
    ),
    em: ({ node, ...props }: any) => (
      <em {...props} className="italic theme-text-muted" />
    ),
    ul: ({ node, ...props }: any) => (
      <ul {...props} className="list-disc list-inside mb-2 theme-text-muted" />
    ),
    ol: ({ node, ...props }: any) => (
      <ol {...props} className="list-decimal list-inside mb-2 theme-text-muted" />
    ),
    li: ({ node, ...props }: any) => (
      <li {...props} className="ml-4" />
    ),
    h1: ({ node, ...props }: any) => (
      <h1 {...props} className="text-xl font-bold mb-2 theme-text" />
    ),
    h2: ({ node, ...props }: any) => (
      <h2 {...props} className="text-lg font-bold mb-2 theme-text" />
    ),
    h3: ({ node, ...props }: any) => (
      <h3 {...props} className="text-md font-bold mb-2 theme-text" />
    ),
    a: ({ node, ...props }: any) => (
      <a
        {...props}
        className="theme-text-accent underline hover:text-[var(--accent-hover)]"
        target="_blank"
        rel="noopener noreferrer"
      />
    ),
  };

  return (
    <div className={`${styles.markdownContent} markdown-body`}>
      <ReactMarkdown
        children={content}
        components={markdownComponents}
      />
    </div>
  );
};

export default MarkdownRenderer;
