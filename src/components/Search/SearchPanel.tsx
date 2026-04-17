import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useFileStore } from '../../stores/fileStore';
import { useLayoutStore } from '../../stores/layoutStore';
import { Loader2, Search, X, ChevronDown, CaseSensitive, Regex, RotateCcw, Clock } from 'lucide-react';
import clsx from 'clsx';
import { readFileContent } from '../../utils/fileSystem';
import { v4 as uuidv4 } from 'uuid';
import { useTranslation } from 'react-i18next';
import { detectLanguageFromPath } from '../../utils/languageDetection';
import { useSettingsStore } from '../../stores/settingsStore';
import { isDarkTheme } from '../../utils/theme';

interface SearchResult {
  path: string;
  line_number: number;
  content: string;
}

interface SearchHistory {
  query: string;
  timestamp: number;
}

interface SearchOptions {
  caseSensitive: boolean;
  useRegex: boolean;
}

// Debounce hook
const useDebounce = <T,>(value: T, delay: number): T => {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
};

// Format timestamp to human-readable time ago
const formatTimeAgo = (timestamp: number): string => {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
};

// Highlight matching text in result
const highlightMatch = (
  text: string,
  query: string,
  caseSensitive: boolean,
  useRegex: boolean,
  dark: boolean,
): React.ReactNode => {
  if (!query) return text;

  try {
    let regex: RegExp;
    if (useRegex) {
      regex = new RegExp(`(${query})`, caseSensitive ? 'g' : 'gi');
    } else {
      const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      regex = new RegExp(`(${escapedQuery})`, caseSensitive ? 'g' : 'gi');
    }

    const parts = text.split(regex);

    return parts.map((part, index) => {
      if (regex.test(part)) {
        return (
          <span
            key={index}
            className={dark ? 'bg-yellow-500/50 text-yellow-200 px-0.5 rounded' : 'bg-amber-200 text-amber-950 px-0.5 rounded'}
          >
            {part}
          </span>
        );
      }
      return <span key={index}>{part}</span>;
    });
  } catch (e) {
    // Invalid regex, return original text
    return text;
  }
};

