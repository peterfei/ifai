/**
 * 工具参数可视化组件
 * 将工具参数以工业级UI显示，而非原始JSON
 */

import React from 'react';
import { File, Folder, Terminal, Search, Settings, ChevronDown, ChevronRight } from 'lucide-react';

interface ToolArgsViewerProps {
  args: Record<string, any>;
  isPartial?: boolean;
}

/**
 * 获取参数的图标
 */
function getArgIcon(key: string, value: any): React.ReactNode {
  const lowerKey = key.toLowerCase();

  if (lowerKey.includes('path') || lowerKey.includes('file')) {
    return typeof value === 'string' && value.includes('/') ? <Folder size={12} /> : <File size={12} />;
  }
  if (lowerKey.includes('command') || lowerKey.includes('cmd')) {
    return <Terminal size={12} />;
  }
  if (lowerKey.includes('search') || lowerKey.includes('query')) {
    return <Search size={12} />;
  }
  return <Settings size={12} />;
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
 * 参数项组件
 */
function ArgItem({ propKey: key, value, depth = 0 }: { propKey: string; value: any; depth?: number }) {
  const [isExpanded, setIsExpanded] = React.useState(depth < 2);
  const hasChildren = typeof value === 'object' && value !== null && !Array.isArray(value);
  const isArray = Array.isArray(value);

  const icon = getArgIcon(key || '', value);
  const color = getArgColor(key || '');
  const displayValue = formatValue(value);

  if (hasChildren) {
    const entries = Object.entries(value);
    return (
      <div key={key} style={{ marginLeft: depth * 12 }}>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 py-1 px-2 hover:bg-gray-800/50 rounded transition-colors w-full text-left"
        >
          <span className="text-gray-500">
            {isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
          </span>
          <span className={color}>{icon}</span>
          <span className="text-[11px] text-gray-400 font-medium">{key}</span>
          <span className="text-[10px] text-gray-600 ml-auto">
            {entries.length} items
          </span>
        </button>
        {isExpanded && (
          <div className="ml-4 mt-1">
            {entries.map(([k, v]) => (
              <ArgItem key={k} propKey={k} value={v} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    );
  }

  if (isArray) {
    return (
      <div key={key} style={{ marginLeft: depth * 12 }}>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 py-1 px-2 hover:bg-gray-800/50 rounded transition-colors w-full text-left"
        >
          <span className="text-gray-500">
            {isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
          </span>
          <span className={color}>{icon}</span>
          <span className="text-[11px] text-gray-400 font-medium">{key}</span>
          <span className="text-[10px] text-gray-600 ml-auto">
            [{value.length} items]
          </span>
        </button>
        {isExpanded && value.length <= 20 && (
          <div className="ml-4 mt-1 space-y-0.5">
            {value.map((item: any, idx: number) => (
              <div key={idx} className="px-2 py-0.5 bg-gray-900/30 rounded text-[10px] text-gray-500 font-mono">
                {typeof item === 'string' ? `"${item.slice(0, 50)}${item.length > 50 ? '...' : ''}"` : formatValue(item)}
              </div>
            ))}
          </div>
        )}
        {isExpanded && value.length > 20 && (
          <div className="ml-4 mt-1 px-2 py-1 text-[10px] text-gray-600 italic">
            Array too large to display ({value.length} items)
          </div>
        )}
      </div>
    );
  }

  return (
    <div key={key} style={{ marginLeft: depth * 12 }} className="flex items-center gap-2 py-1 px-2 hover:bg-gray-800/50 rounded">
      <span className="w-3"></span>
      <span className={color}>{icon}</span>
      <span className="text-[11px] text-gray-500 font-medium">{key}:</span>
      <span className="text-[11px] text-gray-300 font-mono flex-1 truncate" title={String(value)}>
        {displayValue}
      </span>
    </div>
  );
}

/**
 * 工具参数可视化器主组件
 */
export const ToolArgsViewer: React.FC<ToolArgsViewerProps> = ({ args, isPartial }) => {
  const entries = Object.entries(args);

  if (entries.length === 0) {
    return (
      <div className="text-center py-6 text-gray-600">
        <Settings size={20} className="mx-auto mb-2 opacity-50" />
        <span className="text-xs">无参数</span>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {/* 参数列表 */}
      {entries.map(([key, value]) => (
        <ArgItem key={key} propKey={key} value={value} />
      ))}

      {/* 加载指示器 */}
      {isPartial && (
        <div className="flex items-center gap-2 px-2 py-2 mt-2 bg-blue-500/5 rounded border border-blue-500/20">
          <div className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
          </div>
          <span className="text-[10px] font-medium text-blue-400 animate-pulse">
            正在生成参数...
          </span>
        </div>
      )}
    </div>
  );
};

/**
 * 紧凑型参数查看器（用于批处理等场景）
 */
export const CompactToolArgsViewer: React.FC<ToolArgsViewerProps> = ({ args }) => {
  const entries = Object.entries(args);
  const previewCount = 3;

  return (
    <div className="space-y-1.5">
      {entries.slice(0, previewCount).map(([key, value]) => (
        <div key={key} className="flex items-center gap-2 text-[10px]">
          <span className="text-gray-500 font-medium min-w-[60px]">{key}:</span>
          <span className="text-gray-300 font-mono truncate flex-1" title={String(value)}>
            {formatValue(value)}
          </span>
        </div>
      ))}
      {entries.length > previewCount && (
        <div className="text-[10px] text-gray-600 italic px-2">
          +{entries.length - previewCount} more parameters
        </div>
      )}
    </div>
  );
};
