/**
 * BashConsoleOutput - 工业级控制台输出组件
 * 用于显示bash命令的执行结果，模拟真实的控制台样式
 */

import React, { useState, useRef, useEffect } from 'react';
import { Copy, Check, Terminal, Maximize2, Minimize2 } from 'lucide-react';

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
  success = true,
  className = ''
}) => {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

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
  const lineCount = logLines.length;

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
      <div className="flex items-center justify-center p-8 text-gray-500 text-sm">
        <Terminal className="w-5 h-5 mr-2 opacity-50" />
        <span>No output</span>
      </div>
    );
  }

  return (
    <div className={`bash-console-output ${className}`}>
      {/* 控制台头部 */}
      <div className="flex items-center justify-between px-4 py-2 bg-gradient-to-r from-gray-800 to-gray-900 border-b border-gray-700 rounded-t-xl">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-gray-400" />
          <span className="text-xs font-medium text-gray-300">Console Output</span>
          {exitCode !== undefined && (
            <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
              exitCode === 0
                ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                : 'bg-red-500/20 text-red-400 border border-red-500/30'
            }`}>
              Exit: {exitCode}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={toggleExpanded}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700/50 rounded transition-all"
            title={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>

          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-2 py-1 text-gray-400 hover:text-white hover:bg-gray-700/50 rounded transition-all text-xs"
            title="Copy to clipboard"
          >
            {copied ? (
              <>
                <Check size={12} className="text-green-400" />
                <span className="text-green-400">Copied!</span>
              </>
            ) : (
              <>
                <Copy size={12} />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* 控制台内容 */}
      <div
        ref={contentRef}
        className={`bg-gradient-to-br from-[#0a0a0a] to-[#1a1a1a] p-4 font-mono text-xs overflow-auto ${
          expanded ? 'max-h-[600px]' : 'max-h-96'
        }`}
        style={{
          fontFamily: "'Menlo', 'Monaco', 'Courier New', monospace",
          WebkitFontSmoothing: 'antialiased',
          MozOsxFontSmoothing: 'grayscale'
        }}
      >
        {/* 命令行显示 */}
        {command && (
          <div className="mb-3 pb-3 border-b border-gray-800">
            <span className="text-green-400 font-bold">$</span>
            <span className="ml-2 text-gray-200">{command}</span>
          </div>
        )}

        {/* 输出行 */}
        <div className="space-y-0.5">
          {logLines.map((line, index) => (
            <div
              key={index}
              className="group flex items-start hover:bg-gray-800/30 -mx-1 px-1 py-0.5 rounded transition-colors"
            >
              {/* 行号 */}
              <span className="flex-shrink-0 w-12 text-right pr-3 text-gray-600 font-mono select-none text-[10px] leading-5">
                {line.lineNumber}
              </span>

              {/* 时间戳 */}
              <span className="flex-shrink-0 w-20 text-gray-700 font-mono select-none text-[10px] leading-5">
                {line.timestamp}
              </span>

              {/* 内容 */}
              <span className="flex-1 text-gray-300 leading-5 break-words font-mono whitespace-pre-wrap">
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
          background: rgba(26, 26, 26, 0.5);
          border-radius: 4px;
        }

        .bash-console-output ::-webkit-scrollbar-thumb {
          background: rgba(102, 102, 102, 0.5);
          border-radius: 4px;
          border: 2px solid transparent;
          background-clip: content-box;
        }

        .bash-console-output ::-webkit-scrollbar-thumb:hover {
          background: rgba(120, 120, 120, 0.6);
          border: 2px solid transparent;
          background-clip: content-box;
        }

        /* 选中文本样式 */
        .bash-console-output ::selection {
          background: rgba(59, 130, 246, 0.3);
          color: #fff;
        }
      ` }} />
    </div>
  );
};

export default BashConsoleOutput;
