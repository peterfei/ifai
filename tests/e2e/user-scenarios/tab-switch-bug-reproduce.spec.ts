/**
 * Tab 切换问题重现测试
 *
 * 测试目标：
 * 1. 重现"气泡次序混乱"问题
 * 2. 重现"Tab 内容串扰"问题
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

test.describe('Tab 切换问题重现测试', () => {
  test.setTimeout(120000);

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      (window as any).__E2E__ = true;
      (window as any).__E2E_SKIP_STABILIZER__ = true;
      localStorage.setItem('onboarding-completed', 'true');
      localStorage.setItem('welcome-dialog-hidden', 'true');

      // 🏆 捕获浏览器控制台日志
      (window as any).__persistenceLogs = [];
      const originalLog = console.log;
      console.log = (...args) => {
        const msg = args.join(' ');
        if (msg.includes('ThreadPersistence') || msg.includes('ThreadStore')) {
          (window as any).__persistenceLogs.push(msg);
        }
        originalLog.apply(console, args);
      };
    });

    await setupE2ETestEnvironment(page, {
      skipWelcome: true,
      useRealAI: false // 使用 Mock AI 以获得更快的响应
    });

    await page.waitForFunction(() =>
      (window as any).__chatStore !== undefined &&
      (window as any).__threadStore !== undefined,
      { timeout: 60000 }
    );

    console.log('[测试] 环境准备就绪');
  });

  test('问题1: 气泡次序混乱 - 快速创建多个 Tab 并切换', async ({ page }) => {
    console.log('[测试] 开始测试气泡次序混乱问题');

    const threadIds: string[] = [];

    // 1. 快速创建 3 个 Tab，每个 Tab 发送 2 条消息
    for (let i = 0; i < 3; i++) {
      const threadId = await page.evaluate(async (index) => {
        const threadStore = (window as any).__threadStore;
        const chatStore = (window as any).__chatStore;

        // 创建新线程
        threadStore.getState().createThread({
          id: undefined,
          title: `Tab ${index + 1}`,
          createdAt: Date.now(),
          lastActiveAt: Date.now(),
          messageCount: 0
        });

        const newThreadId = (window as any).__threadStore.getState().activeThreadId;

        // 快速发送 2 条消息（模拟快速输入）
        chatStore.getState().sendMessage(`消息 ${index + 1}-A`);
        await new Promise(r => setTimeout(r, 50)); // 50ms 延迟
        chatStore.getState().sendMessage(`消息 ${index + 1}-B`);

        return newThreadId || 'fallback-' + index;
      }, i);

      threadIds.push(threadId);
      console.log(`[测试] 创建 Tab ${i + 1}:`, threadId);
    }

    // 2. 等待所有消息完成
    await page.waitForTimeout(2000);

    // 3. 依次切换每个 Tab 并检查消息顺序
    for (let i = 0; i < threadIds.length; i++) {
      console.log(`[测试] 切换到 Tab ${i + 1}`);

      const result = await page.evaluate(async (targetId) => {
        const threadStore = (window as any).__threadStore;
        const chatStore = (window as any).__chatStore;

        await threadStore.getState().switchThread(targetId);

        // 等待加载完成
        await new Promise(r => setTimeout(r, 500));

        const messages = chatStore.getState().messages;

        return {
          threadId: targetId,
          messageCount: messages.length,
          messages: messages.map((m: any) => ({
            id: m.id.substring(0, 8),
            role: m.role,
            content: m.content?.substring(0, 30),
            timestamp: m.timestamp,
            isStreaming: m.isStreaming
          })),
          hasDuplicateTimestamps: messages.some((m: any, idx: number, arr: any[]) =>
            idx > 0 && m.timestamp === arr[idx - 1].timestamp
          )
        };
      }, threadIds[i]);

      console.log(`[测试] Tab ${i + 1} 状态:`, {
        messageCount: result.messageCount,
        hasDuplicateTimestamps: result.hasDuplicateTimestamps,
        messages: result.messages.map((m: any) => `${m.role}: ${m.content}`)
      });

      // 验证：User 消息应该在 Assistant 消息之前
      const messageOrder = result.messages.map((m: any) => m.role);
      for (let j = 0; j < messageOrder.length - 1; j++) {
        if (messageOrder[j] === 'assistant' && messageOrder[j + 1] === 'user') {
          console.error(`[测试] ❌ 发现乱序：Assistant 消息在 User 消息之前`);
        }
      }

      // 验证：不应该有 isStreaming: true 的消息
      const streamingMessages = result.messages.filter((m: any) => m.isStreaming);
      if (streamingMessages.length > 0) {
        console.error(`[测试] ❌ 发现卡在流式状态的消息:`, streamingMessages);
      }
    }

    console.log('[测试] ✅ 气泡次序测试完成');
  });

  test('问题2: Tab 内容串扰 - 检查消息隔离性', async ({ page }) => {
    console.log('[测试] 开始测试 Tab 内容串扰问题');

    // 1. 创建 Tab A 并添加唯一内容
    const threadIdA = await page.evaluate(async () => {
      const threadStore = (window as any).__threadStore;
      const chatStore = (window as any).__chatStore;

      threadStore.getState().createThread({
        id: undefined,
        title: 'Tab A',
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
        messageCount: 0
      });

      const newThreadId = (window as any).__threadStore.getState().activeThreadId;

      chatStore.getState().sendMessage('Tab A 的独有消息');
      await new Promise(r => setTimeout(r, 100));

      return newThreadId;
    });

    console.log('[测试] Tab A 创建完成:', threadIdA || '(null)');

    // 2. 创建 Tab B 并添加不同内容
    const threadIdB = await page.evaluate(async () => {
      const threadStore = (window as any).__threadStore;
      const chatStore = (window as any).__chatStore;

      threadStore.getState().createThread({
        id: undefined,
        title: 'Tab B',
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
        messageCount: 0
      });

      const newThreadId = (window as any).__threadStore.getState().activeThreadId;

      chatStore.getState().sendMessage('Tab B 的独有消息');
      await new Promise(r => setTimeout(r, 100));

      return newThreadId;
    });

    console.log('[测试] Tab B 创建完成:', threadIdB.substring(0, 8));

    // 3. 等待持久化
    await page.waitForTimeout(1500);

    // 🏆 输出持久化日志
    const logs = await page.evaluate(() => (window as any).__persistenceLogs || []);
    console.log('[测试] 持久化日志:', logs);

    // 4. 切换到 Tab A 并检查内容
    const tabAContent = await page.evaluate(async (targetId) => {
      const threadStore = (window as any).__threadStore;
      const chatStore = (window as any).__chatStore;

      // 🏆 修复：正确调用 switchThread（先 getState() 再调用）
      await threadStore.getState().switchThread(targetId);
      await new Promise(r => setTimeout(r, 500));

      const messages = chatStore.getState().messages;

      return {
        threadId: targetId,
        messageCount: messages.length,
        content: messages.map((m: any) => m.content).join('|'),
        hasTabBContent: messages.some((m: any) =>
          m.content && m.content.includes('Tab B')
        )
      };
    }, threadIdA);

    console.log('[测试] Tab A 内容:', tabAContent);

    // 验证：Tab A 不应该包含 Tab B 的内容
    if (tabAContent.hasTabBContent) {
      console.error('[测试] ❌ Tab 内容串扰：Tab A 包含了 Tab B 的内容');
    } else {
      console.log('[测试] ✅ Tab A 内容隔离正常');
    }

    // 5. 切换到 Tab B 并检查内容
    const tabBContent = await page.evaluate(async (targetId) => {
      const threadStore = (window as any).__threadStore;
      const chatStore = (window as any).__chatStore;

      await threadStore.getState().switchThread(targetId);
      await new Promise(r => setTimeout(r, 500));

      const messages = chatStore.getState().messages;

      return {
        threadId: targetId,
        messageCount: messages.length,
        content: messages.map((m: any) => m.content).join('|'),
        hasTabAContent: messages.some((m: any) =>
          m.content && m.content.includes('Tab A')
        )
      };
    }, threadIdB);

    console.log('[测试] Tab B 内容:', tabBContent);

    // 验证：Tab B 不应该包含 Tab A 的内容
    if (tabBContent.hasTabAContent) {
      console.error('[测试] ❌ Tab 内容串扰：Tab B 包含了 Tab A 的内容');
    } else {
      console.log('[测试] ✅ Tab B 内容隔离正常');
    }

    console.log('[测试] ✅ Tab 内容串扰测试完成');
  });

  test('问题3: 流式状态卡死 - 检查 isStreaming 持久化问题', async ({ page }) => {
    console.log('[测试] 开始测试流式状态卡死问题');

    // 1. 发送一条消息并立即切换 Tab（模拟流式传输未完成时切换）
    const result = await page.evaluate(async () => {
      const threadStore = (window as any).__threadStore;
      const chatStore = (window as any).__chatStore;

      // 获取当前线程 ID（在发送消息前）
      const threadIdA = threadStore.getState().activeThreadId;

      chatStore.getState().sendMessage('测试流式状态消息');

      // 立即创建新 Tab（不等待流式完成）
      threadStore.getState().createThread({
        id: undefined,
        title: 'Tab B',
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
        messageCount: 0
      });

      const threadIdB = (window as any).__threadStore.getState().activeThreadId;

      return { threadIdA, threadIdB };
    });

    const threadIdA = result.threadIdA;
    const threadIdB = result.threadIdB;

    console.log('[测试] Tab A:', threadIdA?.substring(0, 20) || '(null)');
    console.log('[测试] Tab B:', threadIdB?.substring(0, 20) || '(null)');

    // 2. 等待持久化
    await page.waitForTimeout(2000);

    // 3. 切换回 Tab A 并检查 isStreaming 状态
    const streamingCheck = await page.evaluate(async (targetId) => {
      const threadStore = (window as any).__threadStore;
      const chatStore = (window as any).__chatStore;

      await threadStore.getState().switchThread(targetId);
      await new Promise(r => setTimeout(r, 500));

      const messages = chatStore.getState().messages;

      return {
        messageCount: messages.length,
        streamingMessages: messages.filter((m: any) => m.isStreaming),
        allMessageStates: messages.map((m: any) => ({
          id: m.id.substring(0, 8),
          role: m.role,
          content: m.content?.substring(0, 20),
          isStreaming: m.isStreaming,
          status: m.status
        }))
      };
    }, threadIdA);

    console.log('[测试] 流式状态检查:', streamingCheck);

    if (streamingCheck.streamingMessages.length > 0) {
      console.error('[测试] ❌ 发现卡在流式状态的消息:', streamingCheck.streamingMessages);
    } else {
      console.log('[测试] ✅ 所有消息的流式状态正常');
    }

    console.log('[测试] ✅ 流式状态卡死测试完成');
  });
});
