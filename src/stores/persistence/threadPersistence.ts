/**
 * Thread Persistence Service
 *
 * Handles automatic saving and loading of thread data using IndexedDB.
 */

import { indexedDBHelper, initIndexedDB, type StoredThread, type StoredMessage } from './indexedDB';
import type { Thread } from '../threadStore';
import type { Message } from 'ifainew-core';
import { getThreadMessages, setThreadMessages } from '../useChatStore';

// 🏆 PIVO 3.0: 物理合规性标记
export const PIVO_3_0_STORAGE_READY = true;

// ============================================================================
// Configuration
// ============================================================================

const AUTO_SAVE_DELAY = 1000; // Auto-save 1 second after last change
let saveTimeout: number | null = null;

// ============================================================================
// Type Conversion
// ============================================================================

/**
 * Convert Thread to StoredThread format
 */
function threadToStored(thread: Thread): StoredThread {
  return {
    id: thread.id,
    title: thread.title,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
    lastActiveAt: thread.lastActiveAt,
    messageCount: thread.messageCount,
    agentTasks: thread.agentTasks,
    status: thread.status,
    hasUnreadActivity: thread.hasUnreadActivity,
    tags: thread.tags,
    pinned: thread.pinned,
    description: thread.description,
  };
}

/**
 * Convert StoredThread to Thread format
 */
function storedToThread(stored: StoredThread): Thread {
  return {
    id: stored.id,
    title: stored.title,
    createdAt: stored.createdAt,
    updatedAt: stored.updatedAt,
    lastActiveAt: stored.lastActiveAt,
    messageCount: stored.messageCount,
    agentTasks: stored.agentTasks,
    status: stored.status,
    hasUnreadActivity: stored.hasUnreadActivity,
    tags: stored.tags,
    pinned: stored.pinned,
    description: stored.description,
  };
}

/**
 * Convert Message with threadId to StoredMessage
 *
 * 🔥 FIX: Validate that message.id exists before conversion.
 */
function messageToStored(message: Message, threadId: string): StoredMessage | null {
  // Validate message.id exists and is a valid string
  if (!message.id || message.id === undefined || message.id === null || message.id === '') {
    console.warn('[ThreadPersistence] ⚠️ Skipping message without valid ID:', {
      threadId,
      role: message.role,
      contentPreview: typeof message.content === 'string'
        ? message.content.substring(0, 50)
        : JSON.stringify(message.content).substring(0, 50),
      hasId: 'id' in message,
      idValue: message.id,
      idType: typeof message.id
    });
    return null;  // Return null to indicate this message should be skipped
  }

  // 🔥 v0.3.7: 存储空间优化
  // 1. 移除冗余的 contentSegments
  // 2. 🏆 PIVO 3.0: 彻底移除物理截断逻辑
  // 既然已迁移至 IndexedDB，不再需要为 LocalStorage 牺牲数据保真度
  const finalContent = typeof message.content === 'string' ? message.content : JSON.stringify(message.content);

  return {
    id: message.id,
    threadId,
    role: message.role,
    content: finalContent,
    toolCalls: message.toolCalls,
    tool_call_id: message.tool_call_id,
    timestamp: message.timestamp || Date.now(),
    // 🏆 重要：保留有序段落数据，确保 Tab 切换后不丢失
    segments: (message as any).segments,
    // Copy all other properties
    multiModalContent: (message as any).multiModalContent,
    references: (message as any).references,
    agentId: (message as any).agentId,
    isAgentLive: (message as any).isAgentLive,
    isStreaming: (message as any).isStreaming,
    // 🔥 v0.3.7: 确保内联编辑元数据持久化
    isInlineTask: (message as any).isInlineTask,
    displayLabel: (message as any).displayLabel,
    exploreProgress: (message as any).exploreProgress,
  };
}

/**
 * Convert StoredMessage back to Message
 */
