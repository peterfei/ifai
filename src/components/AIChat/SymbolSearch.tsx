import React, { useState, useEffect, useRef } from 'react';
import { Code, Box, Search, Loader2 } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useFileStore } from '../../stores/fileStore';
import clsx from 'clsx';
import { useSettingsStore } from '../../stores/settingsStore';
import { isDarkTheme } from '../../utils/theme';

interface SymbolInfo {
  name: string;
  kind: string;
  line: number;
}

interface SymbolSearchProps {
  filter: string;
  onSelect: (symbol: SymbolInfo) => void;
  onClose: () => void;
}

/**
 * v0.3.5: 顶级符号引用系统 (#) - 模糊搜索列表
 */
export const SymbolSearch = React.forwardRef((props: SymbolSearchProps, ref: React.Ref<any>) => {
  const { filter, onSelect, onClose } = props;
  const [results, setResults] = useState<SymbolInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const theme = useSettingsStore(state => state.theme);
  const dark = isDarkTheme(theme);
  
  const activeFileId = useFileStore(s => s.activeFileId);
  const openedFiles = useFileStore(s => s.openedFiles);

  // 🚀 v0.3.5: 提取物理绝对路径 (组件级共享)
  const currentActiveFile = openedFiles.find(f => f.id === activeFileId);
  const filePath = currentActiveFile?.path || activeFileId || '';
  
  useEffect(() => {
    const fetchSymbols = async () => {
      if (!filePath) return;
      setLoading(true);

      try {
        const symbols = await invoke<SymbolInfo[]>('get_file_symbols', { path: filePath });
        const searchStr = filter.toLowerCase();
        
        const filtered = symbols
          .filter(s => s.name.toLowerCase().includes(searchStr))
          .slice(0, 10);
          
        setResults(filtered);
        setSelectedIndex(0);
      } catch (e) {
        console.error('[SymbolSearch] Failed:', e);
      } finally {
        setLoading(false);
      }
    };

    fetchSymbols();
  }, [filter, filePath]);

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

  return (
    <div 
      data-testid="symbol-mention-panel"
      className="absolute bottom-full left-0 mb-2 w-80 theme-panel-elevated backdrop-blur-xl border border-blue-500/20 rounded-xl theme-shadow overflow-hidden animate-in fade-in slide-in-from-bottom-2 z-50"
    >
      <div className="p-2 border-b theme-border bg-blue-500/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Code size={12} className="text-blue-400" />
          <span className="text-[10px] font-bold text-blue-500 uppercase tracking-wider">引用符号 (#)</span>
        </div>
        {loading && <Loader2 size={10} className="text-blue-400 animate-spin" />}
      </div>
      <div className="max-h-60 overflow-y-auto py-1">
        {results.length === 0 && !loading ? (
          <div className="px-4 py-6 text-center text-xs theme-text-subtle italic">
            {!filePath ? '请先在编辑器中打开一个文件...' : '未在当前文件中找到匹配符号...'}
          </div>
        ) : (
          results.map((symbol, index) => (
            <div
              key={`${symbol.name}-${index}`}
              data-testid={`mention-item-${index}`}
              onClick={() => onSelect(symbol)}
              className={clsx(
                "px-3 py-2 flex items-center gap-3 cursor-pointer transition-all duration-200",
                index === selectedIndex
                  ? 'bg-blue-500/10 border-l-2 border-blue-500'
                  : 'theme-soft-hover border-l-2 border-transparent'
              )}
            >
              <div className={clsx(
                "p-1.5 rounded-lg",
                index === selectedIndex
                  ? 'bg-blue-500 text-white'
                  : 'theme-panel-muted theme-text-subtle'
              )}>
                {symbol.kind === 'Class' || symbol.kind === 'Structure' ? <Box size={14} /> : <Code size={14} />}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-sm theme-text truncate font-mono">{symbol.name}</span>
                <span className="text-[10px] theme-text-subtle truncate">第 {symbol.line} 行 · {symbol.kind}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
});
