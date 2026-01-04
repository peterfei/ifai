/**
 * Markdown 预览组件
 * v0.2.6 新增：支持 Markdown 文件预览
 * 使用 react-markdown 和 react-syntax-highlighter
 */

import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';

interface MarkdownPreviewProps {
  content: string;
  className?: string;
}

/**
 * Markdown 预览组件
 * 支持标准 Markdown 语法、GFM（GitHub Flavored Markdown）和代码高亮
 */
export const MarkdownPreview: React.FC<MarkdownPreviewProps> = ({ content, className = '' }) => {
  const components = useMemo(() => ({
    // 代码块语法高亮
    code({ node, inline, className, children, ...props }: any) {
      const match = /language-(\w+)/.exec(className || '');
      const language = match ? match[1] : '';

      return !inline && language ? (
        <SyntaxHighlighter
          style={vscDarkPlus}
          language={language}
          PreTag="div"
          customStyle={{
            borderRadius: '0.375rem',
            fontSize: '0.875rem',
            lineHeight: '1.5',
          }}
          {...props}
        >
          {String(children).replace(/\n$/, '')}
        </SyntaxHighlighter>
      ) : (
        <code className={`${className} px-1.5 py-0.5 rounded bg-[#3c3c3c] text-pink-300 text-sm font-mono`} {...props}>
          {children}
        </code>
      );
    },
    // 标题样式
    h1({ children }: any) {
      return <h1 className="text-3xl font-bold mb-4 pb-2 border-b border-gray-700 text-white">{children}</h1>;
    },
    h2({ children }: any) {
      return <h2 className="text-2xl font-bold mb-3 pb-2 border-b border-gray-700 text-white">{children}</h2>;
    },
    h3({ children }: any) {
      return <h3 className="text-xl font-bold mb-2 text-white">{children}</h3>;
    },
    h4({ children }: any) {
      return <h4 className="text-lg font-semibold mb-2 text-white">{children}</h4>;
    },
    h5({ children }: any) {
      return <h5 className="text-base font-semibold mb-2 text-white">{children}</h5>;
    },
    h6({ children }: any) {
      return <h6 className="text-sm font-semibold mb-2 text-gray-400">{children}</h6>;
    },
    // 段落
    p({ children }: any) {
      return <p className="mb-4 leading-7 text-gray-300">{children}</p>;
    },
    // 列表
    ul({ children }: any) {
      return <ul className="list-disc list-inside mb-4 space-y-2 text-gray-300">{children}</ul>;
    },
    ol({ children }: any) {
      return <ol className="list-decimal list-inside mb-4 space-y-2 text-gray-300">{children}</ol>;
    },
    li({ children }: any) {
      return <li className="leading-7">{children}</li>;
    },
    // 链接
    a({ href, children }: any) {
      return (
        <a
          href={href}
          className="text-blue-400 hover:text-blue-300 underline"
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
        <blockquote className="border-l-4 border-gray-600 pl-4 py-2 mb-4 bg-gray-800/50 italic text-gray-400">
          {children}
        </blockquote>
      );
    },
    // 水平线
    hr() {
      return <hr className="border-gray-700 my-6" />;
    },
    // 表格
    table({ children }: any) {
      return (
        <div className="overflow-x-auto mb-4">
          <table className="min-w-full border-collapse border border-gray-700">{children}</table>
        </div>
      );
    },
    thead({ children }: any) {
      return <thead className="bg-gray-800">{children}</thead>;
    },
    tbody({ children }: any) {
      return <tbody className="divide-y divide-gray-700">{children}</tbody>;
    },
    tr({ children }: any) {
      return <tr className="hover:bg-gray-800/50">{children}</tr>;
    },
    th({ children }: any) {
      return <th className="px-4 py-2 text-left text-sm font-semibold text-gray-300 border border-gray-700">{children}</th>;
    },
    td({ children }: any) {
      return <td className="px-4 py-2 text-sm text-gray-300 border border-gray-700">{children}</td>;
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
      return <strong className="font-bold text-white">{children}</strong>;
    },
    em({ children }: any) {
      return <em className="italic text-gray-200">{children}</em>;
    },
    // 删除线
    del({ children }: any) {
      return <del className="line-through text-gray-500">{children}</del>;
    },
  }), []);

  const plugins = useMemo(() => [
    remarkGfm, // GitHub Flavored Markdown (tables, strikethrough, tasklists, autolinks)
    remarkBreaks, // 将单个换行符转换为 <br>
  ], []);

  return (
    <div className={`markdown-preview ${className}`}>
      <div className="prose prose-invert max-w-none">
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
