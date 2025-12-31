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
import { switchThread, setThreadMessages } from '../../stores/useChatStore';
import { useChatStore as coreUseChatStore } from 'ifainew-core';
import { useTranslation } from 'react-i18next';
import { ThreadSearchBar } from './ThreadSearchBar';
import { ThreadContextMenu } from './ThreadContextMenu';
import { TagManager } from './TagManager';
import type { Thread } from '../../stores/threadStore';

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
}

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
}) => {
  // Edit state for inline rename
  const [editing, setEditing] = React.useState(false);
  const [editValue, setEditValue] = React.useState(thread.title);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const hasBackgroundTasks = thread.agentTasks.length > 0;
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
  }, [startEditSignal]);

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
      // Don't allow empty titles - revert
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

  return (
    <div
      key={thread.id}
      data-thread-id={thread.id}
      className={`
        group relative flex items-center gap-2 px-3 py-2 rounded-t-lg cursor-pointer transition-all min-w-[140px] max-w-[200px]
        ${isActive
          ? 'bg-gray-800 text-white border-t-2 border-blue-500'
          : 'bg-gray-850 text-gray-400 hover:bg-gray-800 hover:text-gray-200'
        }
      `}
      onClick={() => {
        // Don't switch thread when editing
        if (!editing) {
          onClick(thread.id);
        }
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        handleStartEdit();
      }}
      onContextMenu={(e) => {
        onContextMenu(e, thread.id);
      }}
      title={`${thread.title}\n${formatTimestamp(thread.lastActiveAt)}\n${thread.messageCount} 条消息\n双击重命名`}
    >
      {/* Pin indicator */}
      {thread.pinned && (
        <svg
          className="w-3 h-3 text-yellow-500 flex-shrink-0"
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 18V4z" />
        </svg>
      )}

      {/* Thread title or inline edit input */}
      {editing ? (
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          className="flex-1 text-sm font-medium bg-gray-700 text-white px-1.5 py-0.5 rounded outline-none focus:ring-2 focus:ring-blue-500"
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span className="flex-1 truncate text-sm font-medium">
          {thread.title}
        </span>
      )}

      {/* Message count badge */}
      {showMessageCount && thread.messageCount > 0 && (
        <span className={`
          text-xs px-1.5 py-0.5 rounded flex-shrink-0
          ${isActive
            ? 'bg-blue-600 text-white'
            : 'bg-gray-700 text-gray-400'
          }
        `}>
          {thread.messageCount}
        </span>
      )}

      {/* Background task pulse indicator */}
      {hasBackgroundTasks && (
        <span className="absolute top-1 right-1 flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
        </span>
      )}

      {/* Close button (hover) */}
      {showCloseButton && canClose && (
        <button
          onClick={(e) => onClose(e, thread.id)}
          className={`
            opacity-0 group-hover:opacity-100 transition-opacity
            flex-shrink-0 p-0.5 rounded hover:bg-gray-700
            ${isActive ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-300'}
          `}
          title="关闭对话"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}

      {/* Unread activity indicator */}
      {thread.hasUnreadActivity && !isActive && (
        <span className="absolute bottom-1 right-1 h-2 w-2 rounded-full bg-blue-500"></span>
      )}
    </div>
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
}) => {
  const { t } = useTranslation();

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
        // Pinned threads first, then by lastActiveAt
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return b.lastActiveAt - a.lastActiveAt;
      });
  }, [threads, searchQuery, tagFilter]);

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
      setThreadMessages(currentThreadId, [...currentMessages]);
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
    e.stopPropagation();
    deleteThread(threadId);
  }, [deleteThread]);

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
        <ThreadSearchBar />
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
      <ThreadSearchBar />
      <div className="flex items-center bg-gray-900 border-b border-gray-800">
      {/* Scrollable tab list */}
      <div
        ref={scrollContainerRef}
        className="flex-1 flex items-center gap-1 px-2 py-1 overflow-x-auto scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent"
        style={{ maxWidth: `${maxVisibleTabs * 180}px` }}
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
          />
        ))}
      </div>

      {/* New thread button */}
      <button
        onClick={handleNewThread}
        className="
          px-3 py-2 m-1 rounded-lg bg-gray-800 hover:bg-gray-700
          text-gray-400 hover:text-white transition-colors
          flex items-center gap-1 flex-shrink-0
        "
        title={t('threads.newThread', '新建对话') + ' (Ctrl+T)'}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        <span className="text-sm font-medium">{t('threads.new', '新对话')}</span>
      </button>
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
        return b.lastActiveAt - a.lastActiveAt;
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
