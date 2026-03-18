import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../e2e/setup/index';
import { AuthoritativeWait } from '../utils/AuthoritativeWait';

/**
 * 🏆 PIVO 3.0: 存储物理恢复一致性测试 (Signal Pipeline Edition)
 * 验证应用重启后数据能否通过物理信号管线 100% 恢复。
 */

test.describe('PIVO 3.0 Storage Recovery Fidelity', () => {
  test.beforeEach(async ({ page }) => {
    // 开启错误捕捉
    page.on('pageerror', err => console.error('[Pivo3-Crash] 🔴 Browser Exception:', err.message));
    
    await setupE2ETestEnvironment(page, { skipWelcome: true });
    await page.goto('/');
    
    // 🏆 PIVO 3.0: 等待应用逻辑层就绪
    await page.waitForFunction(() => (window as any).__APP_READY__ === true, { timeout: 60000 });
  });

  test('@fidelity Should persist and recover Thread History via Physical Signal', async ({ page }) => {
    const uniqueTitle = 'Thread-Recovery-' + Math.random().toString(36).substring(7);
    
    // 1. 模拟生成数据
    const createResult = await page.evaluate(async (title) => {
        try {
          const { useThreadStore } = await import('../../src/stores/threadStore');
          const { autoSaveThread, threadPersistence, initThreadPersistence } = await import('../../src/stores/persistence/threadPersistence');

          // 🔥 FIX v0.3.11: 确保 threadPersistence 被初始化
          console.log('[Test] Initializing threadPersistence...');
          await initThreadPersistence();
          console.log('[Test] threadPersistence initialized, initialized:', threadPersistence.initialized);

          const threadsBefore = useThreadStore.getState().threads;
          // 创建一个 Thread
          const threadId = useThreadStore.getState().createThread({ title });
          const threadsAfter = useThreadStore.getState().threads;

          // 🔥 FIX v0.3.11: 手动触发保存，确保 Thread 被保存到 IndexedDB
          console.log('[Test] Manually triggering autoSaveThread...');
          autoSaveThread(threadId);

          return {
            success: true,
            threadId,
            threadsBefore,
            threadsAfter,
            activeThreadId: useThreadStore.getState().activeThreadId,
            threadPersistenceInitialized: threadPersistence.initialized
          };
        } catch (error) {
          return {
            success: false,
            error: (error as Error).message,
            stack: (error as Error).stack
          };
        }
    }, uniqueTitle);

    console.log('[Pivo3] Create thread result:', JSON.stringify(createResult, null, 2));

    // 🔥 FIX v0.3.11: 等待足够长的时间，确保 threadPersistence 完成保存
    // AUTO_SAVE_DELAY 是 1 秒，需要等待队列处理完成
    await page.waitForTimeout(2000);

    // 🔥 DEBUG: 手动触发保存并等待完成
    const saveResult = await page.evaluate(async (threadId) => {
      try {
        const { threadPersistence } = await import('../../src/stores/persistence/threadPersistence');
        const { useThreadStore } = await import('../../src/stores/threadStore');

        // 获取Thread
        const thread = useThreadStore.getState().getThread(threadId);
        console.log('[Test] Thread to save:', thread);

        if (!thread) {
          return { error: 'Thread not found in store', threadId };
        }

        // 手动保存
        await threadPersistence.saveThread(thread);
        console.log('[Test] Thread saved successfully');

        // 等待一下确保保存完成
        await new Promise(resolve => setTimeout(resolve, 1000));

        return { success: true, threadId: thread.id, title: thread.title };
      } catch (error) {
        return {
          success: false,
          error: (error as Error).message,
          stack: (error as Error).stack
        };
      }
    }, createResult.threadId);
    console.log('[Pivo3] Manual save result:', JSON.stringify(saveResult, null, 2));

    // 再等待一下确保保存完成
    await page.waitForTimeout(2000);

    // 🔥 验证 Thread 仍在内存中
    const threadCheck = await page.evaluate(async (threadId) => {
      try {
        const { useThreadStore } = await import('../../src/stores/threadStore');
        const state = useThreadStore.getState();
        const thread = state.threads[threadId];
        return {
          success: true,
          threadExists: !!thread,
          threadTitle: thread?.title,
          allThreadIds: Object.keys(state.threads)
        };
      } catch (error) {
        return { error: (error as Error).message };
      }
    }, createResult.threadId);
    console.log('[Pivo3] Thread check before refresh:', JSON.stringify(threadCheck, null, 2));

    // 🔥 DEBUG: 检查 ifai-threads 数据库中是否有 Thread
    const indexedDBCheckBeforeRefresh = await page.evaluate(async () => {
      try {
        const request = indexedDB.open('ifai-threads', 1);
        const result = await new Promise((resolve) => {
          request.onsuccess = () => {
            const db = request.result;
            const hasThreadsStore = db.objectStoreNames.contains('threads');
            if (!hasThreadsStore) {
              db.close();
              resolve({ error: 'threads store not found' });
              return;
            }
            const transaction = db.transaction(['threads'], 'readonly');
            const store = transaction.objectStore('threads');
            const getAllRequest = store.getAll();

            getAllRequest.onsuccess = () => {
              const threads = getAllRequest.result;
              db.close();
              resolve({
                success: true,
                threadsCount: threads.length,
                threadIds: threads.map((t: any) => t.id),
                threads: threads.map((t: any) => ({ id: t.id, title: t.title }))
              });
            };

            getAllRequest.onerror = () => {
              db.close();
              resolve({ error: getAllRequest.error?.message });
            };
          };

          request.onerror = () => {
            resolve({ error: request.error?.message });
          };
        });
        return result;
      } catch (error) {
        return { error: (error as Error).message };
      }
    });
    console.log('[Pivo3] IndexedDB (ifai-threads) check before refresh:', JSON.stringify(indexedDBCheckBeforeRefresh, null, 2)); 

    // 2. 🚀 刷新页面 (模拟重启)
    console.log('[Pivo3] Refreshing page...');
    await page.reload();
    await page.waitForFunction(() => (window as any).__APP_READY__ === true, { timeout: 30000 });

    // 3. 🏆 关键：等待持久化信号管线
    console.log(`[Pivo3] Waiting for persistence-hydrated signal...`);
    await AuthoritativeWait.forPersistenceHydrated(page, { timeout: 20000 });

    // 🔥 DEBUG: 检查刷新后 threadStore 的状态
    const threadAfterRefresh = await page.evaluate(async (expectedTitle) => {
      try {
        const { useThreadStore } = await import('../../src/stores/threadStore');
        const state = useThreadStore.getState();
        return {
          success: true,
          threadIds: Object.keys(state.threads),
          threadsCount: Object.keys(state.threads).length,
          activeThreadId: state.activeThreadId,
          threads: Object.values(state.threads).map(t => ({ id: t.id, title: t.title, status: t.status })),
          expectedTitle
        };
      } catch (error) {
        return { error: (error as Error).message };
      }
    }, uniqueTitle);
    console.log('[Pivo3] Thread state after refresh:', JSON.stringify(threadAfterRefresh, null, 2));

    // 4. 验证 Thread 列表 UI 恢复
    console.log(`[Pivo3] Signal received, checking Thread List for: ${uniqueTitle}`);
    
    // 查找侧边栏中的 Thread 标题
    const threadItem = page.locator(`text=${uniqueTitle}`);
    await expect(threadItem).toBeVisible({ timeout: 15000 });
    
    console.log('[Pivo3] ✅ High-Fidelity Persistence Recovery Verified Successfully!');
  });
});
