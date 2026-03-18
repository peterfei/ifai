/**
 * ThreadTabs Component
 *
 * Displays and manages chat thread tabs:
 * - Search and filter bar
 * - Horizontal scrolling tab list
 * - New thread button
 * - Active thread highlighting
 * - Thread title display with message count
 * - Pin indicator
 * - Background task pulse indicator
 * - Optimized with React.memo for ThreadItem
 */

import React, { useRef, useEffect, useMemo, useCallback, memo, useState } from 'react';
import { useThreadStore } from '../../stores/threadStore';
import { useFileStore } from '../../stores/fileStore';
import { switchThread, setThreadMessages } from '../../stores/useChatStore';
import { useChatStore as coreUseChatStore } from 'ifainew-core';
import { useTranslation } from 'react-i18next';
import { ThreadSearchBar } from './ThreadSearchBar';
import { ThreadContextMenu } from './ThreadContextMenu';
import { TagManager } from './TagManager';
import type { Thread } from '../../stores/threadStore';
import clsx from 'clsx';

// ============================================================================
// Types
// ============================================================================

interface ThreadTabsProps {
  /** Maximum number of tabs to show before scrolling */
  maxVisibleTabs?: number;
  /** Whether to show message counts */
  showMessageCount?: boolean;
  /** Whether to show close buttons */
  showCloseButton?: boolean;
  /** v0.3.6: Current container width */
  width?: number;
}

// ============================================================================
// Thread Item Component (Memoized for performance)
// ============================================================================

interface ThreadItemProps {
  thread: Thread;
  isActive: boolean;
  showMessageCount: boolean;
  showCloseButton: boolean;
  canClose: boolean;
  formatTimestamp: (timestamp: number) => string;
  onClick: (threadId: string) => void;
  onClose: (e: React.MouseEvent, threadId: string) => void;
  onPin: (e: React.MouseEvent, threadId: string) => void;
  onContextMenu: (e: React.MouseEvent, threadId: string) => void;
  /** Signal to start editing from keyboard shortcut (F2) */
  startEditSignal: string | null;
  /** v0.3.6: Whether in sidekick mode */
  isSidekick?: boolean;
}

import { motion } from 'framer-motion';

// ... (保持现有导入不变)

