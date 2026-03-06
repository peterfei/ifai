/**
 * Thread Persistence Service
 *
 * Handles automatic saving and loading of thread data using IndexedDB.
 */

import { indexedDBHelper, initIndexedDB, type StoredThread, type StoredMessage } from './indexedDB';
import type { Thread } from '../threadStore';
import type { Message } from 'ifainew-core';
import { getThreadMessages, setThreadMessages } from '../useChatStore';

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
 * If message.id is missing, undefined, or null, the IndexedDB save will fail with:
 * DataError: Failed to store record in an IDBObjectStore: Evaluating the object store's key path did not yield a value.
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
  // 2. 🏆 PIVO 3.0: 移除物理截断逻辑
  // 既然已迁移至 IndexedDB，不再需要为 LocalStorage 牺牲数据保真度
  const finalContent = typeof message.content === 'string' ? message.content : JSON.stringify(message.content);

  const cleanMessage = {
    ...message,
    contentSegments: undefined,
  };

  return {
    id: message.id,
    threadId,
    role: message.role,
    content: finalContent,
    toolCalls: message.toolCalls,
    tool_call_id: message.tool_call_id,
    timestamp: Date.now(),
    // Copy all other properties
    multiModalContent: (cleanMessage as any).multiModalContent,
    references: (cleanMessage as any).references,
    agentId: (cleanMessage as any).agentId,
    isAgentLive: (cleanMessage as any).isAgentLive,
    // 🔥 v0.3.7: 确保内联编辑元数据持久化
    isInlineTask: (cleanMessage as any).isInlineTask,
    displayLabel: (cleanMessage as any).displayLabel,
    exploreProgress: (cleanMessage as any).exploreProgress,
  };
}

/**
 * Convert StoredMessage back to Message
 */
function storedToMessage(stored: StoredMessage): Message {
  const { threadId, timestamp, ...message } = stored;
  return message as Message;
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
      // Don't throw - allow app to run without persistence
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
      console.log(`[ThreadPersistence] Saved thread: ${thread.id}`);
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
   *
   * 🔥 FIX: Filter out messages that fail conversion (missing id).
   * messageToStored now returns null for invalid messages to prevent IndexedDB errors.
   */
  async saveThreadMessages(threadId: string, messages: Message[]): Promise<void> {
    if (!this.initialized) {
      return;
    }

    try {
      // Convert messages to stored format, filtering out any that return null (invalid)
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

      // Log warning if any messages were skipped
      if (skippedCount.invalidId > 0) {
        console.warn(`[ThreadPersistence] ⚠️ Skipped ${skippedCount.invalidId} message(s) without valid IDs for thread: ${threadId}`);
      }

      // Only save if we have valid messages
      if (validStoredMessages.length > 0) {
        await indexedDBHelper.saveMessages(validStoredMessages);
        console.log(`[ThreadPersistence] Saved ${validStoredMessages.length} messages for thread: ${threadId}`);
      } else if (messages.length > 0) {
        // All messages were invalid
        console.warn(`[ThreadPersistence] ⚠️ No valid messages to save for thread: ${threadId} (had ${messages.length} message(s), all skipped)`);
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
      return stored.map(storedToMessage);
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
   */
  private async processSaveQueue(): Promise<void> {
    if (this.isSaving || this.saveQueue.size === 0) {
      return;
    }

    this.isSaving = true;
    const threadIds = Array.from(this.saveQueue);
    this.saveQueue.clear();

    try {
      // Import here to avoid circular dependency
      const { useThreadStore } = await import('../threadStore');
      const threadStore = useThreadStore.getState();

      for (const threadId of threadIds) {
        const thread = threadStore.getThread(threadId);
        if (thread) {
          await this.saveThread(thread);

          // Also save messages
          const messages = getThreadMessages(threadId);
          if (messages.length > 0) {
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

      // Validate structure
      if (!data.threads || !Array.isArray(data.threads)) {
        throw new Error('Invalid import data: missing threads array');
      }

      // Import to IndexedDB
      await indexedDBHelper.importFromJSON(data);

      // Reload thread store
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

      // 🔥 FIX: 检查 store 中是否已有 threads，避免重复创建
      const { useThreadStore } = await import('../threadStore');
      const currentStore = useThreadStore.getState();
      const hasExistingThreads = Object.keys(currentStore.threads).length > 0;

      if (threads.length === 0 && !hasExistingThreads) {
        console.log('[ThreadPersistence] No threads found in storage or store, creating default thread');
        // Create default thread when no threads exist in storage AND store
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
        console.log('[ThreadPersistence] Created default thread:', defaultThread.id);
        return;
      }

      if (threads.length === 0 && hasExistingThreads) {
        console.log('[ThreadPersistence] No threads in storage but store has threads, skipping restore');
        return;
      }

      // threadStore already imported above, reuse it
      const threadStore = currentStore;

      // Restore threads one by one (filter out deleted threads)
      const threadsMap: Record<string, Thread> = {};
      threads.forEach(thread => {
        // 只恢复非删除状态的线程
        if (thread.status !== 'deleted') {
          threadsMap[thread.id] = thread;
        }
      });

      // Use zustand's setState directly
      useThreadStore.setState({ threads: threadsMap });

      // Restore messages for each thread
      let totalMessages = 0;
      for (const thread of threads) {
        const messages = await this.loadThreadMessages(thread.id);
        if (messages.length > 0) {
          setThreadMessages(thread.id, messages as any);
          totalMessages += messages.length;
        }
      }

      // Set active thread to most recently used
      if (threads.length > 0) {
        const mostRecent = threads.sort((a, b) => b.lastActiveAt - a.lastActiveAt)[0];
        // CRITICAL FIX: Use switchThread() to properly load messages into useChatStore.messages
        // setActiveThread() only sets activeThreadId but doesn't load messages, causing
        // historical conversations to not display (especially on Windows)
        const { switchThread } = await import('../useChatStore');
        switchThread(mostRecent.id);
        console.log(`[ThreadPersistence] Set active thread to: ${mostRecent.id} (${mostRecent.title})`);
      }

      console.log(`[ThreadPersistence] ✅ Restored ${threads.length} threads with ${totalMessages} total messages`);
    } catch (error) {
      console.error('[ThreadPersistence] ❌ Failed to restore from storage:', error);
      // Create fallback default thread on error
      try {
        const { useThreadStore } = await import('../threadStore');
        const uuid = await import('uuid');
        const uuidv4 = uuid.v4;
        const fallbackThread = {
          id: uuidv4(),
          title: '新对话',
          createdAt: Date.now(),
          lastActiveAt: Date.now(),
          messageCount: 0
        };
        useThreadStore.getState().createThread(fallbackThread);
        console.log('[ThreadPersistence] Created fallback thread after restore error');
      } catch (fallbackError) {
        console.error('[ThreadPersistence] Failed to create fallback thread:', fallbackError);
      }
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

    console.log('[ThreadPersistence] Export completed');
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
    console.log('[ThreadPersistence] Import completed');
  } catch (error) {
    console.error('[ThreadPersistence] Import failed:', error);
    throw error;
  }
}
