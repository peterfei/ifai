import React, { useState, useEffect, useRef } from 'react';
import { File, Search } from 'lucide-react';
import { useFileStore } from '../../stores/fileStore';
import clsx from 'clsx';

interface FuzzyFileSearchProps {
  filter: string;
  onSelect: (filePath: string) => void;
  onClose: () => void;
}

/**
 * v0.3.5: 顶级文件引用系统 - 模糊搜索列表
 */
export const FuzzyFileSearch = React.forwardRef((props: FuzzyFileSearchProps, ref: React.Ref<any>) => {
  const { filter, onSelect, onClose } = props;
  const [results, setResults] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // 从 fileStore 响应式获取所有文件
  const allFilePaths = useFileStore(s => s.allFilePaths);
  
  useEffect(() => {
    const searchStr = filter.startsWith('@') ? filter.slice(1).toLowerCase() : filter.toLowerCase();
    
    // 如果 store 为空，尝试回退到物理全局变量
    const sourceList = allFilePaths.length > 0 ? allFilePaths : ((window as any).__IFAI_ALL_FILES__ || []);
    
    const filtered = sourceList
      .filter((f: string) => f.toLowerCase().includes(searchStr))
      .slice(0, 10);
      
    setResults(filtered);
    setSelectedIndex(0);
  }, [filter, allFilePaths]);

  // 🏆 v0.4.1: 通过 Imperative Handle 暴露键盘处理逻辑给父组件
  React.useImperativeHandle(ref, () => ({
    handleKeyDown: (e: React.KeyboardEvent | KeyboardEvent) => {
      if (results.length === 0) return false;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % Math.max(1, results.length));
        return true;
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + results.length) % Math.max(1, results.length));
        return true;
      } else if (e.key === 'Enter' && results.length > 0) {
        e.preventDefault();
        onSelect(results[selectedIndex]);
        return true;
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return true;
      }
      return false;
    }
  }));

  if (results.length === 0 && filter.length > 1) {
    return (
      <div className="theme-panel-elevated theme-border theme-shadow absolute bottom-full left-0 mb-2 w-64 rounded-lg border p-3 text-xs italic animate-in fade-in slide-in-from-bottom-2">
        未找到匹配文件...
      </div>
    );
  }

  if (results.length === 0) return null;

  return (
    <div 
      ref={containerRef}
      data-testid="file-mention-panel"
      className="theme-panel-elevated theme-border theme-shadow absolute bottom-full left-0 mb-2 w-80 overflow-hidden rounded-xl border backdrop-blur-xl animate-in fade-in slide-in-from-bottom-2 z-50"
    >
      <div className="theme-panel-muted theme-border flex items-center gap-2 border-b p-2">
        <Search size={12} className="text-[var(--info-color)]" />
        <span className="theme-text-subtle text-[10px] font-bold uppercase tracking-wider">引用文件 (@)</span>
      </div>
      <div className="max-h-60 overflow-y-auto py-1">
        {results.map((file, index) => (
          <div
            key={file}
            data-testid={`mention-item-${index}`}
            onClick={() => onSelect(file)}
            className={clsx(
              "px-3 py-2 flex items-center gap-3 cursor-pointer transition-all duration-200",
              index === selectedIndex ? "bg-blue-600/15 border-l-2 border-blue-500" : "theme-soft-hover border-l-2 border-transparent"
            )}
          >
            <div className={clsx(
              "p-1.5 rounded-lg border",
              index === selectedIndex
                ? "bg-blue-500 border-blue-500 text-white"
                : "theme-panel-muted theme-border theme-text-subtle"
            )}>
              <File size={14} />
            </div>
            <div className="flex flex-col min-w-0">
              <span className={clsx(
                "text-sm truncate",
                index === selectedIndex
                  ? "text-blue-500 font-medium"
                  : "theme-text"
              )}>
                {file.split('/').pop()}
              </span>
              <span className="theme-text-subtle text-[10px] truncate">{file}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});
