/**
 * Thread Store - Multi-thread Chat Session Management
 *
 * Manages multiple chat threads/sessions with:
 * - Thread creation, switching, deletion
 * - Thread metadata (title, timestamps, tags, pinned status)
 * - Active thread tracking
 * - Thread search and filtering
 * - Persistence with IndexedDB
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Message } from 'ifainew-core';
import { autoSaveThread } from './persistence/threadPersistence';

// ============================================================================
// Types
// ============================================================================

export type ThreadStatus = 'active' | 'archived' | 'deleted';

export interface Thread {
  /** Unique thread identifier */
  id: string;
  /** Thread display title (auto-generated from first message or custom) */
  title: string;
  /** Thread creation timestamp (ms) */
  createdAt: number;
  /** Thread last update timestamp (ms) */
  updatedAt: number;
  /** Thread last active timestamp (ms) - for sorting */
  lastActiveAt: number;
  /** Number of messages in this thread */
  messageCount: number;
  /** Associated Agent task IDs */
  agentTasks: string[];
  /** Thread status */
  status: ThreadStatus;
  /** Whether there's unread activity from background tasks */
  hasUnreadActivity: boolean;
  /** User-defined tags for organization */
  tags: string[];
  /** Whether this thread is pinned to the top */
  pinned: boolean;
  /** Optional user notes/description */
  description?: string;
}

export interface ThreadOptions {
  /** Initial title (will auto-generate if not provided) */
  title?: string;
  /** Initial tags */
  tags?: string[];
  /** Whether to pin on creation */
  pinned?: boolean;
  /** Description/notes */
  description?: string;
}

interface ThreadState {
  /** Map of thread ID to thread data */
  threads: Record<string, Thread>;
  /** Currently active thread ID */
  activeThreadId: string | null;
  /** Maximum number of threads allowed */
  maxThreads: number;
  /** Search query for filtering threads */
  searchQuery: string;
  /** Tag filter for filtering threads */
  tagFilter: string | null;
  /** Title counters for each time period to avoid duplicate default titles */
  titleCounters: Record<string, number>;
}

interface ThreadActions {
  /** Create a new thread */
  createThread: (options?: ThreadOptions) => string;
  /** Delete a thread */
  deleteThread: (threadId: string) => void;
  /** Switch to a different thread */
  switchThread: (threadId: string) => void;
  /** Update thread properties */
  updateThread: (threadId: string, updates: Partial<Thread>) => void;
  /** Update thread title from message content (similar to Doubao) */
  updateThreadTitleFromMessage: (threadId: string, messageContent: string | any[]) => void;
  /** Set active thread (internal use) */
  setActiveThread: (threadId: string | null) => void;
  /** Get thread by ID */
  getThread: (threadId: string) => Thread | undefined;
  /** Get all threads sorted by lastActiveAt */
  getAllThreads: () => Thread[];
  /** Get active thread */
  getActiveThread: () => Thread | null;
  /** Increment message count for a thread */
  incrementMessageCount: (threadId: string) => void;
  /** Update thread timestamp */
  updateThreadTimestamp: (threadId: string) => void;
  /** Add agent task to thread */
  addAgentTask: (threadId: string, agentId: string) => void;
  /** Remove agent task from thread */
  removeAgentTask: (threadId: string, agentId: string) => void;
  /** Mark thread as having unread activity */
  markUnreadActivity: (threadId: string, hasUnread: boolean) => void;
  /** Toggle thread pinned status */
  toggleThreadPinned: (threadId: string) => void;
  /** Archive a thread */
  archiveThread: (threadId: string) => void;
  /** Unarchive a thread */
  unarchiveThread: (threadId: string) => void;
  /** Set search query */
  setSearchQuery: (query: string) => void;
  /** Set tag filter */
  setTagFilter: (tag: string | null) => void;
  /** Clear all deleted threads permanently */
  clearDeletedThreads: () => void;
  /** Auto-archive threads older than specified days */
  autoArchiveOldThreads: (daysOld: number) => number;
  /** Reset thread store (for testing/debugging) */
  reset: () => void;
}

type ThreadStore = ThreadState & ThreadActions;

// ============================================================================
// Utilities
// ============================================================================

/**
 * Generate a unique thread ID
 */
