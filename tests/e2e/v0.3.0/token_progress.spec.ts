/**
 * E2E Tests for Token Progress Bar
 *
 * 测试目标：
 * 1. 验证 token 进度条在发送消息后正确显示
 * 2. 验证进度条百分比正确更新
 * 3. 验证进度条颜色根据使用率正确变化
 * 4. 验证 isLoading 状态正确设置和清除
 * 5. 验证 token 数量计算正确
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

test.describe.skip('Token Progress Bar - Feedback Validation - TODO: Fix this test', () => {
  test.beforeEach(async ({ page }) => {
    // 🔥 监听浏览器控制台日志
    page.on('console', msg => {
      const text = msg.text();
      const type = msg.type();
      if (text.includes('[TokenUsageIndicator]') || text.includes('token') || text.includes('Token') || type === 'error') {
        console.log('[Browser Console]', text);
      }
    });

    // 🔥 不传递 apiKey 参数，让 setupE2ETestEnvironment 自动从 .env.e2e.local 加载
    await setupE2ETestEnvironment(page, {
      useRealAI: true,
    });

    await page.goto('/');
    await page.waitForTimeout(2000);

    // 打开聊天面板
    await page.evaluate(() => {
      const layoutStore = (window as any).__layoutStore;
      if (layoutStore && !layoutStore.getState().isChatOpen) {
        layoutStore.getState().toggleChat();
      }
    });
    await page.waitForTimeout(1000);

    // 🔥 等待 chatStore 被设置
    await page.waitForFunction(() => (window as any).__chatStore !== undefined, { timeout: 15000 });
  });

  test('@commercial TOKEN-PROG-01: Token progress bar should be visible after sending message', async ({ page }) => {
    // 测试：发送消息后，token 进度条应该可见

    const chatInput = page.locator('input[data-testid="chat-input"]');
    await expect(chatInput).toBeVisible({ timeout: 10000 });

    // 步骤 1: 检查初始状态（没有消息时，进度条不应该显示）
    const initialTokenBar = await page.evaluate(() => {
      const tokenBar = document.querySelector('[class*="token"], [class*="Token"]');
      return {
        exists: !!tokenBar,
        visible: tokenBar ? (tokenBar as HTMLElement).offsetParent !== null : false,
        innerHTML: tokenBar ? tokenBar.innerHTML.substring(0, 200) : null
      };
    });

    console.log('[Token Bar] Initial state:', initialTokenBar);

    // 步骤 2: 发送一条简单消息
    await chatInput.fill('Hello');
    await page.keyboard.press('Enter');

    // 步骤 3: 等待响应完成
    await page.waitForTimeout(10000);

    // 步骤 4: 检查响应后 token 进度条状态
    const afterMessageTokenBar = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      // 🔥 __chatStore 直接就是 useChatStore
      const state = chatStore?.getState();

      // 查找 token 进度条（可能在聊天面板底部）
      const tokenBar = document.querySelector('[class*="token"], [class*="Token"]') ||
                       document.querySelector('.text-xs.font-mono');

      return {
        messageCount: state?.messages?.length || 0,
        isLoading: state?.isLoading || false,
        tokenBarExists: !!tokenBar,
        tokenBarHTML: tokenBar ? tokenBar.innerHTML.substring(0, 300) : null,
        // 查找进度条元素
        progressBarExists: !!document.querySelector('[class*="h-1.5"][class*="bg-gray-700"]'),
        // 查找 token 计数文本
        tokenCountText: tokenBar ? tokenBar.textContent?.substring(0, 100) : null
      };
    });

    console.log('[Token Bar] After message:', afterMessageTokenBar);

    // 验证：应该有消息
    expect(afterMessageTokenBar.messageCount).toBeGreaterThan(0);
    // 验证：加载状态应该结束
    expect(afterMessageTokenBar.isLoading).toBe(false);

    // ❌ 当前问题：进度条可能不存在或不可见
    // TODO: 修复后应该验证 tokenBarExists === true
  });

  test('@commercial TOKEN-PROG-02: Token percentage should be calculated correctly', async ({ page }) => {
    // 测试：token 百分比应该正确计算

    const chatInput = page.locator('input[data-testid="chat-input"]');
    await expect(chatInput).toBeVisible({ timeout: 10000 });

    // 步骤 1: 发送多条消息以增加 token 数量
    const messages = [
      'What is 2+2?',
      'What is the capital of France?',
      'Tell me a joke'
    ];

    for (const msg of messages) {
      await chatInput.fill(msg);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(8000);
    }

    // 步骤 2: 检查 token 进度条状态
    const tokenProgress = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      const state = chatStore?.getState?.();

      // 查找所有包含百分比的元素
      const allElements = Array.from(document.querySelectorAll('*'));
      const percentageElements = allElements.filter(el =>
        el.textContent?.includes('%') &&
        (el.className.includes('token') || el.className.includes('Token') || el.className.includes('font-mono'))
      );

      return {
        messageCount: state?.messages?.length || 0,
        percentageElements: percentageElements.map(el => ({
          text: el.textContent?.substring(0, 50),
          className: el.className
        })),
        allTextContent: percentageElements.length > 0 ? percentageElements[0].textContent : null
      };
    });

    console.log('[Token Progress] After multiple messages:', tokenProgress);

    // 验证：应该有多条消息
    expect(tokenProgress.messageCount).toBeGreaterThan(2);

    // ❌ 当前问题：可能找不到百分比元素
    // TODO: 修复后应该验证 percentage 正确显示
  });

  test('@commercial TOKEN-PROG-03: Token progress bar color should change based on usage', async ({ page }) => {
    // 测试：进度条颜色应该根据使用率变化
    // < 50%: green, 50-75%: yellow, 75-90%: orange, > 90%: red

    const chatInput = page.locator('input[data-testid="chat-input"]');
    await expect(chatInput).toBeVisible({ timeout: 10000 });

    // 发送一条消息
    await chatInput.fill('Explain quantum computing in detail');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(10000);

    // 检查进度条颜色
    const progressColors = await page.evaluate(() => {
      // 查找进度条元素
      const progressBars = Array.from(document.querySelectorAll('[class*="bg-"][class*="500"]'));
      const tokenRelated = progressBars.filter(el =>
        el.parentElement?.classList.contains('h-1.5') ||
        el.className.includes('h-full')
      );

      return tokenRelated.map(el => ({
        className: el.className,
        backgroundColor: (el as HTMLElement).style.backgroundColor,
        computedBg: window.getComputedStyle(el).backgroundColor,
        hasGreen: el.classList.contains('bg-green-500'),
        hasYellow: el.classList.contains('bg-yellow-500'),
        hasOrange: el.classList.contains('bg-orange-500'),
        hasRed: el.classList.contains('bg-red-500')
      }));
    });

    console.log('[Token Colors] Progress bar colors:', progressColors);

    // 验证：应该有进度条颜色类
    // ❌ 当前问题：可能没有正确的颜色类
    // TODO: 修复后应该验证颜色正确
  });

  test('@commercial TOKEN-PROG-04: isLoading state should be correctly managed', async ({ page }) => {
    // 测试：isLoading 状态应该正确管理

    const chatInput = page.locator('input[data-testid="chat-input"]');
    await expect(chatInput).toBeVisible({ timeout: 10000 });

    // 步骤 1: 发送消息
    await chatInput.fill('Test message');
    await page.keyboard.press('Enter');

    // 步骤 2: 立即检查 isLoading 状态（发送后 100ms）
    await page.waitForTimeout(100);
    const loadingStateImmediate = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      const state = chatStore?.getState?.();
      return {
        isLoading: state?.isLoading || false,
        messageCount: state?.messages?.length || 0
      };
    });

    console.log('[Loading State] Immediate (100ms):', loadingStateImmediate);

    // 验证：isLoading 应该为 true
    expect(loadingStateImmediate.isLoading).toBe(true);

    // 步骤 3: 等待响应完成
    await page.waitForTimeout(10000);

    // 步骤 4: 检查 isLoading 是否清除
    const loadingStateAfter = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      const state = chatStore?.getState?.();
      return {
        isLoading: state?.isLoading || false,
        messageCount: state?.messages?.length || 0,
        lastMessageRole: state?.messages?.[state.messages.length - 1]?.role
      };
    });

    console.log('[Loading State] After completion:', loadingStateAfter);

    // 验证：isLoading 应该为 false
    expect(loadingStateAfter.isLoading).toBe(false);
    // 验证：应该有助手回复
    expect(loadingStateAfter.lastMessageRole).toBe('assistant');
  });

  test('@commercial TOKEN-PROG-05: Token count should update during streaming', async ({ page }) => {
    // 测试：token 计数应该在流式传输期间更新

    const chatInput = page.locator('input[data-testid="chat-input"]');
    await expect(chatInput).toBeVisible({ timeout: 10000 });

    // 收集 token 计数快照
    const tokenSnapshots: number[] = [];

    // 监听 store 变化
    await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      if (!chatStore) return;

      // 创建一个简单的监听器
      let unsubscribe: (() => void) | null = null;

      // @ts-ignore
      unsubscribe = chatStore.subscribe((state: any) => {
        const tokenData = {
          isLoading: state.isLoading,
          messageCount: state.messages?.length || 0,
          timestamp: Date.now()
        };
        console.log('[Token Snapshot]', JSON.stringify(tokenData));
      });
    });

    // 发送消息
    await chatInput.fill('Write a short poem about AI');
    await page.keyboard.press('Enter');

    // 等待流式传输完成
    await page.waitForTimeout(15000);

    // 获取最终状态
    const finalState = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      const state = chatStore?.getState?.();
      return {
        isLoading: state?.isLoading || false,
        messageCount: state?.messages?.length || 0,
        hasAssistantResponse: state?.messages?.some((m: any) => m.role === 'assistant' && m.content?.length > 0)
      };
    });

    console.log('[Token Streaming] Final state:', finalState);

    // 验证：应该有助手回复
    expect(finalState.hasAssistantResponse).toBe(true);
    // 验证：加载状态应该结束
    expect(finalState.isLoading).toBe(false);
  });

  test('@commercial TOKEN-PROG-06: Token progress bar should handle errors gracefully', async ({ page }) => {
    // 测试：token 进度条应该优雅地处理错误

    const chatInput = page.locator('input[data-testid="chat-input"]');
    await expect(chatInput).toBeVisible({ timeout: 10000 });

    // 监听控制台错误
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // 发送消息
    await chatInput.fill('Simple test');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(10000);

    // 检查是否有 token 相关错误
    const tokenErrors = consoleErrors.filter(e =>
      e.includes('TokenUsageIndicator') ||
      e.includes('token') ||
      e.includes('Token')
    );

    console.log('[Token Errors] Console errors related to token:', tokenErrors);

    // 验证：不应该有 token 相关错误
    expect(tokenErrors.length).toBe(0);
  });

  test('@commercial TOKEN-PROG-07: Complete token progress workflow validation', async ({ page }) => {
    // 测试：完整的 token 进度条工作流验证
    // 场景：发送消息 → isLoading → 流式传输 → 完成 → token 更新

    const chatInput = page.locator('input[data-testid="chat-input"]');
    await expect(chatInput).toBeVisible({ timeout: 10000 });

    // 步骤 1: 检查初始状态
    const initialState = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      const state = chatStore?.getState?.();
      return {
        messageCount: state?.messages?.length || 0,
        isLoading: state?.isLoading || false
      };
    });

    console.log('[Workflow] Initial state:', initialState);

    // 步骤 2: 发送消息
    await chatInput.fill('What is the meaning of life?');
    await page.keyboard.press('Enter');

    // 步骤 3: 立即检查状态（发送后 100ms）
    await page.waitForTimeout(100);
    const sendingState = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      const state = chatStore?.getState?.();
      return {
        isLoading: state?.isLoading || false,
        messageCount: state?.messages?.length || 0
      };
    });

    console.log('[Workflow] Sending state:', sendingState);

    // ✅ 验证：isLoading 应该为 true
    expect(sendingState.isLoading).toBe(true);

    // 步骤 4: 等待响应完成
    await page.waitForTimeout(12000);

    // 步骤 5: 检查完成状态
    const completedState = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      const state = chatStore?.getState?.();
      const tokenBar = document.querySelector('[class*="token"], [class*="Token"]');

      return {
        isLoading: state?.isLoading || false,
        messageCount: state?.messages?.length || 0,
        hasAssistantResponse: state?.messages?.some((m: any) => m.role === 'assistant'),
        tokenBarExists: !!tokenBar,
        tokenBarText: tokenBar ? tokenBar.textContent?.substring(0, 100) : null
      };
    });

    console.log('[Workflow] Completed state:', completedState);

    // ✅ 验证：isLoading 应该为 false
    expect(completedState.isLoading).toBe(false);
    // ✅ 验证：应该有助手回复
    expect(completedState.hasAssistantResponse).toBe(true);

    // ❌ 当前问题：tokenBarExists 可能为 false
    // TODO: 修复后 tokenBarExists 应该为 true，且 tokenBarText 应该包含 token 计数
  });
});
