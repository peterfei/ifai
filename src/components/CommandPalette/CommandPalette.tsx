import React, { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useLayoutStore } from '../../stores/layoutStore';
import { useFileStore } from '../../stores/fileStore';
import { invoke } from '@tauri-apps/api/core';
import Fuse from 'fuse.js';
import { useTranslation } from 'react-i18next';

interface CommandPaletteProps {
  onSelect?: (path: string) => void;
}

export const CommandPalette = ({ onSelect }: CommandPaletteProps) => {
  const { t } = useTranslation();
  const { isCommandPaletteOpen, setCommandPaletteOpen } = useLayoutStore();
  const { rootPath } = useFileStore();
  const [input, setInput] = useState('');
  const [allFilePaths, setAllFilePaths] = useState<string[]>([]);
  const [results, setResults] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const fuse = useRef<Fuse<string> | null>(null);

  useEffect(() => {
    if (isCommandPaletteOpen) {
      setSelectedIndex(0);
      inputRef.current?.focus();
      // Load all file paths when palette opens
      if (rootPath) {
        const loadFilePaths = async () => {
          try {
            const paths = await invoke<string[]>('get_all_file_paths', { rootDir: rootPath });
            setAllFilePaths(paths);
            fuse.current = new Fuse(paths, { includeScore: true, ignoreLocation: true, threshold: 0.4 });
            // Initial search (e.g., show recent or a few items)
            setResults(paths.slice(0, 10)); // Show first 10 for quick access
          } catch (e) {
            console.error("Failed to load file paths:", e);
          }
        };
        loadFilePaths();
      }
    } else {
      setInput('');
      setResults([]);
      setAllFilePaths([]);
      setSelectedIndex(0);
    }
  }, [isCommandPaletteOpen, rootPath]);

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

    if (query.trim() === '') {
      setResults(allFilePaths.slice(0, 10)); // Show initial set if empty
      return;
    }

    if (fuse.current) {
      const searchResults = fuse.current.search(query);
      setResults(searchResults.map(result => result.item));
    }
  };

  const handleSelect = (path: string) => {
    onSelect?.(path);
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
            placeholder={t('commandPalette.placeholder') || "Search files..."}
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
            results.map((path, index) => (
              <div 
                key={path} // Use path as key since it's unique
                className={`px-4 py-2 text-sm cursor-pointer transition-colors ${
                  index === selectedIndex 
                    ? 'bg-blue-600 text-white' 
                    : 'text-gray-300 hover:bg-[#2a2d2e] hover:text-white'
                }`}
                onClick={() => handleSelect(path)}
              >
                <div className="flex flex-col">
                  <span className="font-medium">{path.split('/').pop()}</span>
                  <span className={`text-[10px] truncate ${index === selectedIndex ? 'text-blue-100' : 'text-gray-500'}`}>
                    {path.replace(rootPath || '', '').substring(1) || path}
                  </span>
                </div>
              </div>
            ))
          ) : (rootPath ? (
            <div className="px-4 py-6 text-center text-sm text-gray-400">
              {t('commandPalette.noResults') || "No files found"}
            </div>
          ) : (
            <div className="px-4 py-6 text-center text-sm text-gray-400">
              {t('commandPalette.openFolder') || "Please open a folder to search"}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
