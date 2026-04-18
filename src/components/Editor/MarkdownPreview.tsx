/**
 * Markdown 预览组件
 * v0.2.6 新增：支持 Markdown 文件预览
 * 使用 react-markdown 和 react-syntax-highlighter
 */

import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight, vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { useSettingsStore } from '../../stores/settingsStore';
import { isDarkTheme } from '../../utils/theme';

interface MarkdownPreviewProps {
  content: string;
  className?: string;
}

/**
 * Markdown 预览组件
 * 支持标准 Markdown 语法、GFM（GitHub Flavored Markdown）和代码高亮
 */
export const MarkdownPreview: React.FC<MarkdownPreviewProps> = ({ content, className = '' }) => {
  const theme = useSettingsStore(state => state.theme);
  const dark = isDarkTheme(theme);
  const components = useMemo(() => ({
    // 代码块语法高亮
    code({ node, inline, className, children, ...props }: any) {
      const match = /language-(\w+)/.exec(className || '');
      const language = match ? match[1] : '';

      return !inline && language ? (
        <SyntaxHighlighter
          style={dark ? vscDarkPlus : oneLight}
          language={language}
          PreTag="div"
          customStyle={{
            borderRadius: '0.375rem',
            fontSize: '0.875rem',
            lineHeight: '1.5',
            backgroundColor: 'var(--code-bg)',
            border: '1px solid var(--border-color)',
          }}
          {...props}
        >
          {String(children).replace(/\n$/, '')}
        </SyntaxHighlighter>
      ) : (
        <code className={`${className} theme-code-inline theme-text-accent rounded px-1.5 py-0.5 text-sm font-mono`} {...props}>
          {children}
        </code>
      );
    },
    // 标题样式
    h1({ children }: any) {
      return <h1 className="text-3xl font-bold mb-4 pb-2 border-b theme-border theme-text">{children}</h1>;
    },
    h2({ children }: any) {
      return <h2 className="text-2xl font-bold mb-3 pb-2 border-b theme-border theme-text">{children}</h2>;
    },
    h3({ children }: any) {
      return <h3 className="text-xl font-bold mb-2 theme-text">{children}</h3>;
    },
    h4({ children }: any) {
      return <h4 className="text-lg font-semibold mb-2 theme-text">{children}</h4>;
    },
    h5({ children }: any) {
      return <h5 className="text-base font-semibold mb-2 theme-text">{children}</h5>;
    },
    h6({ children }: any) {
      return <h6 className="text-sm font-semibold mb-2 theme-text-subtle">{children}</h6>;
    },
    // 段落
    p({ children }: any) {
      return <p className="mb-4 leading-7 theme-text-muted">{children}</p>;
    },
    // 列表
    ul({ children }: any) {
      return <ul className="list-disc list-inside mb-4 space-y-2 theme-text-muted">{children}</ul>;
    },
    ol({ children }: any) {
      return <ol className="list-decimal list-inside mb-4 space-y-2 theme-text-muted">{children}</ol>;
    },
    li({ children }: any) {
      return <li className="leading-7">{children}</li>;
    },
    // 链接
    a({ href, children }: any) {
      return (
        <a
          href={href}
          className="theme-text-accent underline underline-offset-2 transition-opacity hover:opacity-80"
          target="_blank"
          rel="noopener noreferrer"
        >
          {children}
        </a>
      );
    },
    // 引用
    blockquote({ children }: any) {
      return (
        <blockquote className="border-l-4 theme-border pl-4 py-2 mb-4 theme-panel-muted italic theme-text-subtle">
          {children}
        </blockquote>
      );
    },
    // 水平线
    hr() {
      return <hr className="theme-border my-6" />;
    },
    // 表格
    table({ children }: any) {
      return (
        <div className="overflow-x-auto mb-4">
          <table className="min-w-full border-collapse border theme-border">{children}</table>
        </div>
      );
    },
    thead({ children }: any) {
      return <thead className="theme-panel-muted">{children}</thead>;
    },
    tbody({ children }: any) {
      return <tbody className="divide-y theme-border">{children}</tbody>;
    },
    tr({ children }: any) {
      return <tr className="theme-soft-hover">{children}</tr>;
    },
    th({ children }: any) {
      return <th className="px-4 py-2 text-left text-sm font-semibold theme-text-muted border theme-border">{children}</th>;
    },
    td({ children }: any) {
      return <td className="px-4 py-2 text-sm theme-text-muted border theme-border">{children}</td>;
    },
    // 图片
    img({ src, alt }: any) {
      return (
        <img
          src={src}
          alt={alt}
          className="max-w-full h-auto rounded-lg my-4"
          loading="lazy"
        />
      );
    },
    // 强调
    strong({ children }: any) {
      return <strong className="font-bold theme-text">{children}</strong>;
    },
    em({ children }: any) {
      return <em className="italic theme-text-muted">{children}</em>;
    },
    // 删除线
    del({ children }: any) {
      return <del className="line-through theme-text-subtle">{children}</del>;
    },
  }), [dark]);

  const plugins = useMemo(() => [
    remarkGfm, // GitHub Flavored Markdown (tables, strikethrough, tasklists, autolinks)
    remarkBreaks, // 将单个换行符转换为 <br>
  ], []);

  return (
    <div className={`markdown-preview ${className}`}>
      <div className={`max-w-none ${dark ? 'prose prose-invert' : 'prose prose-slate'}`}>
        <ReactMarkdown
          components={components}
          remarkPlugins={plugins}
        >
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
};

export default MarkdownPreview;
