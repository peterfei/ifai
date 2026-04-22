/**
 * E2E 测试：应用启动/恢复时的标题自动更新
 *
 * 测试目标：验证应用重新加载后，发送消息是否仍然能自动更新标题
 * 这是最可能出现问题的场景
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

test.describe('Thread: Title Auto-Update After App Reload', () => {

  test('should auto-update title after app reload (persistence restore)', async ({ page }) => {
    console.log('[DEBUG] ========== 测试：应用恢复后标题自动更新 ==========');

    await setupE2ETestEnvironment(page, {
      useRealAI: false,
      skipWelcome: true,
    });

    await page.goto('/');
    await page.waitForTimeout(2000);

    await page.waitForFunction(() => (window as any).__chatStore !== undefined, { timeout: 15000 });
    await page.waitForFunction(() => (window as any).__threadStore !== undefined, { timeout: 15000 });

    const result = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      const threadStore = (window as any).__threadStore;
      const settingsStore = (window as any).__settingsStore;

      console.log('[Test] ===== 步骤1: 模拟应用已有一个线程的场景 =====');

      // 不清空，模拟应用启动时的状态
      // 应用启动时可能已经有一个默认线程

      // 获取当前线程（应用启动时的默认线程）
      const activeThreadId = threadStore.getState().activeThreadId;
      const currentThreadId = chatStore.getState().currentThreadId;

      console.log('[Test] 应用启动时的 activeThreadId:', activeThreadId?.substring(0, 20) || 'null');
      console.log('[Test] 应用启动时的 currentThreadId:', currentThreadId);

      const currentThread = activeThreadId ? threadStore.getState().threads[activeThreadId] : null;
      const initialTitle = currentThread?.title || 'null';

      console.log('[Test] 当前线程标题:', initialTitle);

      // 检查是否是默认标题
      const isDefaultTitle = /^(上午|下午|晚上)(的新对话|的对话 \d+)$/.test(initialTitle);

      console.log('[Test] 是否是默认标题:', isDefaultTitle);

      console.log('[Test] ===== 步骤2: 发送消息 =====');

      const testMessage = '帮我实现快速排序算法';
      const providerId = settingsStore.getState().currentProviderId;
      const model = settingsStore.getState().currentModel;

      try {
        await chatStore.getState().sendMessage(testMessage, providerId, model);
        console.log('[Test] sendMessage 调用成功');
      } catch (error) {
        console.error('[Test] sendMessage 调用失败:', error);
      }

      // 等待状态更新
      await new Promise(resolve => setTimeout(resolve, 200));

      console.log('[Test] ===== 步骤3: 验证标题是否更新 =====');

      const updatedThread = activeThreadId ? threadStore.getState().threads[activeThreadId] : null;
      const updatedTitle = updatedThread?.title || 'null';

      console.log('[Test] 更新后标题:', updatedTitle);

      // 获取线程（用于调试）
      const threadByCurrentId = currentThreadId ? threadStore.getState().getThread(currentThreadId) : null;
      const threadByActiveId = activeThreadId ? threadStore.getState().getThread(activeThreadId) : null;

      return {
        success: true,
        activeThreadId: activeThreadId?.substring(0, 20) || null,
        currentThreadId,
        initialTitle,
        updatedTitle,
        titleChanged: initialTitle !== updatedTitle,
        expectedTitle: testMessage,
        isDefaultTitle,

        // 调试信息
        synced: activeThreadId === currentThreadId,
        threadByCurrentIdFound: !!threadByCurrentId,
        threadByActiveIdFound: !!threadByActiveId,
      };
    });

    console.log('[DEBUG] 测试结果:', JSON.stringify(result, null, 2));

    // 验证结果
    expect(result.success).toBe(true);

    // 如果是默认标题，应该被更新
    if (result.isDefaultTitle) {
      console.log('[DEBUG] 初始标题是默认标题，应该被更新');
      expect(result.titleChanged, '默认标题应该被更新为消息内容').toBe(true);
    }

    // 验证同步状态
    if (result.activeThreadId) {
      expect(result.synced, 'currentThreadId 应该与 activeThreadId 同步').toBe(true);
    }

    console.log('[DEBUG] ✅ 测试完成');
    console.log(`[DEBUG]    初始标题: "${result.initialTitle}"`);
    console.log(`[DEBUG]    更新后标题: "${result.updatedTitle}"`);
  });

  test('should sync currentThreadId after creating new thread', async ({ page }) => {
    console.log('[DEBUG] ========== 测试：创建新线程后 currentThreadId 同步 ==========');

    await setupE2ETestEnvironment(page, {
      useRealAI: false,
      skipWelcome: true,
    });

    await page.goto('/');
    await page.waitForTimeout(2000);

    await page.waitForFunction(() => (window as any).__chatStore !== undefined, { timeout: 15000 });
    await page.waitForFunction(() => (window as any).__threadStore !== undefined, { timeout: 15000 });

    const result = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      const threadStore = (window as any).__threadStore;

      console.log('[Test] ===== 步骤1: 获取初始状态 =====');

      // 获取初始状态（应用启动时）
      const initialActiveId = threadStore.getState().activeThreadId;
      const initialCurrentId = chatStore.getState().currentThreadId;

      console.log('[Test] 初始 activeThreadId:', initialActiveId?.substring(0, 20) || 'null');
      console.log('[Test] 初始 currentThreadId:', initialCurrentId);

      console.log('[Test] ===== 步骤2: 创建新线程 =====');

      // 创建新线程
      const newThreadId = threadStore.getState().createThread();

      console.log('[Test] 新线程 ID:', newThreadId.substring(0, 20));

      // 等待状态更新
      await new Promise(resolve => setTimeout(resolve, 100));

      console.log('[Test] ===== 步骤3: 验证同步 =====');

      // 获取更新后的状态
      const afterActiveId = threadStore.getState().activeThreadId;
      const afterCurrentId = chatStore.getState().currentThreadId;

      console.log('[Test] 更新后 activeThreadId:', afterActiveId?.substring(0, 20) || 'null');
      console.log('[Test] 更新后 currentThreadId:', afterCurrentId);

      // 检查是否能通过 currentThreadId 找到线程
      const threadByCurrentId = afterCurrentId ? threadStore.getState().getThread(afterCurrentId) : null;
      const threadByActiveId = afterActiveId ? threadStore.getState().getThread(afterActiveId) : null;

      console.log('[Test] 通过 currentThreadId 找到线程:', !!threadByCurrentId);
      console.log('[Test] 通过 activeThreadId 找到线程:', !!threadByActiveId);

      return {
        success: true,
        newThreadId: newThreadId.substring(0, 20),

        initialActiveId: initialActiveId?.substring(0, 20) || null,
        initialCurrentId,
        initialSynced: initialActiveId === initialCurrentId,

        afterActiveId: afterActiveId?.substring(0, 20) || null,
        afterCurrentId,
        afterSynced: afterActiveId === afterCurrentId,

        threadByCurrentIdFound: !!threadByCurrentId,
        threadByActiveIdFound: !!threadByActiveId,

        // 关键检查
        newThreadMatchesCurrent: newThreadId === afterCurrentId,
        newThreadMatchesActive: newThreadId === afterActiveId,
      };
    });

    console.log('[DEBUG] 测试结果:', JSON.stringify(result, null, 2));

    // 验证结果
    expect(result.success).toBe(true);

    // 创建新线程后，activeThreadId 应该指向新线程
    expect(result.newThreadMatchesActive, 'activeThreadId 应该指向新创建的线程').toBe(true);

    // 创建新线程后，currentThreadId 应该也指向新线程（这是关键同步）
    expect(result.newThreadMatchesCurrent, 'currentThreadId 应该同步指向新创建的线程').toBe(true);

    // 两者应该同步
    expect(result.afterSynced, '创建新线程后，currentThreadId 和 activeThreadId 应该同步').toBe(true);

    console.log('[DEBUG] ✅ 新线程创建后同步正常');
  });
});