export const SearchPanel = () => {
  const { t } = useTranslation();
  const theme = useSettingsStore(state => state.theme);
  const dark = isDarkTheme(theme);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const { rootPath, openFile } = useFileStore();
  const [options, setOptions] = useState<SearchOptions>({
    caseSensitive: false,
    useRegex: false
  });
  const [showOptions, setShowOptions] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [searchHistory, setSearchHistory] = useState<SearchHistory[]>([]);
  const [historyPosition, setHistoryPosition] = useState({ top: 0, left: 0 });
  const optionsRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  const historyButtonRef = useRef<HTMLButtonElement>(null);

  // Calculate dropdown position when history is shown
  useEffect(() => {
    if (showHistory && historyButtonRef.current) {
      const rect = historyButtonRef.current.getBoundingClientRect();
      setHistoryPosition({
        top: rect.bottom + 4,
        left: rect.left
      });
    }
  }, [showHistory]);

  // Load search history from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('search-history');
      if (saved) {
        setSearchHistory(JSON.parse(saved));
      }
    } catch (e) {
      console.error('Failed to load search history:', e);
    }
  }, []);

  // 检查是否有来自 CommandBar 的搜索查询
  useEffect(() => {
    const commandBarQuery = sessionStorage.getItem('commandbar-search-query');
    if (commandBarQuery) {
      // 清除存储，避免重复触发
      sessionStorage.removeItem('commandbar-search-query');
      // 设置查询并触发搜索
      setQuery(commandBarQuery);
      console.log('[SearchPanel] Received query from CommandBar:', commandBarQuery);
    }
  }, []);

  // Save search history to localStorage
  const saveToHistory = useCallback((q: string) => {
    if (!q.trim()) return;
    const newEntry: SearchHistory = {
      query: q,
      timestamp: Date.now()
    };
    setSearchHistory(prev => {
      const filtered = prev.filter(h => h.query !== q);
      const updated = [newEntry, ...filtered].slice(0, 10); // Keep last 10
      try {
        localStorage.setItem('search-history', JSON.stringify(updated));
      } catch (e) {
        console.error('Failed to save search history:', e);
      }
      return updated;
    });
  }, []);

  // Debounced search with 500ms delay
  const debouncedSearchValue = useDebounce(query, 500);

  // Perform search when debounced query or options change
  useEffect(() => {
    if (debouncedSearchValue !== debouncedQuery) {
      setDebouncedQuery(debouncedSearchValue);
      performSearch(debouncedSearchValue);
    }
  }, [debouncedSearchValue, options]);

  const performSearch = async (searchQuery: string) => {
    if (!searchQuery.trim() || !rootPath) {
      setResults([]);
      return;
    }

    setIsSearching(true);
    console.log('[Search] Searching for:', searchQuery, 'options:', options);
    try {
      const matches = await invoke<SearchResult[]>('search_in_files', {
        rootPath,
        query: searchQuery,
        caseSensitive: options.caseSensitive
      });
      console.log('[Search] Found matches:', matches.length);
      setResults(matches);
      // Always save to history, even if no results
      saveToHistory(searchQuery);
    } catch (err) {
      console.error('[Search] Search failed:', err);
      setResults([]);
      // Still save to history even on error
      saveToHistory(searchQuery);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    performSearch(query);
    setShowHistory(false);
  };

  const handleResultClick = async (result: SearchResult) => {
    console.log('[Search] Clicking result:', result);
    try {
      const content = await readFileContent(result.path);
      console.log('[Search] File content loaded, length:', content.length);

      const fileName = result.path.split('/').pop() || 'unknown';

      // v0.2.6: 使用统一的语言检测工具
      const language = detectLanguageFromPath(result.path);

      const openedId = openFile({
        id: uuidv4(),
        path: result.path,
        name: fileName,
        content,
        isDirty: false,
        language,
        initialLine: result.line_number
      });

      console.log('[Search] File opened with ID:', openedId);

      // Assign to active pane if available
      const { activePaneId, assignFileToPane } = useLayoutStore.getState();
      if (activePaneId) {
        console.log('[Search] Assigning to pane:', activePaneId);
        assignFileToPane(activePaneId, openedId);
      }
    } catch (e) {
      console.error('[Search] Failed to open file:', e);
      // Show error to user
      alert(`Failed to open file: ${result.path}\nError: ${String(e)}`);
    }
  };

  const clearSearch = () => {
    setQuery('');
    setResults([]);
  };

  const toggleOption = (key: keyof SearchOptions) => {
    setOptions(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (optionsRef.current && !optionsRef.current.contains(event.target as Node)) {
        setShowOptions(false);
      }
      if (historyRef.current && !historyRef.current.contains(event.target as Node)) {
        setShowHistory(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Get unique result count (by file)
  const uniqueFileCount = useMemo(() => {
    const uniquePaths = new Set(results.map(r => r.path));
    return uniquePaths.size;
  }, [results]);

  return (
    <div className="flex flex-col h-full theme-panel border-r theme-border w-full">
      {/* Header */}
      <div className="p-3 border-b theme-border">
        <div className="flex items-center justify-between mb-2">
          <span className="theme-text-subtle text-xs font-bold uppercase tracking-wider">
            {t('search.title')}
          </span>
          {results.length > 0 && (
            <span className="theme-text-subtle text-xs">
              {results.length} {results.length === 1 ? 'result' : 'results'} in {uniqueFileCount} {uniqueFileCount === 1 ? 'file' : 'files'}
            </span>
          )}
        </div>

        {/* Search Input */}
        <form onSubmit={handleSearch} className="relative mb-2">
          <input
            type="text"
            className="theme-input-surface theme-border w-full rounded border p-2 pl-3 pr-16 text-sm focus:outline-none focus:border-blue-500"
            placeholder={t('search.placeholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setShowHistory(true)}
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {query && (
              <button
                type="button"
                onClick={clearSearch}
                className="theme-button-ghost rounded p-1"
                title="Clear"
              >
                <X size={14} />
              </button>
            )}
            <button
              type="submit"
              className="theme-button-ghost rounded p-1"
              disabled={isSearching}
              title="Search"
            >
              {isSearching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            </button>
          </div>
        </form>

        {/* Options Bar */}
        <div className="flex items-center gap-1 relative">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowOptions(!showOptions);
            }}
            className="theme-button-ghost flex items-center gap-1 rounded px-2 py-1 text-xs"
            title="Search options"
          >
            <Regex size={12} />
            <span>Options</span>
            <ChevronDown size={12} className={`transition-transform ${showOptions ? 'rotate-180' : ''}`} />
          </button>

          {showOptions && (
            <div
              ref={optionsRef}
              className="theme-panel-elevated theme-border absolute top-full left-0 mt-1 rounded-lg border py-1 z-10 min-w-40 shadow-xl"
            >
              <div className="px-3 py-2">
                <button
                  onClick={() => toggleOption('caseSensitive')}
                  className="theme-hoverable theme-text-muted flex w-full items-center justify-between rounded px-1 py-1 text-sm"
                >
                  <span className="flex items-center gap-2">
                    <CaseSensitive size={14} />
                    Case sensitive
                  </span>
                  <div className={clsx('theme-input-surface theme-border flex h-4 w-4 items-center justify-center rounded border', options.caseSensitive && 'border-blue-600 bg-blue-600')}>
                    {options.caseSensitive && <span className="text-white text-xs">✓</span>}
                  </div>
                </button>
              </div>
              <div className="theme-border border-t px-3 py-2">
                <button
                  onClick={() => toggleOption('useRegex')}
                  className="theme-hoverable theme-text-muted flex w-full items-center justify-between rounded px-1 py-1 text-sm"
                >
                  <span className="flex items-center gap-2">
                    <Regex size={14} />
                    Regular expression
                  </span>
                  <div className={clsx('theme-input-surface theme-border flex h-4 w-4 items-center justify-center rounded border', options.useRegex && 'border-blue-600 bg-blue-600')}>
                    {options.useRegex && <span className="text-white text-xs">✓</span>}
                  </div>
                </button>
              </div>
            </div>
          )}

          <button
            ref={historyButtonRef}
            onClick={(e) => {
              e.stopPropagation();
              setShowHistory(!showHistory);
            }}
            className="theme-button-ghost flex items-center gap-1 rounded px-2 py-1 text-xs"
            title="Search history"
          >
            <Clock size={12} />
            <span>History</span>
            <ChevronDown size={12} className={`transition-transform ${showHistory ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* Search History Dropdown */}
        {showHistory && (
          <div
            ref={historyRef}
            className="theme-panel-elevated theme-border rounded-lg border shadow-2xl overflow-hidden max-h-80 overflow-y-auto backdrop-blur-sm"
            style={{
              position: 'fixed',
              top: `${historyPosition.top}px`,
              left: `${historyPosition.left}px`,
              minWidth: '300px',
              maxWidth: '400px',
              zIndex: 1000,
              boxShadow: 'var(--app-shadow)'
            }}
          >
            {searchHistory.length > 0 ? (
              <>
                {/* Header */}
                <div className="theme-panel-muted theme-border border-b px-4 py-2">
                  <span className="theme-text-subtle text-xs font-semibold uppercase tracking-wide">
                    Recent Searches
                  </span>
                </div>
                {/* History Items */}
                {searchHistory.map((item, index) => (
                  <button
                    key={index}
                    onClick={() => {
                      setQuery(item.query);
                      setShowHistory(false);
                      performSearch(item.query);
                    }}
                    className="theme-soft-hover theme-border group w-full border-b px-4 py-3 text-left text-sm transition-all duration-150 last:border-0"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {/* Search Icon */}
                        <svg className="theme-text-subtle h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <span className="theme-text truncate font-medium">
                          {item.query}
                        </span>
                      </div>
                      <span className="theme-text-subtle flex-shrink-0 text-xs">
                        {formatTimeAgo(item.timestamp)}
                      </span>
                    </div>
                  </button>
                ))}
              </>
            ) : (
              <div className="px-4 py-8 text-center">
                <svg className="theme-text-subtle mx-auto mb-3 h-12 w-12 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="theme-text-subtle text-sm">No search history yet</p>
                <p className="theme-text-subtle mt-1 text-xs opacity-80">Start searching to build history</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {results.length > 0 ? (
          results.map((result, index) => (
            <div
              key={index}
              className="theme-hoverable theme-border cursor-pointer border-b p-2 transition-colors"
              onClick={() => handleResultClick(result)}
            >
              <div className="text-xs text-blue-400 truncate mb-1" title={result.path}>
                {result.path.replace(rootPath || '', '').substring(1)}
              </div>
              <div className="theme-text text-xs font-mono">
                <span className="theme-text-subtle mr-2 select-none">{result.line_number}:</span>
                {highlightMatch(result.content.trim(), query, options.caseSensitive, options.useRegex, dark)}
              </div>
            </div>
          ))
        ) : null}

        {!isSearching && results.length === 0 && query && (
          <div className="p-4 text-center">
            <p className="theme-text-subtle mb-2 text-xs">{t('search.noResults')}</p>
            {options.useRegex && (
              <p className="theme-text-subtle text-xs opacity-80">Tip: Check your regex syntax</p>
            )}
          </div>
        )}

        {!rootPath && (
          <div className="theme-text-subtle p-4 text-center text-xs">
            {t('search.openFolder')}
          </div>
        )}
      </div>
    </div>
  );
};
