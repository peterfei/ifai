/**
 * 流式工具参数查看器
 * 使用 Markdown checkbox 样式，支持流式展开
 */

import React from 'react';
import { Check, Loader2, File, Folder, Terminal, Search, Settings } from 'lucide-react';

interface StreamingToolArgsViewerProps {
  args: Record<string, any>;
  isStreaming?: boolean;
  streamingKeys?: string[];
}

/**
 * 获取参数的图标
 */
function getArgIcon(key: string, value: any): React.ReactNode {
  const lowerKey = key.toLowerCase();

  if (lowerKey.includes('path') || lowerKey.includes('file')) {
    return typeof value === 'string' && value.includes('/') ? <Folder size={14} /> : <File size={14} />;
  }
  if (lowerKey.includes('command') || lowerKey.includes('cmd')) {
    return <Terminal size={14} />;
  }
  if (lowerKey.includes('search') || lowerKey.includes('query')) {
    return <Search size={14} />;
  }
  return <Settings size={14} />;
}

/**
 * 获取参数的显示颜色
 */
function getArgColor(key: string): string {
  const lowerKey = key.toLowerCase();

  if (lowerKey.includes('path') || lowerKey.includes('file')) {
    return 'text-green-400';
  }
  if (lowerKey.includes('command') || lowerKey.includes('cmd')) {
    return 'text-amber-400';
  }
  if (lowerKey.includes('content') || lowerKey.includes('data')) {
    return 'text-blue-400';
  }
  if (lowerKey.includes('url') || lowerKey.includes('link')) {
    return 'text-purple-400';
  }
  return 'text-gray-400';
}

/**
 * 格式化参数值
 */
function formatValue(value: any): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return value.toString();
  if (typeof value === 'string') {
    // 截断过长的字符串
    return value.length > 100 ? value.slice(0, 100) + '...' : value;
  }
  if (Array.isArray(value)) {
    return `[${value.length} items]`;
  }
  if (typeof value === 'object') {
    return `{${Object.keys(value).length} keys}`;
  }
  return String(value);
}

/**
 * 流式参数查看器主组件
 */
export const StreamingToolArgsViewer: React.FC<StreamingToolArgsViewerProps> = ({
  args,
  isStreaming = false,
  streamingKeys = []
}) => {
  const entries = Object.entries(args);

  if (entries.length === 0 && !isStreaming) {
    return (
      <div className="text-center py-4 text-gray-600">
        <Settings size={16} className="mx-auto mb-1 opacity-50" />
        <span className="text-xs">无参数</span>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {entries.map(([key, value]) => {
        const isKeyStreaming = isStreaming && streamingKeys.includes(key);
        const hasValue = value !== undefined && value !== null && value !== '';
        const icon = getArgIcon(key, value);
        const color = getArgColor(key);
        const displayValue = formatValue(value);

        return (
          <div
            key={key}
            className="flex items-start gap-2 text-xs py-1 hover:bg-gray-800/30 rounded px-2 transition-colors"
          >
            {/* Checkbox */}
            <div className="flex items-center gap-2 mt-0.5 flex-shrink-0">
              {isKeyStreaming ? (
                <div className="relative w-3.5 h-3.5">
                  <Loader2 size={14} className="text-blue-400 animate-spin" />
                </div>
              ) : (
                <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${
                  hasValue
                    ? 'bg-green-500/20 border-green-500/50'
                    : 'border-gray-600'
                }`}>
                  {hasValue && <Check size={12} className="text-green-400" />}
                </div>
              )}
            </div>

            {/* 参数名 */}
            <span className="text-gray-500 font-medium min-w-[70px] flex-shrink-0">{key}:</span>

            {/* 参数值 */}
            <div className="flex-1 flex items-center gap-1.5 min-w-0">
              <span className={color}>{icon}</span>
              {isKeyStreaming ? (
                <span className="text-gray-500 italic animate-pulse">生成中...</span>
              ) : (
                <span className="text-gray-300 font-mono truncate" title={String(value)}>
                  {displayValue}
                </span>
              )}
            </div>
          </div>
        );
      })}

      {/* 流式传输中提示 */}
      {isStreaming && entries.length === 0 && (
        <div className="flex items-center gap-2 text-xs text-gray-500 px-2 py-2">
          <Loader2 size={14} className="animate-spin text-blue-400" />
          <span className="italic">正在生成参数...</span>
        </div>
      )}
    </div>
  );
};
