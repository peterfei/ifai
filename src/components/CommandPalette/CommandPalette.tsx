import React, { useState, useEffect, useRef, useMemo } from 'react';
import { X, File, MessageSquare } from 'lucide-react';
import { useLayoutStore } from '../../stores/layoutStore';
import { useFileStore } from '../../stores/fileStore';
import { useThreadStore } from '../../stores/threadStore';
import { switchThread } from '../../stores/useChatStore';
import { invoke } from '@tauri-apps/api/core';
import Fuse from 'fuse.js';
import { useTranslation } from 'react-i18next';

interface CommandPaletteProps {
  onSelect?: (path: string) => void;
}

// Unified result type for both files and threads
type SearchResult = {
  type: 'file' | 'thread';
  id: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  threadId?: string; // For thread results
  filePath?: string; // For file results
};

export const CommandPalette = ({ onSelect }: CommandPaletteProps) => {
  const { t } = useTranslation();
  const { isCommandPaletteOpen, setCommandPaletteOpen } = useLayoutStore();
  const { rootPath } = useFileStore();
  const threads = useThreadStore(state => state.threads);

  const [input, setInput] = useState('');
  const [allFilePaths, setAllFilePaths] = useState<string[]>([]);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const fileFuse = useRef<Fuse<string> | null>(null);
  const threadFuse = useRef<Fuse<SearchResult> | null>(null);

  // Parse input to detect prefix filters
  const parseInput = (query: string) => {
    const trimmed = query.trim();
    if (trimmed.startsWith('@')) {
      // File-only search
      return { mode: 'files' as const, searchQuery: trimmed.slice(1).trim() };
    } else if (trimmed.startsWith('#')) {
      // Thread-only search
      return { mode: 'threads' as const, searchQuery: trimmed.slice(1).trim() };
    } else {
      // Search both
      return { mode: 'both' as const, searchQuery: trimmed };
    }
  };

  // Format timestamp for display
  const formatThreadTimestamp = (timestamp: number): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return '刚刚';
    if (diffMins < 60) return `${diffMins}分钟前`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}小时前`;
    if (diffMins < 43200) return `${Math.floor(diffMins / 1440)}天前`;
    return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
  };

  // Convert threads to search results
  const threadResults = useMemo(() => {
    return Object.values(threads)
      .filter(t => t.status === 'active')
      .map(thread => ({
        type: 'thread' as const,
        id: thread.id,
        title: thread.title,
        subtitle: `${thread.messageCount} 条消息 • ${formatThreadTimestamp(thread.lastActiveAt)}`,
        icon: <MessageSquare size={16} />,
        threadId: thread.id,
      }));
  }, [threads]);

  useEffect(() => {
    if (isCommandPaletteOpen) {
      setSelectedIndex(0);
      inputRef.current?.focus();

      // Initialize file Fuse when palette opens
      if (rootPath) {
        const loadFilePaths = async () => {
          try {
            const paths = await invoke<string[]>('get_all_file_paths', { rootDir: rootPath });
            setAllFilePaths(paths);
            fileFuse.current = new Fuse(paths, { includeScore: true, ignoreLocation: true, threshold: 0.4 });
          } catch (e) {
            console.error("Failed to load file paths:", e);
          }
        };
        loadFilePaths();
      }

      // Initialize thread Fuse
      threadFuse.current = new Fuse(threadResults, {
        keys: ['title', 'subtitle'],
        includeScore: true,
        ignoreLocation: true,
        threshold: 0.4,
      });

      // Show initial results (recent threads + files)
      const initialResults: SearchResult[] = [
        ...threadResults.slice(0, 5),
        ...allFilePaths.slice(0, 5).map(path => ({
          type: 'file' as const,
          id: path,
          title: path.split('/').pop() || path,
          subtitle: path.replace(rootPath || '', '').substring(1) || path,
          icon: <File size={16} />,
          filePath: path,
        })),
      ];
      setResults(initialResults);
    } else {
      setInput('');
      setResults([]);
      setAllFilePaths([]);
      setSelectedIndex(0);
    }
  }, [isCommandPaletteOpen, rootPath, threadResults]);

  // Auto-scroll to selected item
  useEffect(() => {
    if (listRef.current && results.length > 0) {
      const selectedElement = listRef.current.children[selectedIndex] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [selectedIndex, results]);

  const handleClose = () => {
    setCommandPaletteOpen(false);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setInput(query);
    setSelectedIndex(0);

    const { mode, searchQuery } = parseInput(query);

    if (searchQuery === '') {
      // Show initial results when query is empty
      const initialResults: SearchResult[] = [
        ...threadResults.slice(0, 5),
        ...allFilePaths.slice(0, 5).map(path => ({
          type: 'file' as const,
          id: path,
          title: path.split('/').pop() || path,
          subtitle: path.replace(rootPath || '', '').substring(1) || path,
          icon: <File size={16} />,
          filePath: path,
        })),
      ];
      setResults(initialResults);
      return;
    }

    const newResults: SearchResult[] = [];

    // Search files if mode is 'files' or 'both'
    if ((mode === 'files' || mode === 'both') && fileFuse.current) {
      const fileResults = fileFuse.current.search(searchQuery);
      newResults.push(...fileResults.slice(0, 10).map(result => ({
        type: 'file' as const,
        id: result.item,
        title: result.item.split('/').pop() || result.item,
        subtitle: result.item.replace(rootPath || '', '').substring(1) || result.item,
        icon: <File size={16} />,
        filePath: result.item,
      })));
    }

    // Search threads if mode is 'threads' or 'both'
    if ((mode === 'threads' || mode === 'both') && threadFuse.current) {
      const threadSearchResults = threadFuse.current.search(searchQuery);
      newResults.push(...threadSearchResults.slice(0, 10).map(result => result.item));
    }

    setResults(newResults);
  };

  const handleSelect = (result: SearchResult) => {
    if (result.type === 'thread' && result.threadId) {
      // Switch to thread
      switchThread(result.threadId);
    } else if (result.type === 'file' && result.filePath) {
      // Open file (existing behavior)
      onSelect?.(result.filePath);
    }
    handleClose();
  };

  // Handle keyboard navigation (up/down/enter)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + results.length) % results.length);
    } else if (e.key === 'Enter') {
      if (results.length > 0 && results[selectedIndex]) {
        handleSelect(results[selectedIndex]);
      }
    }
  };

  // Get placeholder text based on current input mode
  const getPlaceholder = () => {
    const { mode } = parseInput(input);
    if (mode === 'files') return t('commandPalette.placeholder') || "搜索文件...";
    if (mode === 'threads') return "搜索会话...";
    return "搜索文件、会话... (@文件, #会话)";
  };

  if (!isCommandPaletteOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-20 bg-black bg-opacity-50"
      onClick={handleClose} // Close when clicking outside
    >
      <div
        className="bg-[#252526] rounded-lg shadow-2xl w-[600px] flex flex-col max-h-[80vh] border border-gray-700 overflow-hidden"
        onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside
      >
        <div className="relative p-3 border-b border-gray-700 bg-[#252526]">
          <input
            ref={inputRef}
            type="text"
            className="w-full bg-[#3c3c3c] border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
            placeholder={getPlaceholder()}
            value={input}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
          />
          <button
            className="absolute right-6 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
            onClick={handleClose}
          >
            <X size={16} />
          </button>
        </div>

        <div ref={listRef} className="flex-1 overflow-y-auto py-2 bg-[#252526] custom-scrollbar">
          {results.length > 0 ? (
            results.map((result, index) => (
              <div
                key={`${result.type}-${result.id}-${index}`}
                className={`px-4 py-2 text-sm cursor-pointer transition-colors flex items-center gap-3 ${
                  index === selectedIndex
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-300 hover:bg-[#2a2d2e] hover:text-white'
                }`}
                onClick={() => handleSelect(result)}
              >
                <div className={`flex-shrink-0 ${index === selectedIndex ? 'text-white' : 'text-gray-400'}`}>
                  {result.icon}
                </div>
                <div className="flex flex-col flex-1 min-w-0">
                  <span className="font-medium truncate">{result.title}</span>
                  <span className={`text-[10px] truncate ${index === selectedIndex ? 'text-blue-100' : 'text-gray-500'}`}>
                    {result.subtitle}
                  </span>
                </div>
                {result.type === 'thread' && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 ${
                    index === selectedIndex ? 'bg-blue-500 text-white' : 'bg-gray-700 text-gray-400'
                  }`}>
                    会话
                  </span>
                )}
              </div>
            ))
          ) : (
            <div className="px-4 py-6 text-center text-sm text-gray-400">
              {t('commandPalette.noResults') || "未找到结果"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