function generateThreadId(): string {
  return `thread_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * Generate a default title for a thread
 * @param counters - Title counters for each time period
 * @returns Generated default title
 */
function generateDefaultTitle(counters: Record<string, number>): string {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? '上午' : hour < 18 ? '下午' : '晚上';

  // 获取当前时间段的计数
  const count = counters[greeting] || 0;

  // 第一个线程使用"新对话"，后续使用递增编号
  if (count === 0) {
    return `${greeting}的新对话`;
  }
  return `${greeting}的对话 ${count}`;
}

/**
 * Generate title from first message content
 */
function generateTitleFromMessage(content: string | any[]): string {
  let textContent = '';

  if (typeof content === 'string') {
    textContent = content;
  } else if (Array.isArray(content)) {
    textContent = content
      .filter(p => p.type === 'text')
      .map(p => p.text)
      .join(' ');
  }

  // Take first 30 characters as title
  const maxLength = 30;
  if (textContent.length > maxLength) {
    return textContent.slice(0, maxLength) + '...';
  }
  return textContent || '新对话';
}

// ============================================================================
// Store Creation
// ============================================================================

const INITIAL_THREAD_STATE: ThreadState = {
  threads: {},
  activeThreadId: null,
  maxThreads: 20,
  searchQuery: '',
  tagFilter: null,
  titleCounters: { '上午': 0, '下午': 0, '晚上': 0 },
};

export const useThreadStore = create<ThreadStore>()(
  persist(
    (set, get) => ({
      ...INITIAL_THREAD_STATE,

      // --------------------------------------------------------------
      // Thread CRUD Operations
      // --------------------------------------------------------------

      createThread: (options: ThreadOptions = {}) => {
        const state = get();
        const threadCount = Object.values(state.threads).filter(
          t => t.status !== 'deleted'
        ).length;

        // Check max threads limit
        if (threadCount >= state.maxThreads) {
          console.warn(`[ThreadStore] Maximum thread limit (${state.maxThreads}) reached`);
          // Find oldest non-pinned thread to archive
          const threadsToArchive = Object.values(state.threads)
            .filter(t => t.status === 'active' && !t.pinned)
            .sort((a, b) => a.lastActiveAt - b.lastActiveAt);

          if (threadsToArchive.length > 0) {
            const oldestThread = threadsToArchive[0];
            get().archiveThread(oldestThread.id);
          }
        }

        // Create new thread
        const threadId = generateThreadId();
        const now = Date.now();

        // 生成默认标题（如果未提供自定义标题）
        const defaultTitle = options.title || generateDefaultTitle(state.titleCounters);

        const newThread: Thread = {
          id: threadId,
          title: defaultTitle,
          createdAt: now,
          updatedAt: now,
          lastActiveAt: now,
          messageCount: 0,
          agentTasks: [],
          status: 'active',
          hasUnreadActivity: false,
          tags: options.tags || [],
          pinned: options.pinned || false,
          description: options.description,
        };

        // 如果使用默认标题，递增计数器
        if (!options.title) {
          const hour = new Date().getHours();
          const greeting = hour < 12 ? '上午' : hour < 18 ? '下午' : '晚上';
          set(state => ({
            titleCounters: {
              ...state.titleCounters,
              [greeting]: (state.titleCounters[greeting] || 0) + 1
            }
          }));
        }

        set(state => ({
          threads: {
            ...state.threads,
            [threadId]: newThread,
          },
          activeThreadId: threadId,
        }));

        console.log(`[ThreadStore] Created thread: ${threadId} with title: "${defaultTitle}"`);

        // Trigger auto-save
        autoSaveThread(threadId);

        return threadId;
      },

      deleteThread: (threadId: string) => {
        const state = get();
        const thread = state.threads[threadId];

        if (!thread) {
          console.warn(`[ThreadStore] Thread not found: ${threadId}`);
          return;
        }

        set(state => {
          const newThreads = { ...state.threads };

          // Mark as deleted instead of removing
          newThreads[threadId] = {
            ...thread,
            status: 'deleted',
          };

          // If deleting active thread, switch to another
          let newActiveThreadId = state.activeThreadId;
          if (state.activeThreadId === threadId) {
            // Find most recent active thread
            const activeThreads = Object.values(newThreads)
              .filter(t => t.status === 'active')
              .sort((a, b) => b.lastActiveAt - a.lastActiveAt);

            newActiveThreadId = activeThreads.length > 0
              ? activeThreads[0].id
              : null;
          }

          return {
            threads: newThreads,
            activeThreadId: newActiveThreadId,
          };
        });

        // 同步删除到 IndexedDB
        autoSaveThread(threadId);

        console.log(`[ThreadStore] Deleted thread: ${threadId}`);
      },

      switchThread: (threadId: string) => {
        const state = get();
        const thread = state.threads[threadId];

        if (!thread) {
          console.warn(`[ThreadStore] Thread not found: ${threadId}`);
          return;
        }

        if (thread.status === 'deleted') {
          console.warn(`[ThreadStore] Cannot switch to deleted thread: ${threadId}`);
          return;
        }

        // 🔥 FIX: Don't update lastActiveAt on switch
        // This prevents the clicked tab from jumping to the first position
        // lastActiveAt should only be updated for actual "active" operations like:
        // - Creating a new thread
        // - Sending/receiving messages
        // - Updating thread content
        set(state => ({
          activeThreadId: threadId,
          threads: {
            ...state.threads,
            [threadId]: {
              ...thread,
              // lastActiveAt: now,  // ← REMOVED: Don't update on click/switch
              hasUnreadActivity: false, // Clear unread flag when switching to thread
            },
          },
        }));

        console.log(`[ThreadStore] Switched to thread: ${threadId}`);

        // 🔥 修复线程加载状态隔离:切换线程时重置 isLoading 状态
        // 这样可以避免新线程的输入框被旧线程的加载状态禁用
        // 使用动态导入避免循环依赖
        import('ifainew-core').then(({ useChatStore }) => {
          const chatStore = useChatStore.getState();
          if (chatStore.isLoading) {
            console.log(`[ThreadStore] Resetting isLoading state for thread switch`);
            useChatStore.setState({ isLoading: false });
          }
        }).catch((e) => {
          console.warn(`[ThreadStore] Failed to reset isLoading:`, e);
        });

        // Trigger auto-save
        autoSaveThread(threadId);
      },

      updateThread: (threadId: string, updates: Partial<Thread>) => {
        const state = get();
        const thread = state.threads[threadId];

        if (!thread) {
          console.warn(`[ThreadStore] Thread not found: ${threadId}`);
          return;
        }

        set(state => ({
          threads: {
            ...state.threads,
            [threadId]: {
              ...thread,
              ...updates,
              id: threadId, // Ensure ID cannot be changed
              createdAt: thread.createdAt, // Ensure createdAt cannot be changed
            },
          },
        }));

        console.log(`[ThreadStore] Updated thread: ${threadId}`, updates);

        // Trigger auto-save
        autoSaveThread(threadId);
      },

      updateThreadTitleFromMessage: (threadId: string, messageContent: string | any[]) => {
        const state = get();
        const thread = state.threads[threadId];

        if (!thread) {
          console.warn(`[ThreadStore] Thread not found: ${threadId}`);
          return;
        }

        // 只更新默认标题，不覆盖用户自定义的标题
        // 默认标题格式：上午/下午/晚上 + (新对话|的对话 \d+)
        const isDefaultTitle = /^(上午|下午|晚上)(的新对话|的对话 \d+)$/.test(thread.title);

        if (!isDefaultTitle) {
          console.log(`[ThreadStore] Thread ${threadId} has custom title "${thread.title}", skipping auto-update`);
          return;
        }

        // 从消息内容生成标题
        const newTitle = generateTitleFromMessage(messageContent);

        if (newTitle === thread.title) {
          return; // 标题没有变化，不需要更新
        }

        set(state => ({
          threads: {
            ...state.threads,
            [threadId]: {
              ...thread,
              title: newTitle,
              updatedAt: Date.now(),
            },
          },
        }));

        console.log(`[ThreadStore] Updated thread ${threadId} title from "${thread.title}" to "${newTitle}"`);

        // Trigger auto-save
        autoSaveThread(threadId);
      },

      // --------------------------------------------------------------
      // Internal Getters
      // --------------------------------------------------------------

      setActiveThread: (threadId: string | null) => {
        set({ activeThreadId: threadId });
      },

      getThread: (threadId: string) => {
        return get().threads[threadId];
      },

      getAllThreads: () => {
        const state = get();
        return Object.values(state.threads)
          .filter(t => t.status === 'active')
          .filter(t => {
            // Apply search filter
            if (state.searchQuery) {
              const query = state.searchQuery.toLowerCase();
              return t.title.toLowerCase().includes(query) ||
                     t.description?.toLowerCase().includes(query) ||
                     t.tags.some(tag => tag.toLowerCase().includes(query));
            }
            return true;
          })
          .filter(t => {
            // Apply tag filter
            if (state.tagFilter) {
              return t.tags.includes(state.tagFilter);
            }
            return true;
          })
          .sort((a, b) => {
            // Pinned threads first, then by lastActiveAt
            if (a.pinned && !b.pinned) return -1;
            if (!a.pinned && b.pinned) return 1;
            // 🔥 FIX: 如果 lastActiveAt 相同，使用 createdAt 作为 secondary sort key
            const timeDiff = b.lastActiveAt - a.lastActiveAt;
            if (timeDiff !== 0) return timeDiff;
            return b.createdAt - a.createdAt;
          });
      },

      getActiveThread: () => {
        const state = get();
        return state.activeThreadId ? state.threads[state.activeThreadId] || null : null;
      },

      // --------------------------------------------------------------
      // Thread Update Helpers
      // --------------------------------------------------------------

      incrementMessageCount: (threadId: string) => {
        const state = get();
        const thread = state.threads[threadId];

        if (thread) {
          const now = Date.now();
          set(state => ({
            threads: {
              ...state.threads,
              [threadId]: {
                ...thread,
                messageCount: thread.messageCount + 1,
                updatedAt: now,
                lastActiveAt: now,
              },
            },
          }));
        }
      },

      updateThreadTimestamp: (threadId: string) => {
        const state = get();
        const thread = state.threads[threadId];

        if (thread) {
          const now = Date.now();
          set(state => ({
            threads: {
              ...state.threads,
              [threadId]: {
                ...thread,
                updatedAt: now,
                lastActiveAt: now,
              },
            },
          }));
        }
      },

      addAgentTask: (threadId: string, agentId: string) => {
        const state = get();
        const thread = state.threads[threadId];

        if (thread && !thread.agentTasks.includes(agentId)) {
          set(state => ({
            threads: {
              ...state.threads,
              [threadId]: {
                ...thread,
                agentTasks: [...thread.agentTasks, agentId],
              },
            },
          }));
        }
      },

      removeAgentTask: (threadId: string, agentId: string) => {
        const state = get();
        const thread = state.threads[threadId];

        if (thread) {
          set(state => ({
            threads: {
              ...state.threads,
              [threadId]: {
                ...thread,
                agentTasks: thread.agentTasks.filter(id => id !== agentId),
              },
            },
          }));
        }
      },

      markUnreadActivity: (threadId: string, hasUnread: boolean) => {
        const state = get();
        const thread = state.threads[threadId];

        // Only mark if not the active thread
        if (thread && threadId !== state.activeThreadId && thread.hasUnreadActivity !== hasUnread) {
          set(state => ({
            threads: {
              ...state.threads,
              [threadId]: {
                ...thread,
                hasUnreadActivity: hasUnread,
              },
            },
          }));
        }
      },

      toggleThreadPinned: (threadId: string) => {
        const state = get();
        const thread = state.threads[threadId];

        if (thread) {
          set(state => ({
            threads: {
              ...state.threads,
              [threadId]: {
                ...thread,
                pinned: !thread.pinned,
              },
            },
          }));
        }
      },

      archiveThread: (threadId: string) => {
        const state = get();
        const thread = state.threads[threadId];

        if (thread && thread.status === 'active') {
          set(state => ({
            threads: {
              ...state.threads,
              [threadId]: {
                ...thread,
                status: 'archived',
                pinned: false, // Unpin when archiving
              },
            },
          }));

          // If archiving active thread, switch to another
          if (state.activeThreadId === threadId) {
            const activeThreads = Object.values(state.threads)
              .filter(t => t.status === 'active')
              .sort((a, b) => b.lastActiveAt - a.lastActiveAt);

            const newActiveId = activeThreads.length > 0 ? activeThreads[0].id : null;
            set({ activeThreadId: newActiveId });
          }
        }
      },

      unarchiveThread: (threadId: string) => {
        const state = get();
        const thread = state.threads[threadId];

        if (thread && thread.status === 'archived') {
          set(state => ({
            threads: {
              ...state.threads,
              [threadId]: {
                ...thread,
                status: 'active',
              },
            },
          }));
        }
      },

      // --------------------------------------------------------------
      // Search and Filter
      // --------------------------------------------------------------

      setSearchQuery: (query: string) => {
        set({ searchQuery: query });
      },

      setTagFilter: (tag: string | null) => {
        set({ tagFilter: tag });
      },

      // --------------------------------------------------------------
      // Maintenance
      // --------------------------------------------------------------

      clearDeletedThreads: () => {
        const state = get();
        const newThreads = Object.fromEntries(
          Object.entries(state.threads).filter(([id, t]) => t.status !== 'deleted')
        );

        set({ threads: newThreads });
      },

      autoArchiveOldThreads: (daysOld: number) => {
        const state = get();
        const now = Date.now();
        const cutoffTime = now - (daysOld * 24 * 60 * 60 * 1000);

        let archivedCount = 0;

        // Find threads to archive (not pinned, active status, older than cutoff)
        const threadsToArchive = Object.entries(state.threads)
          .filter(([id, thread]) => {
            return (
              thread.status === 'active' &&
              !thread.pinned &&
              thread.lastActiveAt < cutoffTime
            );
          })
          .map(([id]) => id);

        // Archive the threads
        if (threadsToArchive.length > 0) {
          const updatedThreads = { ...state.threads };

          threadsToArchive.forEach(threadId => {
            if (updatedThreads[threadId]) {
              updatedThreads[threadId] = {
                ...updatedThreads[threadId],
                status: 'archived' as const,
              };
              archivedCount++;
            }
          });

          set({ threads: updatedThreads });
        }

        console.log(`[ThreadStore] Auto-archived ${archivedCount} threads older than ${daysOld} days`);

        return archivedCount;
      },

      reset: () => {
        set(INITIAL_THREAD_STATE);
      },
    }),
    {
      name: 'ifai-thread-storage',
      version: 1,
      // Only persist essential data
      partialize: (state) => {
        // 过滤掉已删除的线程
        const activeThreads: Record<string, Thread> = {};
        Object.entries(state.threads).forEach(([id, thread]) => {
          if (thread.status !== 'deleted') {
            activeThreads[id] = thread;
          }
        });

        return {
          threads: activeThreads,
          activeThreadId: state.activeThreadId,
          maxThreads: state.maxThreads,
          titleCounters: state.titleCounters,  // 持久化标题计数器
          // Don't persist search/filter state
        };
      },
      migrate: (persistedState: any, version: number) => {
        console.log(`[ThreadStore] Migrating from version ${version} to 1`);
        return persistedState;
      },
      // 🔥 FIX: 在 rehydration 后验证状态
      onRehydrateStorage: () => (state) => {
        console.log('[ThreadStore] Rehydration completed', {
          activeThreadId: state?.activeThreadId,
          threadCount: Object.keys(state?.threads || {}).length
        });
        // 如果 rehydration 后 activeThreadId 为 null 但有 threads，设置第一个为活跃
        if (state && !state.activeThreadId && Object.keys(state.threads).length > 0) {
          const threads = Object.values(state.threads);
          const mostRecent = threads.sort((a, b) => {
            const timeDiff = b.lastActiveAt - a.lastActiveAt;
            if (timeDiff !== 0) return timeDiff;
            return b.createdAt - a.createdAt;
          })[0];
          state.activeThreadId = mostRecent.id;
          console.log('[ThreadStore] Auto-set activeThreadId after rehydration:', mostRecent.id);
        }
      },
    }
  )
);

// ============================================================================
// Selectors
// ============================================================================

/**
 * Get filtered threads based on current search/tag filters
 */
export const selectFilteredThreads = (state: ThreadStore): Thread[] => {
  return state.getAllThreads();
};

/**
 * Get active thread
 */
export const selectActiveThread = (state: ThreadStore): Thread | null => {
  return state.getActiveThread();
};

/**
 * Check if there are any pinned threads
 */
export const selectHasPinnedThreads = (state: ThreadStore): boolean => {
  return Object.values(state.threads).some(t => t.pinned && t.status === 'active');
};

/**
 * Get all unique tags across all threads
 */
export const selectAllTags = (state: ThreadStore): string[] => {
  const tags = new Set<string>();
  Object.values(state.threads)
    .filter(t => t.status === 'active')
    .forEach(t => t.tags.forEach(tag => tags.add(tag)));
  return Array.from(tags).sort();
};

// @ts-ignore
if (typeof window !== 'undefined') {
  (window as any).__threadStore = useThreadStore;
}
