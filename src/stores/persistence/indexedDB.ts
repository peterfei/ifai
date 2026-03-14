/**
 * IndexedDB Wrapper for Thread Persistence
 *
 * Provides a type-safe interface for storing:
 * - Thread metadata
 * - Thread messages
 * - Thread settings
 */

const DB_NAME = 'ifai-threads';
const DB_VERSION = 1;
const THREADS_STORE = 'threads';
const MESSAGES_STORE = 'messages';
const SETTINGS_STORE = 'settings';

// ============================================================================
// Types
// ============================================================================

export interface StoredThread {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  lastActiveAt: number;
  messageCount: number;
  agentTasks: string[];
  status: 'active' | 'archived' | 'deleted';
  hasUnreadActivity: boolean;
  tags: string[];
  pinned: boolean;
  description?: string;
}

export interface StoredMessage {
  id: string;
  threadId: string;
  role: string;
  content: string;
  toolCalls?: any[];
  tool_call_id?: string;
  timestamp: number;
  // Additional message fields...
  [key: string]: any;
}

// ============================================================================
// IndexedDB Helper Class
// ============================================================================

class IndexedDBHelper {
  private db: IDBDatabase | null = null;

  /**
   * Initialize the database
   */
  async init(): Promise<IDBDatabase> {
    if (this.db) {
      return this.db;
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        reject(new Error(`Failed to open IndexedDB: ${request.error}`));
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create threads store
        if (!db.objectStoreNames.contains(THREADS_STORE)) {
          const threadStore = db.createObjectStore(THREADS_STORE, { keyPath: 'id' });
          threadStore.createIndex('status', 'status', { unique: false });
          threadStore.createIndex('lastActiveAt', 'lastActiveAt', { unique: false });
          threadStore.createIndex('pinned', 'pinned', { unique: false });
        }

        // Create messages store with compound index for thread messages
        if (!db.objectStoreNames.contains(MESSAGES_STORE)) {
          const messageStore = db.createObjectStore(MESSAGES_STORE, { keyPath: 'id' });
          messageStore.createIndex('threadId', 'threadId', { unique: false });
          messageStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        // Create settings store
        if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
          db.createObjectStore(SETTINGS_STORE, { keyPath: 'key' });
        }
      };
    });
  }

  /**
   * Close the database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  /**
   * Clear all stores (for testing/reset)
   */
  async clearAll(): Promise<void> {
    const db = await this.init();
    const transaction = db.transaction(
      [THREADS_STORE, MESSAGES_STORE, SETTINGS_STORE],
      'readwrite'
    );

    await Promise.all([
      this._clearStore(transaction, THREADS_STORE),
      this._clearStore(transaction, MESSAGES_STORE),
      this._clearStore(transaction, SETTINGS_STORE),
    ]);
  }

  private async _clearStore(transaction: IDBTransaction, storeName: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = transaction.objectStore(storeName).clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // ========================================================================
  // Thread Operations
  // ========================================================================

  /**
   * Get all threads
   */
  async getAllThreads(): Promise<StoredThread[]> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(THREADS_STORE, 'readonly');
      const store = transaction.objectStore(THREADS_STORE);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get a single thread by ID
   */
  async getThread(threadId: string): Promise<StoredThread | undefined> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(THREADS_STORE, 'readonly');
      const store = transaction.objectStore(THREADS_STORE);
      const request = store.get(threadId);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Save or update a thread
   */
  async saveThread(thread: StoredThread): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(THREADS_STORE, 'readwrite');
      const store = transaction.objectStore(THREADS_STORE);
      const request = store.put(thread);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Save multiple threads at once
   */
  async saveThreads(threads: StoredThread[]): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(THREADS_STORE, 'readwrite');
      const store = transaction.objectStore(THREADS_STORE);

      threads.forEach(thread => {
        store.put(thread);
      });

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  /**
   * Delete a thread
   */
  async deleteThread(threadId: string): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(THREADS_STORE, 'readwrite');
      const store = transaction.objectStore(THREADS_STORE);
      const request = store.delete(threadId);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // ========================================================================
  // Message Operations
  // ========================================================================

  /**
   * Get all messages for a thread
   */
  async getThreadMessages(threadId: string): Promise<StoredMessage[]> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(MESSAGES_STORE, 'readonly');
      const store = transaction.objectStore(MESSAGES_STORE);
      const index = store.index('threadId');
      const request = index.getAll(threadId);

      request.onsuccess = () => {
        const messages = request.result;
        // Sort by timestamp
        messages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        resolve(messages);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Save a message
   */
  async saveMessage(message: StoredMessage): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(MESSAGES_STORE, 'readwrite');
      const store = transaction.objectStore(MESSAGES_STORE);
      const request = store.put(message);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Save multiple messages at once
   */
  async saveMessages(messages: StoredMessage[]): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(MESSAGES_STORE, 'readwrite');
      const store = transaction.objectStore(MESSAGES_STORE);

      messages.forEach(message => {
        store.put(message);
      });

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  /**
   * Delete all messages for a thread
   */
  async deleteThreadMessages(threadId: string): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(MESSAGES_STORE, 'readwrite');
      const store = transaction.objectStore(MESSAGES_STORE);
      const index = store.index('threadId');
      const request = index.openCursor(IDBKeyRange.only(threadId));

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          resolve();
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  // ========================================================================
  // Settings Operations
  // ========================================================================

  /**
   * Get a setting value
   */
  async getSetting<T>(key: string): Promise<T | undefined> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(SETTINGS_STORE, 'readonly');
      const store = transaction.objectStore(SETTINGS_STORE);
      const request = store.get(key);

      request.onsuccess = () => {
        const result = request.result;
        resolve(result ? result.value : undefined);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Save a setting value
   */
  async saveSetting<T>(key: string, value: T): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(SETTINGS_STORE, 'readwrite');
      const store = transaction.objectStore(SETTINGS_STORE);
      const request = store.put({ key, value });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Delete a setting
   */
  async deleteSetting(key: string): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(SETTINGS_STORE, 'readwrite');
      const store = transaction.objectStore(SETTINGS_STORE);
      const request = store.delete(key);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // ========================================================================
  // Export/Import
  // ========================================================================

  /**
   * Export all data to JSON
   */
  async exportToJSON(): Promise<{
    threads: StoredThread[];
    messages: StoredMessage[];
    exportedAt: string;
  }> {
    const [threads, messages] = await Promise.all([
      this.getAllThreads(),
      this._getAllMessages(),
    ]);

    return {
      threads,
      messages,
      exportedAt: new Date().toISOString(),
    };
  }

  private async _getAllMessages(): Promise<StoredMessage[]> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(MESSAGES_STORE, 'readonly');
      const store = transaction.objectStore(MESSAGES_STORE);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Import data from JSON
   */
  async importFromJSON(data: {
    threads: StoredThread[];
    messages: StoredMessage[];
  }): Promise<void> {
    const db = await this.init();

    // Clear existing data
    await this.clearAll();

    // Import new data
    await Promise.all([
      this.saveThreads(data.threads),
      this.saveMessages(data.messages),
    ]);
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const indexedDBHelper = new IndexedDBHelper();

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Initialize IndexedDB on app startup
 */
export async function initIndexedDB(): Promise<void> {
  try {
    await indexedDBHelper.init();
    console.log('[IndexedDB] Database initialized successfully');
  } catch (error) {
    console.error('[IndexedDB] Failed to initialize:', error);
    throw error;
  }
}

/**
 * Clear all data (for testing/reset)
 */
export async function clearIndexedDB(): Promise<void> {
  try {
    await indexedDBHelper.clearAll();
    console.log('[IndexedDB] All data cleared');
  } catch (error) {
    console.error('[IndexedDB] Failed to clear:', error);
    throw error;
  }
}
