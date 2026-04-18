/**
 * BashConsoleOutput - 工业级控制台输出组件
 * 用于显示bash命令的执行结果，模拟真实的控制台样式
 */

import React, { useState, useRef, useEffect } from 'react';
import { Copy, Check, Terminal, Maximize2, Minimize2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface BashConsoleOutputProps {
  output: string;
  command?: string;
  exitCode?: number;
  success?: boolean;
  className?: string;
}

interface LogLine {
  lineNumber: number;
  content: string;
  timestamp: string;
}

export const BashConsoleOutput: React.FC<BashConsoleOutputProps> = ({
  output,
  command,
  exitCode,
  success,
  className = ''
}) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const isFailed = typeof success === 'boolean' ? !success : exitCode !== undefined ? exitCode !== 0 : false;

  // 解析输出为行
  const parseOutput = (text: string): LogLine[] => {
    if (!text) return [];

    const lines = text.split('\n');
    const now = Date.now();

    return lines.map((line, index) => ({
      lineNumber: index + 1,
      content: line || '\u00A0', // 使用不间断空格保持空行
      timestamp: new Date(now + index).toISOString().substr(11, 12)
    }));
  };

  const logLines = parseOutput(output);

  // 复制到剪贴板
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  // 切换展开/收起
  const toggleExpanded = () => {
    setExpanded(!expanded);
  };

  // 滚动到底部（当输出更新时）
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [output]);

  if (!output) {
    return (
      <div className="flex items-center justify-center p-8 theme-text-subtle text-sm">
        <Terminal className="w-5 h-5 mr-2 opacity-50" />
        <span>{t('bashConsoleOutput.empty')}</span>
      </div>
    );
  }

  return (
    <div className={`bash-console-output theme-panel theme-border overflow-hidden rounded-xl border ${className}`}>
      {/* 控制台头部 */}
      <div className="theme-panel-muted theme-border flex items-center justify-between border-b px-4 py-2">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 theme-text-subtle" />
          <span className="text-xs font-medium theme-text-muted">{t('bashConsoleOutput.title')}</span>
          {exitCode !== undefined && (
            <span className={`rounded px-2 py-0.5 text-[10px] font-mono font-bold ${
              exitCode === 0 ? 'theme-badge-success' : 'theme-badge-danger'
            }`}>
              {t('bashConsoleOutput.exitCode', { code: exitCode })}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={toggleExpanded}
            className="p-1.5 theme-button-ghost rounded transition-all"
            title={expanded ? t('bashConsoleOutput.collapse') : t('bashConsoleOutput.expand')}
          >
            {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>

          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-2 py-1 theme-button-ghost rounded transition-all text-xs"
            title={t('conversation.summary.copy')}
          >
            {copied ? (
              <>
                <Check size={12} className="theme-text-success" />
                <span className="theme-text-success">{t('conversation.summary.copied')}</span>
              </>
            ) : (
              <>
                <Copy size={12} />
                <span>{t('conversation.summary.copy')}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* 控制台内容 */}
      <div
        ref={contentRef}
        role="log"
        aria-live="polite"
        className={`theme-code-surface p-4 font-mono text-xs overflow-auto ${expanded ? 'max-h-[600px]' : 'max-h-96'}`}
        style={{
          fontFamily: "'Menlo', 'Monaco', 'Courier New', monospace",
          WebkitFontSmoothing: 'antialiased',
          MozOsxFontSmoothing: 'grayscale',
          backgroundImage: isFailed
            ? 'linear-gradient(180deg, var(--danger-soft-bg) 0%, var(--code-bg) 140px)'
            : undefined,
        }}
      >
        {/* 命令行显示 */}
        {command && (
          <div className="mb-3 pb-3 border-b theme-border">
            <span className={isFailed ? 'theme-text-danger font-bold' : 'theme-text-success font-bold'}>$</span>
            <span className="ml-2 theme-text">{command}</span>
          </div>
        )}

        {/* 输出行 */}
        <div className="space-y-0.5">
          {logLines.map((line, index) => (
            <div
              key={index}
              className={`group flex items-start -mx-1 rounded px-1 py-0.5 transition-colors ${
                isFailed ? 'hover:bg-[var(--danger-soft-bg)]' : 'theme-soft-hover'
              }`}
            >
              {/* 行号 */}
              <span className="flex-shrink-0 w-12 text-right pr-3 theme-text-subtle font-mono select-none text-[10px] leading-5">
                {line.lineNumber}
              </span>

              {/* 时间戳 */}
              <span className="flex-shrink-0 w-20 theme-text-subtle font-mono select-none text-[10px] leading-5">
                {line.timestamp}
              </span>

              {/* 内容 */}
              <span className={`flex-1 leading-5 break-words font-mono whitespace-pre-wrap ${isFailed ? 'theme-text-danger' : 'theme-text-muted'}`}>
                {line.content}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 自定义滚动条样式 */}
      <style dangerouslySetInnerHTML={{ __html: `
        .bash-console-output ::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }

        .bash-console-output ::-webkit-scrollbar-track {
          background: var(--bg-secondary);
          border-radius: 4px;
        }

        .bash-console-output ::-webkit-scrollbar-thumb {
          background: var(--border-strong);
          border-radius: 4px;
          border: 2px solid transparent;
          background-clip: content-box;
        }

        .bash-console-output ::-webkit-scrollbar-thumb:hover {
          background: var(--text-subtle);
          border: 2px solid transparent;
          background-clip: content-box;
        }

        /* 选中文本样式 */
        .bash-console-output ::selection {
          background: var(--accent-soft-bg);
          color: var(--text-primary);
        }
      ` }} />
    </div>
  );
};

export default BashConsoleOutput;
