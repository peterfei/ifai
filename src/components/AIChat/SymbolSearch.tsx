import React, { useState, useEffect } from 'react';
import { Code, Box, Loader2 } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useFileStore } from '../../stores/fileStore';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
  const [results, setResults] = useState<SymbolInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  
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
      className="theme-panel-elevated theme-border theme-shadow absolute bottom-full left-0 mb-2 z-50 w-80 overflow-hidden rounded-xl border backdrop-blur-xl animate-in fade-in slide-in-from-bottom-2"
    >
      <div className="theme-panel-muted theme-border flex items-center justify-between border-b p-2">
        <div className="flex items-center gap-2">
          <Code size={12} className="theme-text-accent" />
          <span className="theme-text-accent text-[10px] font-bold uppercase tracking-wider">{t('aiChat.symbolSearch.title')}</span>
        </div>
        {loading && <Loader2 size={10} className="theme-text-accent animate-spin" />}
      </div>
      <div className="max-h-60 overflow-y-auto py-1">
        {results.length === 0 && !loading ? (
          <div className="px-4 py-6 text-center text-xs theme-text-subtle italic">
            {!filePath ? t('aiChat.symbolSearch.openFileFirst') : t('aiChat.symbolSearch.noMatches')}
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
                  ? 'theme-selection-accent border-l-2'
                  : 'theme-soft-hover border-l-2 border-transparent'
              )}
            >
              <div className={clsx(
                "p-1.5 rounded-lg border",
                index === selectedIndex
                  ? 'theme-button-primary border-transparent'
                  : 'theme-panel-muted theme-border theme-text-subtle'
              )}>
                {symbol.kind === 'Class' || symbol.kind === 'Structure' ? <Box size={14} /> : <Code size={14} />}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-sm theme-text truncate font-mono">{symbol.name}</span>
                <span className="text-[10px] theme-text-subtle truncate">{t('aiChat.symbolSearch.lineKind', { line: symbol.line, kind: symbol.kind })}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
});
