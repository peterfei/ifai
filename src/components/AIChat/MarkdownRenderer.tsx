import React, { useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { ChevronUp, ChevronDown } from 'lucide-react';
import styles from './MessageItem.module.css';

interface MarkdownRendererProps {
  content: string;
  isStreaming?: boolean;
  maxLinesBeforeCollapse?: number;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  index?: number;
}

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
  // 检查是否需要折叠
  const shouldCollapse = !isStreaming && content.split('\n').length > maxLinesBeforeCollapse;

  // 准备显示内容
  const getDisplayContent = useCallback(() => {
    if (!shouldCollapse || isExpanded) {
      return content;
    }
    const lines = content.split('\n');
    return lines.slice(0, maxLinesBeforeCollapse).join('\n') + '\n... (展开查看全部)';
  }, [content, shouldCollapse, isExpanded, maxLinesBeforeCollapse]);

  // Markdown 组件配置
  const markdownComponents = {
    p: ({ node, ...props }: any) => (
      <div {...props} className="mb-2 last:mb-0 text-gray-300" />
    ),
    strong: ({ node, ...props }: any) => (
      <strong {...props} className="font-bold text-white" />
    ),
    em: ({ node, ...props }: any) => (
      <em {...props} className="italic text-gray-200" />
    ),
    h1: ({ node, ...props }: any) => (
      <h1 {...props} className="text-xl font-bold mb-2 text-white" />
    ),
    h2: ({ node, ...props }: any) => (
      <h2 {...props} className="text-lg font-bold mb-2 text-white" />
    ),
    h3: ({ node, ...props }: any) => (
      <h3 {...props} className="text-md font-bold mb-2 text-white" />
    ),
    ul: ({ node, ...props }: any) => (
      <ul {...props} className="list-disc list-inside mb-2 text-gray-300" />
    ),
    ol: ({ node, ...props }: any) => (
      <ol {...props} className="list-decimal list-inside mb-2 text-gray-300" />
    ),
    li: ({ node, ...props }: any) => (
      <li {...props} className="ml-4" />
    ),
    a: ({ node, ...props }: any) => (
      <a
        {...props}
        className="text-blue-400 hover:text-blue-300 underline"
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
            className="px-1 py-0.5 bg-gray-800 text-gray-300 rounded text-sm font-mono"
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
            style={vscDarkPlus}
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
              backgroundColor: '#1e1e1e',
              border: '1px solid #374151',
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
              收起 ({content.split('\n').length} 行)
            </>
          ) : (
            <>
              <ChevronDown size={12} />
              展开全部 ({content.split('\n').length} 行)
            </>
          )}
        </button>
      )}

      {/* 流式状态指示器 - 仅在流式状态时显示 */}
      {isStreaming && (
        <span className={styles.streamingIndicator}>
          <span className={styles.streamingDot} />
          生成中...
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
      <div {...props} className="mb-2 last:mb-0 text-gray-300" />
    ),
    code: ({ node, className, children, ...rest }: any) => {
      const { inline } = rest as any;

      if (!inline) {
        // 代码块 - 无语法高亮
        // ⚡️ FIX: 统一代码块样式，与 SyntaxHighlighter 保持一致，避免布局跳动
        return (
          <pre className="whitespace-pre-wrap break-word text-[12px] font-mono text-gray-300 bg-[#1e1e1e] p-4 rounded border border-gray-700 my-2 overflow-x-auto min-h-[60px]">
            {String(children)}
          </pre>
        );
      }

      // 行内代码
      return (
        <code
          {...rest}
          className="px-1 py-0.5 bg-gray-800 text-gray-300 rounded text-sm font-mono"
        >
          {children}
        </code>
      );
    },
    strong: ({ node, ...props }: any) => (
      <strong {...props} className="font-bold text-white" />
    ),
    em: ({ node, ...props }: any) => (
      <em {...props} className="italic text-gray-200" />
    ),
    ul: ({ node, ...props }: any) => (
      <ul {...props} className="list-disc list-inside mb-2 text-gray-300" />
    ),
    ol: ({ node, ...props }: any) => (
      <ol {...props} className="list-decimal list-inside mb-2 text-gray-300" />
    ),
    li: ({ node, ...props }: any) => (
      <li {...props} className="ml-4" />
    ),
    h1: ({ node, ...props }: any) => (
      <h1 {...props} className="text-xl font-bold mb-2 text-white" />
    ),
    h2: ({ node, ...props }: any) => (
      <h2 {...props} className="text-lg font-bold mb-2 text-white" />
    ),
    h3: ({ node, ...props }: any) => (
      <h3 {...props} className="text-md font-bold mb-2 text-white" />
    ),
    a: ({ node, ...props }: any) => (
      <a
        {...props}
        className="text-blue-400 hover:text-blue-300 underline"
        target="_blank"
        rel="noopener noreferrer"
      />
    ),
  };

  return (
    <div className={styles.markdownContent}>
      <ReactMarkdown
        children={content}
        components={markdownComponents}
      />
    </div>
  );
};

export default MarkdownRenderer;
