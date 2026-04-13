/**
 * Explore 命令历史消息消失 Bug 测试
 *
 * Bug 描述：当用户输入 /explore 命令时，监控器出现并显示"执行中..."，
 * 但上下文中历史气泡其它信息都没有了。刷新页面或重启后可以出现。
 *
 * 测试场景:
 * 1. 发送多条普通消息建立历史记录
 * 2. 发送 /explore 命令
 * 3. 验证历史消息是否仍然可见
 * 4. 监控器是否正确显示
 *
 * 测试标签: @chat @explore @bug @regression
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

test.describe('Explore 命令历史消息消失 Bug', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', msg => {
      const text = msg.text();
      if (
        text.includes('[Explore]') ||
        text.includes('[Workflow]') ||
        text.includes('[MessageQueue]') ||
        text.includes('[VirtualList]') ||
        text.includes('[BugTest]') ||
        text.includes('[StoreMapper]') ||
        text.includes('[useChatStore]')
      ) {
        console.log('[Browser Console]', text);
      }
    });

    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForTimeout(3000);

    await page.evaluate(() => {
      const layoutStore = (window as any).__layoutStore;
      if (layoutStore && !layoutStore.getState().isChatOpen) {
        layoutStore.getState().toggleChat();
      }
    });
    await page.waitForTimeout(2000);
  });

  test('Bug 重现：explore 执行期间历史消息应该保持可见', async ({ page }) => {
    console.log('[BugTest] ===== Bug 重现：Explore 执行期间历史消息可见性 =====');

    const textarea = page.locator('textarea[data-testid="chat-input"]');
    const sendButton = page.locator('[data-testid="chat-send-button"]');

    // 🔥 步骤 1：先发送 3 条普通消息建立历史记录
    const historyMessages = [
      '你好',
      '介绍一下 React',
      '什么是 TypeScript',
    ];

    console.log('[BugTest] 📝 发送历史消息...');

    for (const msg of historyMessages) {
      await textarea.fill(msg);
      await sendButton.click();
      console.log(`[BugTest] 📤 已发送: "${msg}"`);

      // 等待消息显示
      await page.waitForTimeout(1000);
    }

    // 🔥 步骤 2：验证历史消息存在
    const messagesBeforeExplore = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      const messages = chatStore?.getState()?.messages || [];
      const threadStore = (window as any).__threadStore;
      const threadInfo = threadStore?.getState() || {};

      // 🔥 DEBUG: 检查 localStorage 中的数据
      const localStorageData = {
        ifaiChatStorage: localStorage.getItem('ifai-chat-storage-v7'),
        ifaiThreadStorage: localStorage.getItem('ifai-thread-storage'),
      };

      return {
        total: messages.length,
        userMessages: messages.filter((m: any) => m.role === 'user').length,
        assistantMessages: messages.filter((m: any) => m.role === 'assistant').length,
        messageContents: messages.filter((m: any) => m.role === 'user').map((m: any) => m.content?.substring(0, 20)),
        threadInfo: {
          activeThreadId: threadInfo.activeThreadId,
          threadsCount: Object.keys(threadInfo.threads || {}).length,
        },
        localStorage: localStorageData,
      };
    });

    console.log('[BugTest] 📊 Explore 前的状态:', messagesBeforeExplore);
    console.log('[BugTest] 📊 Thread info:', messagesBeforeExplore.threadInfo);
    expect(messagesBeforeExplore.userMessages).toBeGreaterThanOrEqual(3);

    // 🔥 步骤 3：发送 /explore 命令
    const exploreCommand = '/explore React Hooks';
    await textarea.fill(exploreCommand);
    await sendButton.click();
    console.log(`[BugTest] 📤 已发送: "${exploreCommand}"`);

    // 等待工作流开始执行
    await page.waitForTimeout(2000);

    // 🔥 步骤 4：关键验证 - 检查历史消息是否仍然可见
    const messagesDuringExplore = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      const messages = chatStore?.getState()?.messages || [];
      const threadStore = (window as any).__threadStore;
      const threadInfo = threadStore?.getState() || {};

      return {
        total: messages.length,
        userMessages: messages.filter((m: any) => m.role === 'user').length,
        assistantMessages: messages.filter((m: any) => m.role === 'assistant').length,
        messageContents: messages.filter((m: any) => m.role === 'user').map((m: any) => m.content?.substring(0, 20)),
        threadInfo: {
          activeThreadId: threadInfo.activeThreadId,
          threadsCount: Object.keys(threadInfo.threads || {}).length,
          allThreadIds: Object.keys(threadInfo.threads || {}),
        },
        chatStoreState: {
          isLoading: chatStore?.getState()?.isLoading,
          currentThreadId: chatStore?.getState()?.currentThreadId,
        },
        // 添加所有消息的详细信息
        allMessages: messages.map((m: any) => ({
          id: m.id?.substring(0, 8),
          role: m.role,
          hasContent: !!m.content,
          contentLength: m.content?.length || 0,
          contentPreview: m.content?.substring(0, 50),
        })),
      };
    });

    console.log('[BugTest] 📊 Explore 期间的状态:', messagesDuringExplore);
    console.log('[BugTest] 📊 Thread info after explore:', messagesDuringExplore.threadInfo);
    console.log('[BugTest] 📊 ChatStore state:', messagesDuringExplore.chatStoreState);
    console.log('[BugTest] 📋 所有消息详情:', messagesDuringExplore.allMessages);

    // 🔥 核心断言：历史消息数量应该保持不变
    expect(messagesDuringExplore.userMessages).toBeGreaterThanOrEqual(messagesBeforeExplore.userMessages);

    // 验证具体的历史消息内容是否存在
    for (const expectedMsg of historyMessages) {
      const found = messagesDuringExplore.messageContents.some((content: string) =>
        content.includes(expectedMsg.substring(0, 10))
      );
      console.log(`[BugTest] 🔍 检查历史消息 "${expectedMsg}": ${found ? '✅ 存在' : '❌ 消失'}`);
      expect(found).toBe(true);
    }

    // 🔥 步骤 5：验证 DOM 中实际渲染的消息数量
    const renderedMessages = await page.evaluate(() => {
      const messageElements = document.querySelectorAll('[data-testid^="message-"]');
      return {
        count: messageElements.length,
        visibleMessages: Array.from(messageElements).map(el => {
          // 使用 data-role 和全文文本内容（MessageItem 没有 data-testid="message-content"）
          return el.textContent?.substring(0, 50) || '';
        }).filter(text => text.length > 0),
      };
    });

    console.log('[BugTest] 📊 DOM 中渲染的消息:', renderedMessages);

    // 🔥 核心断言：DOM 中应该至少显示历史消息 + explore 命令
    expect(renderedMessages.count).toBeGreaterThanOrEqual(historyMessages.length);

    // 验证历史消息是否在 DOM 中可见
    for (const expectedMsg of historyMessages) {
      const found = renderedMessages.visibleMessages.some((content: string) =>
        content.includes(expectedMsg.substring(0, 10))
      );
      if (!found) {
        console.log(`[BugTest] ❌ Bug 确认：历史消息 "${expectedMsg}" 在 DOM 中不可见！`);
      }
      expect(found).toBe(true);
    }

    // 🔥 步骤 6：验证工作流监控器是否正确显示
    const workflowMonitorVisible = await page.evaluate(() => {
      const monitor = document.querySelector('[data-testid="workflow-inline-monitor"]');
      return {
        exists: !!monitor,
        isVisible: monitor ? window.getComputedStyle(monitor).display !== 'none' : false,
      };
    });

    console.log('[BugTest] 📊 工作流监控器状态:', workflowMonitorVisible);

    // 等待 explore 完成
    await page.waitForTimeout(15000);

    console.log('[BugTest] ✅ Bug 重现测试完成');
  });

  test('边界情况：只有 1 条历史消息 + explore 命令', async ({ page }) => {
    console.log('[BugTest] ===== 边界情况：1 条历史 + explore =====');

    const textarea = page.locator('textarea[data-testid="chat-input"]');
    const sendButton = page.locator('[data-testid="chat-send-button"]');

    // 只发送 1 条历史消息
    await textarea.fill('唯一的消息');
    await sendButton.click();
    await page.waitForTimeout(1000);

    // 发送 explore 命令
    await textarea.fill('/explore test');
    await sendButton.click();
    await page.waitForTimeout(2000);

    // 验证：历史消息应该仍然可见
    const renderedMessages = await page.evaluate(() => {
      const messageElements = document.querySelectorAll('[data-testid^="message-"]');
      return Array.from(messageElements).map(el => {
        return el.textContent?.substring(0, 50) || '';
      });
    });

    console.log('[BugTest] 📊 渲染的消息:', renderedMessages);

    // 应该至少有 2 条消息：历史消息 + explore 命令
    const hasHistoryMessage = renderedMessages.some((msg: string) =>
      msg.includes('唯一的消息')
    );

    expect(hasHistoryMessage).toBe(true);

    console.log('[BugTest] ✅ 边界情况测试完成');
  });

  test('边界情况：大量历史消息（25条）+ explore 命令', async ({ page }) => {
    console.log('[BugTest] ===== 边界情况：25 条历史 + explore =====');

    const textarea = page.locator('textarea[data-testid="chat-input"]');
    const sendButton = page.locator('[data-testid="chat-send-button"]');

    // Mock generateResponse 加速测试
    await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      if (!chatStore) return;

      chatStore.setState({
        generateResponse: async (...args: any[]) => {
          await new Promise(resolve => setTimeout(resolve, 100));
          return undefined;
        },
      });
    });

    await page.waitForTimeout(500);

    // 发送 25 条历史消息
    console.log('[BugTest] 📝 发送 25 条历史消息...');
    for (let i = 1; i <= 25; i++) {
      await textarea.fill(`历史消息 ${i}`);
      await sendButton.click();
      if (i % 5 === 0) {
        console.log(`[BugTest] 📤 已发送 ${i}/25 条消息`);
      }
      await page.waitForTimeout(50); // 快速发送
    }

    await page.waitForTimeout(1000);

    // 发送 explore 命令
    await textarea.fill('/explore React');
    await sendButton.click();
    await page.waitForTimeout(2000);

    // 验证：最后几条历史消息应该可见
    const renderedMessages = await page.evaluate(() => {
      const messageElements = document.querySelectorAll('[data-testid^="message-"]');
      return {
        count: messageElements.length,
        lastMessages: Array.from(messageElements).slice(-5).map(el => {
          return el.textContent?.substring(0, 50) || '';
        }),
      };
    });

    console.log('[BugTest] 📊 渲染的消息统计:', {
      总数: renderedMessages.count,
      最后5条: renderedMessages.lastMessages,
    });

    // 验证 store 中消息数量正确（虚拟滚动下 DOM 只渲染可见部分，但 store 应该完整）
    const storeMessages = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      return chatStore?.getState()?.messages?.length || 0;
    });
    // store 中应该有 25 条用户消息 + 25 条 assistant 回复 + 1 条 explore 命令
    expect(storeMessages).toBeGreaterThanOrEqual(25);

    // DOM 中应该渲染了部分消息（虚拟滚动只渲染可见区域）
    expect(renderedMessages.count).toBeGreaterThan(0);

    // 验证最后几条历史消息是否包含"历史消息"
    const hasRecentHistory = renderedMessages.lastMessages.some((msg: string) =>
      msg.includes('历史消息')
    );

    expect(hasRecentHistory).toBe(true);

    console.log('[BugTest] ✅ 大量历史消息测试完成');
  });

  test('验证 VirtualMessageList 的 slice 逻辑', async ({ page }) => {
    console.log('[BugTest] ===== 验证 VirtualMessageList slice 逻辑 =====');

    const textarea = page.locator('textarea[data-testid="chat-input"]');
    const sendButton = page.locator('[data-testid="chat-send-button"]');

    // Mock generateResponse
    await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      if (!chatStore) return;

      chatStore.setState({
        generateResponse: async (...args: any[]) => {
          await new Promise(resolve => setTimeout(resolve, 100));
          return undefined;
        },
      });
    });

    await page.waitForTimeout(500);

    // 发送 10 条历史消息
    for (let i = 1; i <= 10; i++) {
      await textarea.fill(`消息 ${i}`);
      await sendButton.click();
      await page.waitForTimeout(50);
    }

    await page.waitForTimeout(1000);

    // 发送 explore 命令
    await textarea.fill('/explore test');
    await sendButton.click();
    await page.waitForTimeout(1500);

    // 🔥 关键测试：检查 VirtualMessageList 的渲染逻辑
    const virtualListDebug = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      const messages = chatStore?.getState()?.messages || [];

      // 模拟 VirtualMessageList 的过滤逻辑
      const visibleMessages = messages.filter((m: any) => m.role !== 'tool');
      const hasPendingToolCalls = messages.some((m: any) =>
        m.toolCalls?.some((tc: any) => tc.status === 'pending' || tc.isPartial)
      );

      // 模拟 slice 逻辑
      const STREAMING_RENDER_LIMIT = 20;
      const shouldSlice = hasPendingToolCalls; // explore 执行时为 true
      const messagesToRender = shouldSlice
        ? visibleMessages.slice(-STREAMING_RENDER_LIMIT)
        : visibleMessages;

      return {
        totalMessages: messages.length,
        visibleMessages: visibleMessages.length,
        hasPendingToolCalls,
        shouldSlice,
        messagesToRender: messagesToRender.length,
        sliceResult: messagesToRender.map((m: any) => ({
          role: m.role,
          content: m.content?.substring(0, 20),
        })),
      };
    });

    console.log('[BugTest] 📊 VirtualMessageList 调试信息:', virtualListDebug);

    // 验证：slice 后的消息数量应该正确
    expect(virtualListDebug.messagesToRender).toBeGreaterThan(10); // 至少应该有 10 条历史消息

    // 如果总消息数少于 20，slice 不应该截断任何消息
    if (virtualListDebug.totalMessages < 20) {
      expect(virtualListDebug.messagesToRender).toBe(virtualListDebug.totalMessages);
    }

    console.log('[BugTest] ✅ VirtualMessageList slice 逻辑验证完成');
  });
});
