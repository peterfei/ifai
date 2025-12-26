/**
 * ThreadSearchBar Component
 *
 * Provides search and filtering functionality for threads:
 * - Text search across titles, descriptions, and tags
 * - Tag filtering dropdown
 * - Tag management dialog
 * - Clear search button
 */

import React, { useState, useRef, useEffect } from 'react';
import { Search, X, Tag, Settings } from 'lucide-react';
import { useThreadStore } from '../../stores/threadStore';
import { useTranslation } from 'react-i18next';
import { useTagManager } from './TagManager';

// ============================================================================
// Component
// ============================================================================

export const ThreadSearchBar: React.FC = () => {
  const { t } = useTranslation();

  // Tag manager hook
  const { open: openTagManager, TagManagerComponent } = useTagManager();

  // Thread store state
  const threads = useThreadStore(state => state.threads);
  const searchQuery = useThreadStore(state => state.searchQuery);
  const tagFilter = useThreadStore(state => state.tagFilter);
  const setSearchQuery = useThreadStore(state => state.setSearchQuery);
  const setTagFilter = useThreadStore(state => state.setTagFilter);

  // Local state
  const [inputValue, setInputValue] = useState(searchQuery || '');
  const [showTagDropdown, setShowTagDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Extract all unique tags from threads
  const allTags = React.useMemo(() => {
    const tagSet = new Set<string>();
    Object.values(threads).forEach(thread => {
      thread.tags.forEach(tag => tagSet.add(tag));
    });
    return Array.from(tagSet).sort();
  }, [threads]);

  // Sync local input with store state
  useEffect(() => {
    setInputValue(searchQuery || '');
  }, [searchQuery]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowTagDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle input change with debounce
  const handleInputChange = (value: string) => {
    setInputValue(value);
    // Debounce search update
    const timeoutId = setTimeout(() => {
      setSearchQuery(value);
    }, 300);

    return () => clearTimeout(timeoutId);
  };

  // Handle clear search
  const handleClear = () => {
    setInputValue('');
    setSearchQuery('');
    setTagFilter(null);
  };

  // Handle tag selection
  const handleTagSelect = (tag: string | null) => {
    setTagFilter(tag);
    setShowTagDropdown(false);
  };

  // Get display text for selected tag
  const getTagDisplay = () => {
    if (!tagFilter) return t('threads.allTags', '所有标签');
    return tagFilter;
  };

  const hasFilters = inputValue || tagFilter;

  return (
    <>
    <div className="flex items-center gap-2 px-3 py-2 bg-gray-900 border-b border-gray-800">
      {/* Search input */}
      <div className="flex-1 flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-1.5 border border-gray-700 focus-within:border-blue-500 transition-colors">
        <Search size={16} className="text-gray-500 flex-shrink-0" />
        <input
          type="text"
          value={inputValue}
          onChange={(e) => handleInputChange(e.target.value)}
          placeholder={t('threads.searchPlaceholder', '搜索对话...')}
          className="flex-1 bg-transparent border-none outline-none text-sm text-gray-200 placeholder-gray-500"
        />
        {hasFilters && (
          <button
            onClick={handleClear}
            className="p-0.5 hover:bg-gray-700 rounded transition-colors"
            title={t('threads.clearFilters', '清除过滤')}
          >
            <X size={14} className="text-gray-500" />
          </button>
        )}
      </div>

      {/* Tag filter dropdown */}
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setShowTagDropdown(!showTagDropdown)}
          className={`
            flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition-colors
            ${tagFilter
              ? 'bg-blue-600/20 text-blue-400 border-blue-500/50'
              : 'bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-600'
            }
          `}
          title={t('threads.filterByTag', '按标签过滤')}
        >
          <Tag size={14} />
          <span className="max-w-[100px] truncate">{getTagDisplay()}</span>
        </button>

        {showTagDropdown && (
          <div className="absolute top-full right-0 mt-1 w-48 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 overflow-hidden">
            <div className="max-h-64 overflow-y-auto">
              {/* All tags option */}
              <button
                onClick={() => handleTagSelect(null)}
                className={`
                  w-full px-3 py-2 text-left text-sm hover:bg-gray-700 transition-colors
                  ${!tagFilter ? 'bg-blue-600/20 text-blue-400' : 'text-gray-300'}
                `}
              >
                {t('threads.allTags', '所有标签')}
              </button>

              {/* Tag options */}
              {allTags.length === 0 ? (
                <div className="px-3 py-4 text-sm text-gray-500 text-center">
                  {t('threads.noTags', '暂无标签')}
                </div>
              ) : (
                allTags.map(tag => (
                  <button
                    key={tag}
                    onClick={() => handleTagSelect(tag)}
                    className={`
                      w-full px-3 py-2 text-left text-sm hover:bg-gray-700 transition-colors flex items-center justify-between
                      ${tagFilter === tag ? 'bg-blue-600/20 text-blue-400' : 'text-gray-300'}
                    `}
                  >
                    <span className="truncate">{tag}</span>
                    <span className="text-xs text-gray-500 ml-2">
                      {Object.values(threads).filter(t => t.tags.includes(tag)).length}
                    </span>
                  </button>
                ))
              )}

              {/* Tag manager link */}
              <div className="border-t border-gray-700">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowTagDropdown(false);
                    openTagManager();
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-blue-400 hover:bg-gray-700 transition-colors flex items-center gap-2"
                >
                  <Settings size={12} />
                  {t('threads.manageTags', '管理标签')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Results count */}
      {hasFilters && (
        <span className="text-xs text-gray-500 whitespace-nowrap">
          {Object.values(threads).filter(t => t.status === 'active').length} {t('threads.threads', '个对话')}
        </span>
      )}
    </div>

    {/* Tag Manager Dialog */}
    <TagManagerComponent />
  </>
  );
};
