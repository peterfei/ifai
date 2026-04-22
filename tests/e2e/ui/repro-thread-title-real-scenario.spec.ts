/**
 * E2E 测试：模拟用户真实使用场景
 *
 * 测试目标：高保真模拟用户实际使用流程
 * 1. 打开应用
 * 2. 看到已有 Tab（从持久化恢复）
 * 3. 发送消息
 * 4. 检查标题是否更新
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

test.describe('Thread: Title Auto-Update - Real User Scenario', () => {

  test('should update title when user sends message in existing thread', async ({ page }) => {
    console.log('[DEBUG] ========== 测试：真实用户场景 - 在已有线程中发送消息 ==========');

    await setupE2ETestEnvironment(page, {
      useRealAI: false,
      skipWelcome: true,
    });

    await page.goto('/');
    await page.waitForTimeout(2000);

    // 等待 stores 初始化
    await page.waitForFunction(() => (window as any).__chatStore !== undefined, { timeout: 15000 });
    await page.waitForFunction(() => (window as any).__threadStore !== undefined, { timeout: 15000 });

    const result = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      const threadStore = (window as any).__threadStore;
      const settingsStore = (window as any).__settingsStore;

      console.log('[Test] ===== 场景：模拟用户打开应用，看到已有的 Tab =====');

      // 获取应用启动时的状态（模拟持久化恢复）
      const initialActiveId = threadStore.getState().activeThreadId;
      const initialCurrentId = chatStore.getState().currentThreadId;

      console.log('[Test] 应用启动状态:');
      console.log('[Test]   activeThreadId:', initialActiveId?.substring(0, 20) || 'null');
      console.log('[Test]   currentThreadId:', initialCurrentId);

      // 获取所有线程
      const allThreads = threadStore.getState().getAllThreads();
      console.log('[Test]   线程总数:', allThreads.length);

      // 如果没有线程，创建一个
      let threadToUse = initialActiveId;
      if (!threadToUse || allThreads.length === 0) {
        console.log('[Test] 没有现有线程，创建新线程');
        threadToUse = threadStore.getState().createThread();
        console.log('[Test] 创建的新线程 ID:', threadToUse.substring(0, 20));
      } else if (allThreads.length > 0 && !initialActiveId) {
        // 有线程但没有 activeThreadId，使用第一个线程
        threadToUse = allThreads[0].id;
        threadStore.getState().switchThread(threadToUse);
        console.log('[Test] 使用现有线程:', threadToUse.substring(0, 20));
      }

      // 等待状态同步
      await new Promise(resolve => setTimeout(resolve, 200));

      // 获取线程信息
      const threadInfo = threadStore.getState().threads[threadToUse];
      const initialTitle = threadInfo?.title || 'null';
      console.log('[Test] 线程标题:', initialTitle);

      // 获取当前状态
      const afterSyncActiveId = threadStore.getState().activeThreadId;
      const afterSyncCurrentId = chatStore.getState().currentThreadId;

      console.log('[Test] 同步后状态:');
      console.log('[Test]   activeThreadId:', afterSyncActiveId?.substring(0, 20) || 'null');
      console.log('[Test]   currentThreadId:', afterSyncCurrentId);

      console.log('[Test] ===== 场景：用户发送消息 =====');

      const testMessage = '如何实现快速排序算法';
      const providerId = settingsStore.getState().currentProviderId;
      const model = settingsStore.getState().currentModel;

      console.log('[Test] 准备发送消息...');
      console.log('[Test]   消息内容:', testMessage);
      console.log('[Test]   providerId:', providerId);
      console.log('[Test]   model:', model);

      try {
        await chatStore.getState().sendMessage(testMessage, providerId, model);
        console.log('[Test] sendMessage 调用成功');
      } catch (error) {
        console.error('[Test] sendMessage 调用失败:', error);
        // 即使失败，标题更新逻辑应该已经执行
      }

      // 等待状态更新
      await new Promise(resolve => setTimeout(resolve, 500));

      console.log('[Test] ===== 验证：检查标题是否更新 =====');

      const updatedThreadInfo = threadStore.getState().threads[threadToUse];
      const updatedTitle = updatedThreadInfo?.title || 'null';

      console.log('[Test] 更新后标题:', updatedTitle);

      // 检查是否是默认标题
      const wasDefaultTitle = /^(上午|下午|晚上)(的新对话|的对话 \d+)$/.test(initialTitle);
      const isStillDefaultTitle = /^(上午|下午|晚上)(的新对话|的对话 \d+)$/.test(updatedTitle);

      console.log('[Test] 初始是默认标题:', wasDefaultTitle);
      console.log('[Test] 更新后仍是默认标题:', isStillDefaultTitle);

      // 调试：检查线程查找
      const threadByCurrentId = afterSyncCurrentId ? threadStore.getState().getThread(afterSyncCurrentId) : null;
      const threadByActiveId = afterSyncActiveId ? threadStore.getState().getThread(afterSyncActiveId) : null;

      console.log('[Test] 调试信息:');
      console.log('[Test]   通过 currentThreadId 找到线程:', !!threadByCurrentId);
      console.log('[Test]   通过 activeThreadId 找到线程:', !!threadByActiveId);

      return {
        success: true,
        threadToUse: threadToUse?.substring(0, 20) || null,

        // 状态
        initialActiveId: initialActiveId?.substring(0, 20) || null,
        initialCurrentId,
        afterSyncActiveId: afterSyncActiveId?.substring(0, 20) || null,
        afterSyncCurrentId,

        // 标题
        initialTitle,
        updatedTitle,
        titleChanged: initialTitle !== updatedTitle,
        wasDefaultTitle,
        isStillDefaultTitle,
        expectedTitle: testMessage,

        // 调试
        synced: afterSyncActiveId === afterSyncCurrentId,
        threadByCurrentIdFound: !!threadByCurrentId,
        threadByActiveIdFound: !!threadByActiveId,
        allThreadsCount: allThreads.length,
      };
    });

    console.log('[DEBUG] ========== 测试结果 ==========');
    console.log('[DEBUG]', JSON.stringify(result, null, 2));

    // 验证结果
    expect(result.success).toBe(true);

    // 如果初始是默认标题，应该被更新
    if (result.wasDefaultTitle) {
      console.log('[DEBUG] 初始标题是默认标题，应该被更新为消息内容');
      expect(result.titleChanged, '默认标题应该被更新').toBe(true);
      expect(result.isStillDefaultTitle, '更新后不应再是默认标题').toBe(false);
    }

    // 验证同步状态
    expect(result.synced, 'currentThreadId 和 activeThreadId 应该同步').toBe(true);

    console.log('[DEBUG] ✅ 测试完成');
    console.log(`[DEBUG]    初始标题: "${result.initialTitle}"`);
    console.log(`[DEBUG]    更新后标题: "${result.updatedTitle}"`);
  });

  test('should update title when sending multiple messages in sequence', async ({ page }) => {
    console.log('[DEBUG] ========== 测试：连续发送多条消息 ==========');

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

      console.log('[Test] ===== 场景：用户连续发送多条消息 =====');

      // 清空并创建新线程
      threadStore.getState().reset();
      await new Promise(resolve => setTimeout(resolve, 100));
      const threadId = threadStore.getState().createThread();

      console.log('[Test] 新线程 ID:', threadId.substring(0, 20));
      const initialTitle = threadStore.getState().threads[threadId].title;
      console.log('[Test] 初始标题:', initialTitle);

      const messages = [
        '第一条消息：如何实现快速排序',
        '第二条消息：React 性能优化',
        '第三条消息：TypeScript 类型推导',
      ];

      const titles = [initialTitle];
      const providerId = settingsStore.getState().currentProviderId;
      const model = settingsStore.getState().currentModel;

      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        console.log(`[Test] 发送第 ${i + 1} 条消息:`, msg);

        try {
          await chatStore.getState().sendMessage(msg, providerId, model);
        } catch (error) {
          console.error('[Test] sendMessage 失败:', error);
        }

        // 等待状态更新
        await new Promise(resolve => setTimeout(resolve, 200));

        const currentTitle = threadStore.getState().threads[threadId].title;
        titles.push(currentTitle);
        console.log(`[Test]   标题变为:`, currentTitle);
      }

      console.log('[Test] 标题变化历史:', titles);

      return {
        success: true,
        threadId: threadId.substring(0, 20),
        initialTitle,
        finalTitle: titles[titles.length - 1],
        titles,
        titleChanged: initialTitle !== titles[titles.length - 1],
        // 第一条消息应该更新标题
        firstMessageUpdatedTitle: initialTitle !== titles[1],
        // 后续消息不应该再更新标题（已经不是默认标题）
        subsequentMessagesNoUpdate: titles[1] === titles[2] && titles[2] === titles[3],
      };
    });

    console.log('[DEBUG] ========== 测试结果 ==========');
    console.log('[DEBUG]', JSON.stringify(result, null, 2));

    // 验证结果
    expect(result.success).toBe(true);

    // 第一条消息应该更新标题
    expect(result.firstMessageUpdatedTitle, '第一条消息应该更新标题').toBe(true);

    // 后续消息不应该再更新标题
    expect(result.subsequentMessagesNoUpdate, '后续消息不应该再更新标题').toBe(true);

    // 最终标题应该是第一条消息的内容
    expect(result.finalTitle).toBe('第一条消息：如何实现快速排序');

    console.log('[DEBUG] ✅ 连续消息测试完成');
    console.log('[DEBUG]    标题变化历史:', result.titles.join(' → '));
  });
});
