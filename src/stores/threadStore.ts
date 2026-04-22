/**
 * Thread Store - Multi-thread Chat Session Management
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Message } from 'ifainew-core';
import { autoSaveThread } from './persistence/threadPersistence';
import { PersistenceManager } from '../services/storage/PersistenceManager';

// ============================================================================
// Types
// ============================================================================

export type ThreadStatus = 'active' | 'archived' | 'deleted';

export interface Thread {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  lastActiveAt: number;
  messageCount: number;
  agentTasks: string[];
  status: ThreadStatus;
  hasUnreadActivity: boolean;
  tags: string[];
  pinned: boolean;
  description?: string;
}

export interface ThreadOptions {
  title?: string;
  tags?: string[];
  pinned?: boolean;
  description?: string;
}

interface ThreadState {
  threads: Record<string, Thread>;
  activeThreadId: string | null;
  maxThreads: number;
  searchQuery: string;
  tagFilter: string | null;
  titleCounters: Record<string, number>;
  isHydrating: boolean; // 🏆 PIVO 3.0: 异步加载状态
}

interface ThreadActions {
  createThread: (options?: ThreadOptions) => string;
  deleteThread: (threadId: string) => void;
  switchThread: (threadId: string) => void;
  updateThread: (threadId: string, updates: Partial<Thread>) => void;
  updateThreadTitleFromMessage: (threadId: string, messageContent: string | any[]) => void;
  setActiveThread: (threadId: string | null) => void;
  getThread: (threadId: string) => Thread | undefined;
  getAllThreads: () => Thread[];
  getActiveThread: () => Thread | null;
  incrementMessageCount: (threadId: string) => void;
  updateThreadTimestamp: (threadId: string) => void;
  addAgentTask: (threadId: string, agentId: string) => void;
  removeAgentTask: (threadId: string, agentId: string) => void;
  markUnreadActivity: (threadId: string, hasUnread: boolean) => void;
  toggleThreadPinned: (threadId: string) => void;
  archiveThread: (threadId: string) => void;
  unarchiveThread: (threadId: string) => void;
  setSearchQuery: (query: string) => void;
  setTagFilter: (tag: string | null) => void;
  clearDeletedThreads: () => void;
  autoArchiveOldThreads: (daysOld: number) => number;
  reset: () => void;
  syncState: (state: Partial<ThreadState>) => void;
}

type ThreadStore = ThreadState & ThreadActions;

// ============================================================================
// Utilities
// ============================================================================

function generateThreadId(): string {
  return `thread_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
}

function generateDefaultTitle(counters: Record<string, number>): string {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? '上午' : hour < 18 ? '下午' : '晚上';
  const count = counters[greeting] || 0;
  if (count === 0) return `${greeting}的新对话`;
  return `${greeting}的对话 ${count}`;
}

function generateTitleFromMessage(content: string | any[]): string {
  let textContent = '';
  if (typeof content === 'string') textContent = content;
  else if (Array.isArray(content)) {
    textContent = content.filter(p => p.type === 'text').map(p => p.text).join(' ');
  }
  const maxLength = 30;
  if (textContent.length > maxLength) return textContent.slice(0, maxLength) + '...';
  return textContent || '新对话';
}

const INITIAL_THREAD_STATE: ThreadState = {
  threads: {},
  activeThreadId: null,
  maxThreads: 20,
  searchQuery: '',
  tagFilter: null,
  titleCounters: { '上午': 0, '下午': 0, '晚上': 0 },
  isHydrating: true,
};

export const useThreadStore = create<ThreadStore>()(
  persist(
    (set, get) => ({
      ...INITIAL_THREAD_STATE,

      syncState: (newState) => set((state) => ({ ...state, ...newState })),

      createThread: ((options: ThreadOptions = {}) => {
        const state = get();
        const threadCount = Object.values(state.threads).filter(t => t.status !== 'deleted').length;

        if (threadCount >= state.maxThreads) {
          const threadsToArchive = Object.values(state.threads)
            .filter(t => t.status === 'active' && !t.pinned)
            .sort((a, b) => a.lastActiveAt - b.lastActiveAt);
          if (threadsToArchive.length > 0) get().archiveThread(threadsToArchive[0].id);
        }

        const threadId = generateThreadId();
        const now = Date.now();
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

        if (!options.title) {
          const hour = new Date().getHours();
          const greeting = hour < 12 ? '上午' : hour < 18 ? '下午' : '晚上';
          set(state => ({
            titleCounters: { ...state.titleCounters, [greeting]: (state.titleCounters[greeting] || 0) + 1 }
          }));
        }

        set(state => ({
          threads: { ...state.threads, [threadId]: newThread },
          activeThreadId: threadId,
        }));

        // 🔥 FIX: 同步更新 chatStore.currentThreadId，确保 sendMessage 能找到正确的线程
        // 否则标题自动更新功能会失效（currentThread 为 undefined）
        if (typeof window !== 'undefined' && (window as any).__chatStore) {
          (window as any).__chatStore.setState({
            messages: [],
            currentThreadId: threadId
          });
          console.log('[ThreadStore] 🔀 同步 currentThreadId 到 chatStore:', threadId.substring(0, 20));
        }

        autoSaveThread(threadId);
        return threadId;
      }) as any,

      deleteThread: (threadId: string) => {
        const state = get();
        const thread = state.threads[threadId];
        if (!thread) return;

        set(state => {
          const newThreads = { ...state.threads };
          newThreads[threadId] = { ...thread, status: 'deleted' };
          let newActiveThreadId = state.activeThreadId;
          if (state.activeThreadId === threadId) {
            const activeThreads = Object.values(newThreads)
              .filter(t => t.status === 'active')
              .sort((a, b) => b.lastActiveAt - a.lastActiveAt);
            newActiveThreadId = activeThreads.length > 0 ? activeThreads[0].id : null;
          }
          return { threads: newThreads, activeThreadId: newActiveThreadId };
        });
        autoSaveThread(threadId);
      },

      switchThread: async (threadId: string) => {
        console.log('[ThreadStore] 🔄 开始切换到 thread:', threadId.substring(0, 20));
        const state = get();
        const thread = state.threads[threadId];
        if (!thread || thread.status === 'deleted') {
          console.log('[ThreadStore] ⚠️ Thread 无效或已删除');
          return;
        }

        // 🏆 关键修复：切换 Tab 前，先同步保存当前活跃线程的消息
        // 这样可以避免消息串扰到新 Tab
        const oldThreadId = state.activeThreadId;
        if (oldThreadId && oldThreadId !== threadId) {
          // 同步等待保存完成
          const { threadPersistence } = await import('./persistence/threadPersistence');
          const { useChatStore } = await import('./useChatStore');

          // 获取旧线程的消息（在切换前）
          const oldMessages = useChatStore.getState().messages;

          // 保存旧线程的消息
          await threadPersistence.saveThreadMessages(oldThreadId, oldMessages as any);
          console.log('[ThreadStore] 💾 保存旧线程消息:', oldThreadId.substring(0, 20), '消息数:', oldMessages.length);
        }

        set(state => ({
          activeThreadId: threadId,
          threads: {
            ...state.threads,
            [threadId]: { ...thread, hasUnreadActivity: false },
          },
        }));

        // 🏆 关键修复：使用 await 而不是 .then()，确保消息加载完成后再返回
        // 这样可以避免测试在消息加载完成前就检查内容
        console.log('[ThreadStore] 📥 准备加载消息...');
        const { switchThread: loadThreadMessages } = await import('./useChatStore');
        await loadThreadMessages(threadId);
        console.log('[ThreadStore] ✅ 消息加载完成');
      },

      updateThread: (threadId: string, updates: Partial<Thread>) => {
        const state = get();
        const thread = state.threads[threadId];
        if (!thread) return;

        set(state => ({
          threads: {
            ...state.threads,
            [threadId]: { ...thread, ...updates, id: threadId, createdAt: thread.createdAt },
          },
        }));
        autoSaveThread(threadId);
      },

      updateThreadTitleFromMessage: (threadId: string, messageContent: string | any[]) => {
        const state = get();
        const thread = state.threads[threadId];
        if (!thread) return;

        const isDefaultTitle = /^(上午|下午|晚上)(的新对话|的对话 \d+)$/.test(thread.title);
        if (!isDefaultTitle) return;

        const newTitle = generateTitleFromMessage(messageContent);
        if (newTitle === thread.title) return;

        set(state => ({
          threads: {
            ...state.threads,
            [threadId]: { ...thread, title: newTitle, updatedAt: Date.now() },
          },
        }));
        autoSaveThread(threadId);
      },

      setActiveThread: (threadId: string | null) => set({ activeThreadId: threadId }),
      getThread: (threadId: string) => get().threads[threadId],
      getAllThreads: () => {
        const state = get();
        return Object.values(state.threads)
          .filter(t => t.status === 'active')
          .sort((a, b) => {
            if (a.pinned && !b.pinned) return -1;
            if (!a.pinned && b.pinned) return 1;
            const timeDiff = b.lastActiveAt - a.lastActiveAt;
            if (timeDiff !== 0) return timeDiff;
            return b.createdAt - a.createdAt;
          });
      },
      getActiveThread: () => get().activeThreadId ? get().threads[get().activeThreadId!] || null : null,

      incrementMessageCount: (threadId: string) => {
        const thread = get().threads[threadId];
        if (thread) {
          const now = Date.now();
          set(state => ({
            threads: {
              ...state.threads,
              [threadId]: { ...thread, messageCount: thread.messageCount + 1, updatedAt: now, lastActiveAt: now }
            }
          }));
        }
      },

      updateThreadTimestamp: (threadId: string) => {
        const thread = get().threads[threadId];
        if (thread) {
          const now = Date.now();
          set(state => ({
            threads: {
              ...state.threads,
              [threadId]: { ...thread, updatedAt: now, lastActiveAt: now }
            }
          }));
        }
      },

      addAgentTask: (threadId: string, agentId: string) => {
        const thread = get().threads[threadId];
        if (thread && !thread.agentTasks.includes(agentId)) {
          set(state => ({
            threads: {
              ...state.threads,
              [threadId]: { ...thread, agentTasks: [...thread.agentTasks, agentId] }
            }
          }));
        }
      },

      removeAgentTask: (threadId: string, agentId: string) => {
        const thread = get().threads[threadId];
        if (thread) {
          set(state => ({
            threads: {
              ...state.threads,
              [threadId]: { ...thread, agentTasks: thread.agentTasks.filter(id => id !== agentId) }
            }
          }));
        }
      },

      markUnreadActivity: (threadId: string, hasUnread: boolean) => {
        const state = get();
        const thread = state.threads[threadId];
        if (thread && threadId !== state.activeThreadId) {
          set(state => ({
            threads: { ...state.threads, [threadId]: { ...thread, hasUnreadActivity: hasUnread } }
          }));
        }
      },

      toggleThreadPinned: (threadId: string) => {
        const thread = get().threads[threadId];
        if (thread) {
          set(state => ({
            threads: { ...state.threads, [threadId]: { ...thread, pinned: !thread.pinned } }
          }));
        }
      },

      archiveThread: (threadId: string) => {
        const state = get();
        const thread = state.threads[threadId];
        if (thread && thread.status === 'active') {
          set(state => ({
            threads: { ...state.threads, [threadId]: { ...thread, status: 'archived', pinned: false } }
          }));
          if (state.activeThreadId === threadId) {
            const activeThreads = Object.values(get().threads).filter(t => t.status === 'active').sort((a,b) => b.lastActiveAt - a.lastActiveAt);
            set({ activeThreadId: activeThreads.length > 0 ? activeThreads[0].id : null });
          }
        }
      },

      unarchiveThread: (threadId: string) => {
        const thread = get().threads[threadId];
        if (thread && thread.status === 'archived') {
          set(state => ({
            threads: { ...state.threads, [threadId]: { ...thread, status: 'active' } }
          }));
        }
      },

      setSearchQuery: (query: string) => set({ searchQuery: query }),
      setTagFilter: (tag: string | null) => set({ tagFilter: tag }),
      clearDeletedThreads: () => {
        set(state => ({
          threads: Object.fromEntries(Object.entries(state.threads).filter(([id, t]) => t.status !== 'deleted'))
        }));
      },

      autoArchiveOldThreads: (daysOld: number) => {
        const now = Date.now();
        const cutoff = now - (daysOld * 24 * 60 * 60 * 1000);
        let count = 0;
        set(state => {
          const newThreads = { ...state.threads };
          Object.keys(newThreads).forEach(id => {
            if (newThreads[id].status === 'active' && !newThreads[id].pinned && newThreads[id].lastActiveAt < cutoff) {
              newThreads[id] = { ...newThreads[id], status: 'archived' };
              count++;
            }
          });
          return { threads: newThreads };
        });
        return count;
      },

      reset: () => set(INITIAL_THREAD_STATE),
    }),
    {
      name: 'ifai-thread-storage',
      storage: createJSONStorage(() => PersistenceManager.getInstance()),
      partialize: (state) => ({
        threads: Object.fromEntries(Object.entries(state.threads).filter(([id, t]) => t.status !== 'deleted')),
        // 🔥 FIX: 持久化 activeThreadId，确保重新进入应用时恢复到最后活跃的 tab
        activeThreadId: state.activeThreadId,
        maxThreads: state.maxThreads,
        titleCounters: state.titleCounters,
      }),
      onRehydrateStorage: () => (state, error) => {
        if (error) console.error('[ThreadStore] ❌ Hydration error:', error);
        if (state) {
          console.log('[ThreadStore] ✅ Hydration complete, activeThreadId:', state.activeThreadId);
          state.syncState({ isHydrating: false });
        } else {
          setTimeout(() => {
            useThreadStore.setState({ isHydrating: false });
            console.log('[ThreadStore] 🛡️ Hydration fallback release');
          }, 100);
        }
      }
    }
  )
);

/** Selectors */
export const selectFilteredThreads = (state: ThreadStore): Thread[] => state.getAllThreads();
export const selectActiveThread = (state: ThreadStore): Thread | null => state.getActiveThread();
export const selectHasPinnedThreads = (state: ThreadStore): boolean => Object.values(state.threads).some(t => t.pinned && t.status === 'active');
export const selectAllTags = (state: ThreadStore): string[] => {
  const tags = new Set<string>();
  Object.values(state.threads).filter(t => t.status === 'active').forEach(t => t.tags.forEach(tag => tags.add(tag)));
  return Array.from(tags).sort();
};

if (typeof window !== 'undefined') (window as any).__threadStore = useThreadStore;
