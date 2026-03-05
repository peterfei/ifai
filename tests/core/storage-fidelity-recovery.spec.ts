import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../e2e/setup/index';
import { AuthoritativeWait } from '../utils/AuthoritativeWait';

/**
 * 🏆 PIVO 3.0: 存储物理恢复一致性测试 (Full Lifecycle)
 */

test.describe('PIVO 3.0 Storage Recovery Fidelity', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page, { skipWelcome: true });
    await page.goto('/');
    await page.waitForFunction(() => (window as any).__APP_READY__ === true, { timeout: 30000 });
  });

  test('@pivo3 Should persist and recover Chat History and Pivo Trees', async ({ page }) => {
    const testSessionId = 'pivo3-recovery-target';
    
    // 1. 模拟生成数据
    await page.evaluate(async (id) => {
        const { setThreadMessages } = await import('../../src/stores/useChatStore');
        const { useThreadStore } = await import('../../src/stores/threadStore');
        const pivoStore = (window as any).__pivoStore;
        
        // A. 创建一个明确的 Thread
        const newThread = {
            id,
            title: 'Recovery Target Thread',
            createdAt: Date.now(),
            lastActiveAt: Date.now() + 1000, // 确保它是最新的
            messageCount: 1
        };
        useThreadStore.getState().createThread(newThread);
        useThreadStore.getState().switchThread(id);

        // B. 注入消息
        const testMsg = { id: 'msg-' + id, role: 'assistant', content: 'Recovery Target Content' };
        setThreadMessages(id, [testMsg] as any);
        
        // C. 注入 Pivo 树
        pivoStore.getState().setTaskTree('msg-' + id, [{ 
            id: 'task-1', 
            label: 'Persisted Task', 
            status: 'success', 
            task_type: 'Plan',
            children: [] 
        }]);
    }, testSessionId);

    console.log('[Pivo3] Test data injected, awaiting IndexedDB sync...');
    await page.waitForTimeout(3000); 

    // 2. 🚀 刷新页面 (模拟重启)
    console.log('[Pivo3] Refreshing page to test recovery...');
    await page.reload();
    await page.waitForFunction(() => (window as any).__APP_READY__ === true, { timeout: 30000 });

    // 3. 🏆 权威等待：先确保 Thread 已切回
    console.log('[Pivo3] Awaiting thread switch back...');
    await page.waitForFunction((id) => {
        const activeId = (window as any).__threadStore?.getState().activeThreadId;
        return activeId === id;
    }, testSessionId, { timeout: 20000 });

    // 4. 🏆 权威等待：等待消息加载
    console.log('[Pivo3] Awaiting data hydration...');
    await AuthoritativeWait.forMessage(page, 'msgs => msgs.length > 0', { timeout: 15000 });

    // 5. 验证数据恢复 (物理层)
    const recoveredData = await page.evaluate((id) => {
        const messages = (window as any).__CHAT_STORE_STATE__.messages;
        const pivoTasks = (window as any).__pivoStore.getState().taskTrees['msg-' + id];
        return { 
            msgCount: messages.length,
            msgContent: messages[0]?.content,
            taskFound: !!pivoTasks && pivoTasks.length > 0
        };
    }, testSessionId);

    expect(recoveredData.msgCount).toBeGreaterThan(0);
    expect(recoveredData.msgContent).toContain('Recovery Target Content');
    expect(recoveredData.taskFound).toBe(true);
    console.log('[Pivo3] ✅ Physical data recovery verified.');

    // 6. 验证 UI 渲染恢复
    const taskUI = page.locator('text=Persisted Task');
    await expect(taskUI).toBeVisible({ timeout: 15000 });
    console.log('[Pivo3] ✅ UI rendering recovery verified.');
  });
});