function storedToMessage(stored: StoredMessage): Message {
  const { threadId, ...message } = stored;
  // 🔥 CRITICAL FIX: 确保 timestamp 被包含在返回的消息中
  // 这是消息按时间顺序排序的关键字段
  return { ...message, timestamp: stored.timestamp } as Message;
}

// ============================================================================
// Persistence Service
// ============================================================================

class ThreadPersistenceService {
  private initialized = false;
  private saveQueue = new Set<string>();
  private isSaving = false;

  /**
   * Initialize the persistence service
   */
  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      await initIndexedDB();
      this.initialized = true;
      console.log('[ThreadPersistence] Service initialized');
    } catch (error) {
      console.error('[ThreadPersistence] Initialization failed:', error);
    }
  }

  /**
   * Save a single thread
   */
  async saveThread(thread: Thread): Promise<void> {
    if (!this.initialized) {
      return;
    }

    try {
      const stored = threadToStored(thread);
      await indexedDBHelper.saveThread(stored);
    } catch (error) {
      console.error('[ThreadPersistence] Failed to save thread:', error);
    }
  }

  /**
   * Save multiple threads
   */
  async saveThreads(threads: Thread[]): Promise<void> {
    if (!this.initialized || threads.length === 0) {
      return;
    }

    try {
      const stored = threads.map(threadToStored);
      await indexedDBHelper.saveThreads(stored);
      console.log(`[ThreadPersistence] Saved ${threads.length} threads`);
    } catch (error) {
      console.error('[ThreadPersistence] Failed to save threads:', error);
    }
  }

  /**
   * Delete a thread and all its messages (Physical cleanup)
   */
  async deleteThreadPhysical(threadId: string): Promise<void> {
    if (!this.initialized) return;
    try {
      await Promise.all([
        indexedDBHelper.deleteThread(threadId),
        indexedDBHelper.deleteThreadMessages(threadId)
      ]);
      console.log(`[ThreadPersistence] Physically deleted thread and messages: ${threadId}`);
    } catch (error) {
      console.error('[ThreadPersistence] Physical delete failed:', error);
    }
  }

  /**
   * Save messages for a thread
   */
  async saveThreadMessages(threadId: string, messages: Message[]): Promise<void> {
    if (!this.initialized) {
      return;
    }

    try {
      const validStoredMessages: StoredMessage[] = [];
      const skippedCount = { invalidId: 0 };

      for (const message of messages) {
        const stored = messageToStored(message, threadId);
        if (stored !== null) {
          validStoredMessages.push(stored);
        } else {
          skippedCount.invalidId++;
        }
      }

      if (skippedCount.invalidId > 0) {
        console.warn(`[ThreadPersistence] ⚠️ Skipped ${skippedCount.invalidId} message(s) without valid IDs for thread: ${threadId}`);
      }

      if (validStoredMessages.length > 0) {
        await indexedDBHelper.saveMessages(validStoredMessages);
      }
    } catch (error) {
      console.error('[ThreadPersistence] Failed to save messages:', error);
    }
  }

  /**
   * Load all threads
   */
  async loadAllThreads(): Promise<Thread[]> {
    if (!this.initialized) {
      return [];
    }

    try {
      const stored = await indexedDBHelper.getAllThreads();
      return stored.map(storedToThread);
    } catch (error) {
      console.error('[ThreadPersistence] Failed to load threads:', error);
      return [];
    }
  }

  /**
   * Load messages for a thread
   */
  async loadThreadMessages(threadId: string): Promise<Message[]> {
    if (!this.initialized) {
      return [];
    }

    try {
      const stored = await indexedDBHelper.getThreadMessages(threadId);
      const messages = stored.map(storedToMessage);

      return messages;
    } catch (error) {
      console.error('[ThreadPersistence] Failed to load messages:', error);
      return [];
    }
  }

  /**
   * Delete a thread
   */
  async deleteThread(threadId: string): Promise<void> {
    if (!this.initialized) {
      return;
    }

    try {
      await indexedDBHelper.deleteThread(threadId);
      await indexedDBHelper.deleteThreadMessages(threadId);
      console.log(`[ThreadPersistence] Deleted thread: ${threadId}`);
    } catch (error) {
      console.error('[ThreadPersistence] Failed to delete thread:', error);
    }
  }

  /**
   * Queue a thread for auto-save (debounced)
   */
  queueAutoSave(threadId: string): void {
    this.saveQueue.add(threadId);

    if (saveTimeout !== null) {
      clearTimeout(saveTimeout);
    }

    saveTimeout = window.setTimeout(() => {
      this.processSaveQueue();
    }, AUTO_SAVE_DELAY);
  }

  /**
   * Process the save queue
   * 🏆 FIX: 在保存前再次检查 threadId 是否仍是当前活跃线程，避免时序问题
   */
  private async processSaveQueue(): Promise<void> {
    if (this.isSaving || this.saveQueue.size === 0) {
      return;
    }

    this.isSaving = true;
    const threadIds = Array.from(this.saveQueue);
    this.saveQueue.clear();

    try {
      const { useThreadStore } = await import('../threadStore');
      const { useChatStore } = await import('../useChatStore');

      for (const threadId of threadIds) {
        // 🏆 关键修复：在保存每个 thread 前重新检查当前活跃线程
        // 这避免了在获取 currentThreadId 和保存消息之间发生 Tab 切换导致的串扰
        const threadStore = useThreadStore.getState();
        const currentThreadId = threadStore.activeThreadId;

        const thread = threadStore.getThread(threadId);
        if (thread) {
          await this.saveThread(thread);

          // 🏆 关键：只有当 threadId 仍是当前活跃线程时，才保存全局消息
          // 因为全局 messages 只包含当前线程的消息
          if (threadId === currentThreadId) {
            const messages = useChatStore.getState().messages;
            await this.saveThreadMessages(threadId, messages as any);
          }
        }
      }
    } catch (error) {
      console.error('[ThreadPersistence] Failed to process save queue:', error);
    } finally {
      this.isSaving = false;
    }
  }

  /**
   * Export all data to JSON
   */
  async exportToJSON(): Promise<string> {
    if (!this.initialized) {
      throw new Error('Persistence service not initialized');
    }

    const data = await indexedDBHelper.exportToJSON();
    return JSON.stringify(data, null, 2);
  }

  /**
   * Import data from JSON
   */
  async importFromJSON(jsonString: string): Promise<void> {
    if (!this.initialized) {
      throw new Error('Persistence service not initialized');
    }

    try {
      const data = JSON.parse(jsonString);
      await indexedDBHelper.importFromJSON(data);
      await this.restoreFromStorage();
      console.log('[ThreadPersistence] Import completed successfully');
    } catch (error) {
      console.error('[ThreadPersistence] Import failed:', error);
      throw error;
    }
  }

  /**
   * Restore all threads from IndexedDB to threadStore
   */
  async restoreFromStorage(): Promise<void> {
    if (!this.initialized) {
      console.warn('[ThreadPersistence] Not initialized, skipping restore');
      return;
    }

    try {
      console.log('[ThreadPersistence] Starting restore from storage...');
      const threads = await this.loadAllThreads();
      const { useThreadStore } = await import('../threadStore');
      const currentStore = useThreadStore.getState();
      const hasExistingThreads = Object.keys(currentStore.threads).length > 0;
      const storedActiveThreadId = currentStore.activeThreadId;

      if (threads.length === 0 && !hasExistingThreads) {
        const uuid = await import('uuid');
        const uuidv4 = uuid.v4;
        const defaultThread = {
          id: uuidv4(),
          title: '新对话',
          createdAt: Date.now(),
          lastActiveAt: Date.now(),
          messageCount: 0
        };
        useThreadStore.getState().createThread(defaultThread);
        return;
      }

      if (threads.length === 0 && hasExistingThreads) {
        // 🔥 FIX: threadStore 有线程但 IndexedDB 没有（可能之前 VersionError 导致未保存）
        // 将 threadStore 的线程同步到 IndexedDB，然后恢复当前活跃线程
        console.log('[ThreadPersistence] 🔄 Syncing threadStore threads to IndexedDB...');
        const existingThreads = Object.values(currentStore.threads).filter(t => t.status !== 'deleted');
        await this.saveThreads(existingThreads);

        const targetId = currentStore.activeThreadId;
        if (targetId && currentStore.threads[targetId]) {
          const { switchThread } = await import('../useChatStore');
          switchThread(targetId);
        }
        console.log(`[ThreadPersistence] ✅ Synced ${existingThreads.length} threads from threadStore to IndexedDB`);
        return;
      }

      const threadsMap: Record<string, Thread> = {};
      threads.forEach(thread => {
        if (thread.status !== 'deleted') {
          threadsMap[thread.id] = thread;
        }
      });

      // 🔥 FIX: 恢复 activeThreadId 和 threads
      useThreadStore.setState({
        threads: threadsMap,
        activeThreadId: storedActiveThreadId || null
      });

      // 🏆 FIX: 只收集统计信息，不为所有线程调用 setThreadMessages
      // 因为 setThreadMessages 会覆盖全局 messages，导致所有线程显示相同内容
      let totalMessages = 0;
      for (const thread of threads) {
        const messages = await this.loadThreadMessages(thread.id);
        totalMessages += messages.length;
      }

      if (threads.length > 0) {
        // 🔥 FIX: 优先使用持久化的 activeThreadId，如果不存在则选择有消息的最新线程
        let targetThreadId = storedActiveThreadId;

        if (!targetThreadId || !threadsMap[targetThreadId]) {
          // 如果没有持久化的 activeThreadId 或该线程不存在，选择有消息的最新线程
          const threadsWithMessages = await Promise.all(
            threads.map(async (thread) => ({
              ...thread,
              messageCount: (await this.loadThreadMessages(thread.id)).length
            }))
          );

          const validThreads = threadsWithMessages.filter(t => t.messageCount > 0);
          const mostRecent = validThreads.sort((a, b) => b.lastActiveAt - a.lastActiveAt)[0];

          if (mostRecent) {
            targetThreadId = mostRecent.id;
            // 更新 activeThreadId
            useThreadStore.setState({ activeThreadId: targetThreadId });
          }
        }

        if (targetThreadId) {
          const { switchThread } = await import('../useChatStore');
          switchThread(targetThreadId);
        }
      }

      console.log(`[ThreadPersistence] ✅ Restored ${threads.length} threads with ${totalMessages} total messages`);
      
      // 🏆 PIVO 3.0: 物理管线信号 - 持久化层已就绪
      window.dispatchEvent(new CustomEvent('ifainew:persistence-hydrated', { 
        detail: { threadCount: threads.length, messageCount: totalMessages } 
      }));
    } catch (error) {
      console.error('[ThreadPersistence] ❌ Failed to restore from storage:', error);
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const threadPersistence = new ThreadPersistenceService();

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Initialize persistence and restore data on app startup
 */
export async function initThreadPersistence(): Promise<void> {
  await threadPersistence.init();
  await threadPersistence.restoreFromStorage();
}

/**
 * Trigger auto-save for a thread
 */
export function autoSaveThread(threadId: string): void {
  threadPersistence.queueAutoSave(threadId);
}

/**
 * Export all threads to JSON file
 */
export async function exportThreadsToFile(): Promise<void> {
  try {
    const json = await threadPersistence.exportToJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ifai-threads-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('[ThreadPersistence] Export failed:', error);
    throw error;
  }
}

/**
 * Import threads from JSON file
 */
export async function importThreadsFromFile(file: File): Promise<void> {
  try {
    const text = await file.text();
    await threadPersistence.importFromJSON(text);
  } catch (error) {
    console.error('[ThreadPersistence] Import failed:', error);
    throw error;
  }
}
