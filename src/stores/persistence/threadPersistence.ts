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
 */
function messageToStored(message: Message, threadId: string): StoredMessage {
  return {
    id: message.id,
    threadId,
    role: message.role,
    content: typeof message.content === 'string' ? message.content : JSON.stringify(message.content),
    toolCalls: message.toolCalls,
    tool_call_id: message.tool_call_id,
    timestamp: Date.now(),
    // Copy all other properties
    multiModalContent: (message as any).multiModalContent,
    references: (message as any).references,
    agentId: (message as any).agentId,
    isAgentLive: (message as any).isAgentLive,
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
   * Save messages for a thread
   */
  async saveThreadMessages(threadId: string, messages: Message[]): Promise<void> {
    if (!this.initialized) {
      return;
    }

    try {
      const stored = messages.map(m => messageToStored(m, threadId));
      await indexedDBHelper.saveMessages(stored);
      console.log(`[ThreadPersistence] Saved ${messages.length} messages for thread: ${threadId}`);
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
            await this.saveThreadMessages(threadId, messages);
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

      if (threads.length === 0) {
        console.log('[ThreadPersistence] No threads found, creating default thread');
        // Create default thread when no threads exist
        const { useThreadStore } = await import('../threadStore');
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

      // Import threadStore dynamically to avoid circular dependency
      const { useThreadStore } = await import('../threadStore');
      const threadStore = useThreadStore.getState();

      // Restore threads one by one
      const threadsMap: Record<string, Thread> = {};
      threads.forEach(thread => {
        threadsMap[thread.id] = thread;
      });

      // Use zustand's setState directly
      useThreadStore.setState({ threads: threadsMap });

      // Restore messages for each thread
      let totalMessages = 0;
      for (const thread of threads) {
        const messages = await this.loadThreadMessages(thread.id);
        if (messages.length > 0) {
          setThreadMessages(thread.id, messages);
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
