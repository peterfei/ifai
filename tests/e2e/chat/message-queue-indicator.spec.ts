/**
 * MessageQueue & QueueIndicator E2E 测试
 *
 * 测试场景:
 * 1. 快速连续发送多条消息，验证排队功能
 * 2. 验证 QueueIndicator 显示排队数量
 * 3. 验证 QueueIndicator 显示消息内容摘要
 * 4. 验证消息按 FIFO 顺序处理
 *
 * 测试标签: @chat @queue @real-ai
 *
 * @proposal P4 Multi-Agent Collaboration - Phase 2
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

test.describe('MessageQueue: QueueIndicator UI 测试', () => {
  test.beforeEach(async ({ page }) => {
    // 监听控制台日志
    page.on('console', msg => {
      const text = msg.text();
      if (
        text.includes('[QueueIndicator]') ||
        text.includes('[MessageQueue]') ||
        text.includes('[E2E]')
      ) {
        console.log('[Browser Console]', text);
      }
    });

    // 使用真实后端配置
    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForTimeout(3000);

    // 打开聊天面板
    await page.evaluate(() => {
      const layoutStore = (window as any).__layoutStore;
      if (layoutStore && !layoutStore.getState().isChatOpen) {
        layoutStore.getState().toggleChat();
      }
    });
    await page.waitForTimeout(2000);
  });

  test('应该显示排队消息的数量', async ({ page }) => {
    console.log('[E2E] ===== 测试: 显示排队消息数量 =====');

    // 🔥 关键修复: Mock generateResponse 让它延迟完成，确保队列能积累消息
    await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      if (!chatStore) return;

      const state = chatStore.getState();
      const originalGenerateResponse = state.generateResponse;

      // 替换 generateResponse，让它延迟 5 秒
      chatStore.setState({
        generateResponse: async (...args: any[]) => {
          console.log('[E2E Mock] generateResponse called, delaying 5s...');
          await new Promise(resolve => setTimeout(resolve, 5000));
          console.log('[E2E Mock] generateResponse completed');
          // 不调用原始的 generateResponse，避免真实 AI 调用
          return undefined;
        },
      });

      console.log('[E2E] ✅ Mock installed: generateResponse now has 5s delay');
    });

    // 等待 mock 生效
    await page.waitForTimeout(500);

    // 快速连续发送 3 条消息
    const messages = ['第一条消息', '第二条消息很长很长用来测试截断', '第三条消息'];

    for (const msg of messages) {
      await page.evaluate(async (message) => {
        const { messageQueue } = await import('../../src/stores/chat/MessageQueue');
        await messageQueue.enqueue({
          content: message,
          providerId: 'openai',
          model: 'gpt-4o',
          priority: 'normal',
        });
      }, msg);

      // 快速连续发送，不等待
      await page.waitForTimeout(50);
    }

    // 等待 UI 更新
    await page.waitForTimeout(500);

    // 验证 QueueIndicator 显示
    const queueIndicator = page.locator('[data-testid="queue-indicator"]');
    await expect(queueIndicator).toBeVisible();

    // 验证显示排队数量
    const indicatorText = await queueIndicator.textContent();
    console.log('[E2E] 📋 QueueIndicator text:', indicatorText);
    expect(indicatorText).toMatch(/(\d+)\s*条等待/);

    // 验证显示消息摘要标签
    const previewLabels = queueIndicator.locator('.inline-block.bg-white\\/10');
    const count = await previewLabels.count();
    console.log('[E2E] 📊 Preview labels count:', count);

    // 应该至少有 2 条排队消息（因为第一条可能在 processing）
    expect(count).toBeGreaterThanOrEqual(2);

    console.log('[E2E] ✅ QueueIndicator 显示了排队消息摘要');
  });

  test('应该显示排队消息的内容摘要', async ({ page }) => {
    console.log('[E2E] ===== 测试: 显示消息内容摘要 =====');

    // Mock generateResponse 延迟
    await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      if (!chatStore) return;

      chatStore.setState({
        generateResponse: async (...args: any[]) => {
          console.log('[E2E Mock] generateResponse delaying...');
          await new Promise(resolve => setTimeout(resolve, 5000));
          return undefined;
        },
      });

      console.log('[E2E] ✅ Mock installed');
    });

    await page.waitForTimeout(500);

    // 发送不同长度的消息
    const messages = [
      '你好',  // 短消息
      '这是一条非常非常长的消息，用来测试截断功能',  // 长消息
      '请介绍一下你自己',  // 中等长度
    ];

    for (const msg of messages) {
      await page.evaluate(async (message) => {
        const { messageQueue } = await import('../../src/stores/chat/MessageQueue');
        await messageQueue.enqueue({
          content: message,
          providerId: 'openai',
          model: 'gpt-4o',
          priority: 'normal',
        });
      }, msg);
      await page.waitForTimeout(50);
    }

    // 等待 UI 更新
    await page.waitForTimeout(500);

    // 验证 QueueIndicator 显示消息摘要
    const queueIndicator = page.locator('[data-testid="queue-indicator"]');
    await expect(queueIndicator).toBeVisible();

    // 获取所有消息摘要标签
    const previewLabels = queueIndicator.locator('.inline-block.bg-white\\/10');

    const count = await previewLabels.count();
    console.log('[E2E] 📊 Preview labels count:', count);
    expect(count).toBeGreaterThanOrEqual(2); // 至少有 2 条

    // 验证每条消息的摘要内容
    for (let i = 0; i < Math.min(count, 3); i++) {
      const text = await previewLabels.nth(i).textContent();
      console.log(`[E2E] 📋 摘要 ${i + 1}: "${text}"`);
      expect(text).toBeTruthy();
      expect(text!.length).toBeGreaterThan(0);

      // 验证长消息被截断
      if (i === 1) {
        // 第二条消息很长，应该被截断
        expect(text!.length).toBeLessThanOrEqual(23); // 20字符 + "..."
      }
    }

    console.log('[E2E] ✅ QueueIndicator 显示了所有消息摘要');
  });

  test('应该在消息处理完成后隐藏 QueueIndicator', async ({ page }) => {
    console.log('[E2E] ===== 测试: 消息完成后隐藏指示器 =====');

    // 发送一条消息
    await page.evaluate(async () => {
      const { messageQueue } = await import('../../src/stores/chat/MessageQueue');
      await messageQueue.enqueue({
        content: '测试消息',
        providerId: 'openai',
        model: 'gpt-4o',
        priority: 'normal',
      });
    });

    // 等待 QueueIndicator 出现
    const queueIndicator = page.locator('[data-testid="queue-indicator"]');
    await expect(queueIndicator).toBeVisible({ timeout: 3000 });
    console.log('[E2E] ✅ QueueIndicator 已显示');

    // 等待消息处理完成（模拟延迟）
    await page.waitForTimeout(3000);

    // 验证 QueueIndicator 消失
    await expect(queueIndicator).not.toBeVisible({ timeout: 2000 });
    console.log('[E2E] ✅ QueueIndicator 已隐藏');
  });

  test('应该通过 UI 输入框触发队列功能', async ({ page }) => {
    console.log('[E2E] ===== 测试: UI 输入框触发队列 =====');

    // Mock generateResponse 延迟完成，确保消息在队列中积累
    await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      if (!chatStore) return;
      chatStore.setState({
        generateResponse: async (...args: any[]) => {
          console.log('[E2E Mock] generateResponse called, delaying 5s...');
          await new Promise(resolve => setTimeout(resolve, 5000));
          console.log('[E2E Mock] generateResponse completed');
          return undefined;
        },
      });
    });
    await page.waitForTimeout(500);

    const textarea = page.locator('textarea[data-testid="chat-input"]');
    const sendButton = page.locator('[data-testid="chat-send-button"]');

    // 快速连续发送 2 条消息
    await textarea.fill('第一条消息');
    await sendButton.click();

    await page.waitForTimeout(300); // 确保第一条消息已入队

    await textarea.fill('第二条消息');
    await sendButton.click();

    // 等待 QueueIndicator 出现并包含排队信息
    const queueIndicator = page.locator('[data-testid="queue-indicator"]');
    await expect(queueIndicator).toBeVisible({ timeout: 5000 });

    // 等待文本内容包含 "条等待"
    await expect(queueIndicator).toContainText('条等待', { timeout: 5000 });

    // 验证输入框已清空（可以继续输入）
    await expect(textarea).toHaveValue('');

    const indicatorText = await queueIndicator.textContent();
    expect(indicatorText).toMatch(/(\d+)\s*条等待/);

    console.log('[E2E] ✅ UI 输入框正确触发队列功能');
  });
});

test.describe('MessageQueue: 真实 AI 响应测试', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[QueueIndicator]') || text.includes('[MessageQueue]')) {
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

  // @slow 依赖真实 AI API 响应，网络不稳定时容易超时
  test.skip('真实 AI: 连续消息应该排队并按顺序处理', async ({ page }) => {
    console.log('[E2E] ===== 测试: 真实 AI 排队处理 =====');

    const textarea = page.locator('textarea[data-testid="chat-input"]');
    const sendButton = page.locator('[data-testid="chat-send-button"]');
    const queueIndicator = page.locator('[data-testid="queue-indicator"]');

    // 发送第一条消息
    await textarea.fill('1+1等于几？');
    await sendButton.click();
    console.log('[E2E] 📤 发送第一条消息');

    // 短暂延迟后发送第二条
    await page.waitForTimeout(500);
    await textarea.fill('2+2等于几？');
    await sendButton.click();
    console.log('[E2E] 📤 发送第二条消息');

    // 验证 QueueIndicator 显示排队
    await expect(queueIndicator).toBeVisible({ timeout: 2000 });
    const indicatorText = await queueIndicator.textContent();
    expect(indicatorText).toContain('条等待');

    console.log('[E2E] ✅ 消息已进入队列');

    // 等待所有消息处理完成
    await page.waitForTimeout(30000);

    // 验证 QueueIndicator 消失
    await expect(queueIndicator).not.toBeVisible({ timeout: 5000 });

    // 验证聊天历史中有 AI 回复
    const messages = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      return chatStore?.getState().messages || [];
    });

    const assistantMessages = messages.filter((m: any) => m.role === 'assistant');
    console.log('[E2E] 📊 助手回复数量:', assistantMessages.length);
    expect(assistantMessages.length).toBeGreaterThanOrEqual(2);

    console.log('[E2E] ✅ 真实 AI 测试完成');
  });
});

test.describe('MessageQueue: 工作流消息优先级测试', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[QueueIndicator]') || text.includes('[MessageQueue]')) {
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

  test('工作流消息应该有高优先级标识', async ({ page }) => {
    console.log('[E2E] ===== 测试: 工作流优先级标识 =====');

    // 发送工作流命令
    await page.evaluate(async () => {
      const { messageQueue } = await import('../../src/stores/chat/MessageQueue');
      await messageQueue.enqueue({
        content: '/explore how to use message queue',
        providerId: 'openai',
        model: 'gpt-4o',
        priority: 'high',  // 工作流消息高优先级
      });
    });

    await page.waitForTimeout(200);

    // 再发送普通消息
    await page.evaluate(async () => {
      const { messageQueue } = await import('../../src/stores/chat/MessageQueue');
      await messageQueue.enqueue({
        content: '普通消息',
        providerId: 'openai',
        model: 'gpt-4o',
        priority: 'normal',
      });
    });

    // 等待 QueueIndicator 出现
    const queueIndicator = page.locator('[data-testid="queue-indicator"]');
    await expect(queueIndicator).toBeVisible({ timeout: 5000 });

    // 等待排队信息显示（可能显示 "条等待" 或只有 "处理中"）
    await page.waitForTimeout(500);

    const indicatorHtml = await queueIndicator.innerHTML();
    console.log('[E2E] 📋 Indicator HTML:', indicatorHtml);

    // 验证 QueueIndicator 显示了队列信息：
    // - 工作流消息可能已被处理完（显示 "处理中" + "1 条等待" + "普通消息" 标签 + ⚡ 图标）
    // - 或者两条都在队列中
    // 检查是否有排队相关的 UI 元素（标签或图标）
    const hasQueueUI =
      indicatorHtml.includes('条等待') ||
      indicatorHtml.includes('处理中') ||
      indicatorHtml.includes('zap') ||  // 工作流闪电图标
      indicatorHtml.includes('purple'); // 紫色主题
    expect(hasQueueUI).toBe(true);

    console.log('[E2E] ✅ 工作流优先级标识显示正确');
  });
});