const ThreadItem: React.FC<ThreadItemProps> = memo(({
  thread,
  isActive,
  showMessageCount,
  showCloseButton,
  canClose,
  formatTimestamp,
  onClick,
  onClose,
  onPin,
  onContextMenu,
  startEditSignal,
  isSidekick,
}) => {
  // Edit state for inline rename
  const [editing, setEditing] = React.useState(false);
  const [editValue, setEditValue] = React.useState(thread.title);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const updateThread = useThreadStore(state => state.updateThread);

  // Auto-focus and select all when editing starts
  React.useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  // Watch for external edit signal (from F2 shortcut)
  React.useEffect(() => {
    if (startEditSignal === thread.id && !editing) {
      handleStartEdit();
    }
  }, [startEditSignal, thread.id]); // Added thread.id to deps

  // Sync editValue with thread.title (for external updates)
  React.useEffect(() => {
    if (!editing) {
      setEditValue(thread.title);
    }
  }, [thread.title, editing]);

  const handleStartEdit = () => {
    setEditing(true);
    setEditValue(thread.title);
  };

  const handleSaveEdit = () => {
    const trimmed = editValue.trim();
    if (!trimmed) {
      setEditing(false);
      setEditValue(thread.title);
      return;
    }
    updateThread(thread.id, { title: trimmed });
    setEditing(false);
  };

  const handleCancelEdit = () => {
    setEditing(false);
    setEditValue(thread.title);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  };

  const handleBlur = () => {
    handleSaveEdit();
  };

  // 💎 Phase 3: 根据标题初步判断意图图标
  const getIntentIcon = (title: string) => {
    const t = title.toLowerCase();
    if (t.includes('bug') || t.includes('fix') || t.includes('修复') || t.includes('报错')) return '🐛';
    if (t.includes('feature') || t.includes('实现') || t.includes('功能') || t.includes('add')) return '✨';
    if (t.includes('refactor') || t.includes('重构') || t.includes('clean')) return '🛠️';
    if (t.includes('test') || t.includes('测试')) return '🧪';
    return '💬'; // 默认
  };

  return (
    <motion.div
      layout
      data-thread-id={thread.id}
      className={`
        group relative flex items-center gap-2 rounded-full cursor-pointer transition-all duration-300 whitespace-nowrap
        ${isSidekick ? 'p-2 justify-center min-w-[36px]' : 'px-3 py-1.5'}
        ${isActive
          ? 'bg-blue-600/10 text-blue-400 border border-blue-500/30 shadow-[0_0_15px_rgba(59,130,246,0.1)]'
          : 'bg-transparent text-gray-500 hover:text-gray-300 hover:bg-white/5 border border-transparent'
        }
      `}
      title={isSidekick ? thread.title : undefined}
      onClick={() => {
        if (!editing) onClick(thread.id);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        handleStartEdit();
      }}
      onContextMenu={(e) => onContextMenu(e, thread.id)}
    >
      {/* 意图图标与 Pin 状态 */}
      <span className={clsx("flex-shrink-0", isSidekick ? "text-[16px]" : "text-[12px]")}>
        {thread.pinned ? '📌' : getIntentIcon(thread.title)}
      </span>

      {/* 标题 */}
      {!isSidekick && (
        editing ? (
          <input
            ref={inputRef}
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            className="w-[80px] text-[11px] font-bold bg-gray-700 text-white px-1.5 py-0.5 rounded-full outline-none focus:ring-1 focus:ring-blue-500"
            autoFocus
          />
        ) : (
          <span className={`text-[11px] font-bold truncate transition-all ${isActive ? 'max-w-[120px]' : 'max-w-[80px]'}`}>
            {thread.title}
          </span>
        )
      )}

      {/* 关闭按钮 - 极简模式下隐藏 */}
      {showCloseButton && canClose && !isSidekick && (
        <button
          onClick={(e) => onClose(e, thread.id)}
          className={`
            ml-1 p-0.5 rounded-full hover:bg-blue-500/20 hover:text-blue-300 transition-all
            ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}
          `}
        >
          <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}

      {/* 选中态的光迹 - 极简模式显示在侧边 */}
      {isActive && (
        <motion.div
          layoutId="tab-active-pill"
          data-testid="tab-active-pill"
          className={clsx("absolute bg-blue-500 rounded-full shadow-[0_0_10px_#3b82f6]", isSidekick ? "-right-1 top-1/4 bottom-1/4 w-[2px]" : "-bottom-[9px] left-1/4 right-1/4 h-[2px]")}
          initial={false}
          transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
        />
      )}
    </motion.div>
  );
});

ThreadItem.displayName = 'ThreadItem';

// ============================================================================
// Main Component
// ============================================================================

export const ThreadTabs: React.FC<ThreadTabsProps> = ({
  maxVisibleTabs = 5,
  showMessageCount = true,
  showCloseButton = true,
  width,
}) => {
  const { t } = useTranslation();
  const activeFileId = useFileStore(state => state.activeFileId);
  const isSidekick = width ? width < 100 : false;

  // Edit signal state for F2 shortcut
  const [startEditSignal, setStartEditSignal] = React.useState<string | null>(null);

  // Context menu state
  const [contextMenu, setContextMenu] = React.useState<{
    x: number;
    y: number;
    threadId: string;
  } | null>(null);

  // Tag manager state
  const [showTagManager, setShowTagManager] = React.useState(false);

  // Thread store state - use raw state and compute derived values with useMemo
  const threads = useThreadStore(state => state.threads);
  const activeThreadId = useThreadStore(state => state.activeThreadId);
  const searchQuery = useThreadStore(state => state.searchQuery);
  const tagFilter = useThreadStore(state => state.tagFilter);
  const createThread = useThreadStore(state => state.createThread);
  const deleteThread = useThreadStore(state => state.deleteThread);
  const toggleThreadPinned = useThreadStore(state => state.toggleThreadPinned);

  // Compute filtered and sorted threads with useMemo to prevent infinite loops
  const filteredThreads = useMemo(() => {
    return Object.values(threads)
      .filter(t => t.status === 'active')
      .filter(t => {
        // Apply search filter
        if (searchQuery) {
          const query = searchQuery.toLowerCase();
          return t.title.toLowerCase().includes(query) ||
                 t.description?.toLowerCase().includes(query) ||
                 t.tags.some(tag => tag.toLowerCase().includes(query));
        }
        return true;
      })
      .filter(t => {
        // Apply tag filter
        if (tagFilter) {
          return t.tags.includes(tagFilter);
        }
        return true;
      })
      .sort((a, b) => {
        // 1. 强置顶优先
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;

        // 2. 💎 Phase 4: 智能上下文相关性提权 (Smart Boosting)
        if (activeFileId) {
          const activeFileName = activeFileId.split('/').pop()?.toLowerCase() || '';
          
          const isARelated = a.title.toLowerCase().includes(activeFileName) || 
                            a.tags.some(tag => activeFileId.includes(tag));
          const isBRelated = b.title.toLowerCase().includes(activeFileName) || 
                            b.tags.some(tag => activeFileId.includes(tag));

          if (isARelated && !isBRelated) return -1;
          if (!isARelated && isBRelated) return 1;
        }

        // 3. 最后活跃时间
        const timeDiff = b.lastActiveAt - a.lastActiveAt;
        if (timeDiff !== 0) return timeDiff;
        return b.createdAt - a.createdAt;
      });
  }, [threads, searchQuery, tagFilter, activeFileId]);

  // Ref for scroll container
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to active thread when it changes
  useEffect(() => {
    if (scrollContainerRef.current && activeThreadId) {
      const activeTab = scrollContainerRef.current.querySelector(`[data-thread-id="${activeThreadId}"]`) as HTMLElement;
      if (activeTab) {
        activeTab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }, [activeThreadId]);

  // F2: Rename active thread (local to this component)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2' && activeThreadId) {
        // Only handle if not in an input/textarea
        if (
          document.activeElement instanceof HTMLInputElement ||
          document.activeElement instanceof HTMLTextAreaElement
        ) {
          return;
        }
        e.preventDefault();
        setStartEditSignal(activeThreadId);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeThreadId]);

  // Handle new thread creation
  const handleNewThread = useCallback(() => {
    // Save current messages first
    const currentThreadId = useThreadStore.getState().activeThreadId;
    if (currentThreadId) {
      const currentMessages = coreUseChatStore.getState().messages;
      setThreadMessages(currentThreadId, [...currentMessages] as any);
    }

    // Create new thread (this sets activeThreadId)
    const newThreadId = createThread();

    // Clear messages for new thread
    coreUseChatStore.setState({ messages: [] });

    console.log(`[ThreadTabs] Created and switched to new thread: ${newThreadId}`);
  }, [createThread]);

  // Handle thread click
  const handleThreadClick = useCallback((threadId: string) => {
    if (threadId !== activeThreadId) {
      switchThread(threadId);
    }
  }, [activeThreadId]);

  // Handle thread close (right-click or Ctrl+click)
  const handleThreadClose = useCallback((e: React.MouseEvent, threadId: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    // 执行删除
    deleteThread(threadId);

    // 如果删除的是当前活跃线程，需要手动触发一次 switchThread 来加载新活跃线程的消息
    const currentThreadId = useThreadStore.getState().activeThreadId;
    if (threadId === currentThreadId) {
      // deleteThread 内部已经计算并设置了新的 activeThreadId
      const newActiveId = useThreadStore.getState().activeThreadId;
      if (newActiveId) {
        switchThread(newActiveId);
      } else {
        // 如果没有剩余线程，清空消息
        coreUseChatStore.setState({ messages: [] });
      }
    }
  }, [deleteThread, activeThreadId]);

  // Handle thread pin toggle (middle-click or Alt+click)
  const handleThreadPin = useCallback((e: React.MouseEvent, threadId: string) => {
    e.stopPropagation();
    toggleThreadPinned(threadId);
  }, [toggleThreadPinned]);

  // Handle thread context menu
  const handleThreadContextMenu = useCallback((e: React.MouseEvent, threadId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      threadId,
    });
  }, []);

  // Format timestamp for display
  const formatTimestamp = (timestamp: number): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return t('threads.now', '刚刚');
    if (diffMins < 60) return t('threads.minutesAgo', '{{m}}分钟前', { m: diffMins });
    if (diffMins < 1440) return t('threads.hoursAgo', '{{h}}小时前', { h: Math.floor(diffMins / 60) });
    return date.toLocaleDateString();
  };

  // No threads state
  if (filteredThreads.length === 0) {
    return (
      <>
        <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-800">
          <span className="text-sm text-gray-500">{t('threads.noThreads', '暂无对话')}</span>
          <button
            onClick={handleNewThread}
            className="px-3 py-1 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
            title={t('threads.newThread', '新建对话')}
          >
            + {t('threads.new', '新对话')}
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <div className={clsx("flex flex-col bg-[#1e1e1e]/40 backdrop-blur-md", isSidekick && "items-center")}>
        <div className={clsx("flex px-3 py-2 gap-2 overflow-hidden", isSidekick ? "flex-col items-center px-1" : "items-center")}>
          {/* Scrollable tab list */}
          <div
            ref={scrollContainerRef}
            className={clsx("flex-1 flex gap-2 overflow-x-auto scrollbar-none py-1", isSidekick ? "flex-col overflow-y-auto overflow-x-hidden w-full px-1" : "items-center")}
          >
            {filteredThreads.map((thread) => (
              <ThreadItem
                key={thread.id}
                thread={thread}
                isActive={thread.id === activeThreadId}
                showMessageCount={showMessageCount}
                showCloseButton={showCloseButton}
                canClose={filteredThreads.length > 1}
                formatTimestamp={formatTimestamp}
                onClick={handleThreadClick}
                onClose={handleThreadClose}
                onPin={handleThreadPin}
                onContextMenu={handleThreadContextMenu}
                startEditSignal={startEditSignal}
                isSidekick={isSidekick}
              />
            ))}
          </div>

          {/* New thread button - Compact Icon style */}
          <button
            onClick={handleNewThread}
            className={clsx(
              "rounded-full bg-gray-800/50 hover:bg-blue-600/20 text-gray-400 hover:text-blue-400 transition-all flex items-center justify-center flex-shrink-0 border border-white/5",
              isSidekick ? "w-10 h-10 mb-2" : "w-8 h-8"
            )}
            title={t('threads.newThread', '新建对话') + ' (Ctrl+T)'}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
        <div className="h-px bg-white/5 w-full" />
      </div>

      {/* Thread Context Menu */}
      {contextMenu && (
        <ThreadContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          thread={threads[contextMenu.threadId] || null}
          onClose={() => setContextMenu(null)}
          onStartRename={(threadId) => setStartEditSignal(threadId)}
          onShowTagManager={() => setShowTagManager(true)}
        />
      )}

      {/* Tag Manager Dialog */}
      <TagManager isOpen={showTagManager} onClose={() => setShowTagManager(false)} />
    </>
  );
};

// ============================================================================
// Keyboard Shortcuts
// ============================================================================

/**
 * Thread keyboard shortcuts:
 * - Ctrl+T: New thread
 * - Ctrl+Tab / Ctrl+Shift+Tab: Switch between threads
 * - Ctrl+W: Close current thread
 * - Ctrl+1-9: Switch to thread by index
 */
export const useThreadKeyboardShortcuts = () => {
  const threads = useThreadStore(state => state.threads);
  const activeThreadId = useThreadStore(state => state.activeThreadId);
  const searchQuery = useThreadStore(state => state.searchQuery);
  const tagFilter = useThreadStore(state => state.tagFilter);
  const createThread = useThreadStore(state => state.createThread);
  const deleteThread = useThreadStore(state => state.deleteThread);

  // Compute filtered threads for keyboard shortcuts
  const filteredThreads = React.useMemo(() => {
    return Object.values(threads)
      .filter(t => t.status === 'active')
      .filter(t => {
        if (searchQuery) {
          const query = searchQuery.toLowerCase();
          return t.title.toLowerCase().includes(query) ||
                 t.description?.toLowerCase().includes(query) ||
                 t.tags.some(tag => tag.toLowerCase().includes(query));
        }
        return true;
      })
      .filter(t => {
        if (tagFilter) {
          return t.tags.includes(tagFilter);
        }
        return true;
      })
      .sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        // 🔥 FIX: 如果 lastActiveAt 相同，使用 createdAt 作为 secondary sort key
        const timeDiff = b.lastActiveAt - a.lastActiveAt;
        if (timeDiff !== 0) return timeDiff;
        return b.createdAt - a.createdAt;
      });
  }, [threads, searchQuery, tagFilter]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+T: New thread
      if (e.ctrlKey && e.key === 't') {
        e.preventDefault();
        createThread();
        return;
      }

      // Ctrl+W: Close current thread
      if (e.ctrlKey && e.key === 'w' && activeThreadId) {
        e.preventDefault();
        deleteThread(activeThreadId);
        return;
      }

      // Ctrl+Tab: Next thread
      if (e.ctrlKey && e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault();
        const currentIndex = filteredThreads.findIndex(t => t.id === activeThreadId);
        const nextIndex = (currentIndex + 1) % filteredThreads.length;
        if (filteredThreads[nextIndex]) {
          switchThread(filteredThreads[nextIndex].id);
        }
        return;
      }

      // Ctrl+Shift+Tab: Previous thread
      if (e.ctrlKey && e.key === 'Tab' && e.shiftKey) {
        e.preventDefault();
        const currentIndex = filteredThreads.findIndex(t => t.id === activeThreadId);
        const prevIndex = currentIndex <= 0 ? filteredThreads.length - 1 : currentIndex - 1;
        if (filteredThreads[prevIndex]) {
          switchThread(filteredThreads[prevIndex].id);
        }
        return;
      }

      // Ctrl+1-9: Switch to thread by index
      if (e.ctrlKey && e.key >= '1' && e.key <= '9') {
        const index = parseInt(e.key) - 1;
        if (filteredThreads[index]) {
          e.preventDefault();
          switchThread(filteredThreads[index].id);
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredThreads, activeThreadId, createThread, deleteThread]);
};

export default ThreadTabs;
