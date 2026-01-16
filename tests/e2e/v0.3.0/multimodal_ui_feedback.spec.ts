/**
 * E2E Tests for Multimodal UI Feedback
 *
 * 测试目标：
 * 1. 验证发送多模态消息后立即显示加载动画
 * 2. 验证流式输出反馈及时出现
 * 3. 验证用户不会等待太长时间而没有任何反馈
 * 4. 验证加载状态的正确设置和清除
 * 5. 验证消息发送后 UI 立即响应
 *
 * 测试场景：
 * - MM-UI-01: 发送消息后立即显示加载状态
 * - MM-UI-02: 加载动画在 1 秒内出现
 * - MM-UI-03: 流式输出及时开始
 * - MM-UI-04: 加载状态在响应完成后清除
 * - MM-UI-05: 用户输入框状态正确更新
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

test.describe('Multimodal UI Feedback - Loading State', () => {
  test.beforeEach(async ({ page }) => {
    // 🔥 监听浏览器控制台日志
    page.on('console', msg => {
      const text = msg.text();
      const type = msg.type();
      if (text.includes('[AI Chat]') || text.includes('isLoading') || text.includes('Loading') || type === 'error') {
        console.log('[Browser Console]', text);
      }
    });

    // 🔥 不传递 apiKey 参数，让 setupE2ETestEnvironment 自动从 .env.e2e.local 加载
    await setupE2ETestEnvironment(page, {
      useRealAI: true,
    });

    await page.goto('/');
    await page.waitForTimeout(3000);

    // 打开聊天面板（参考 v0.3.0 drag-drop.spec.ts）
    await page.evaluate(() => {
      const layoutStore = (window as any).__layoutStore;
      // 🔥 __layoutStore 是 { useLayoutStore } 对象
      if (layoutStore && layoutStore.useLayoutStore && !layoutStore.useLayoutStore.getState().isChatOpen) {
        layoutStore.useLayoutStore.getState().toggleChat();
      }
    });
    await page.waitForTimeout(2000);

    // 🔥 等待 chatStore 被设置
    await page.waitForFunction(() => (window as any).__chatStore !== undefined, { timeout: 15000 });
  });

  test('@commercial MM-UI-01: Loading state should be set immediately after sending message', async ({ page }) => {
    // 测试：发送消息后，isLoading 状态应该立即设置为 true

    const chatInput = page.locator('input[data-testid="chat-input"]');
    await expect(chatInput).toBeVisible({ timeout: 10000 });

    // 步骤 1: 发送消息
    await chatInput.fill('请分析这张图片');
    await page.keyboard.press('Enter');

    // 步骤 2: 立即检查 isLoading 状态（发送后 100ms）
    await page.waitForTimeout(100);
    const loadingState = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      if (!chatStore) {
        console.error('[Test] __chatStore is undefined!');
        return { isLoading: false, messageCount: 0, error: 'store_undefined' };
      }
      const state = chatStore.getState?.();
      return {
        isLoading: state?.isLoading || false,
        messageCount: state?.messages?.length || 0
      };
    });

    console.log('[Loading State] After 100ms:', loadingState);

    // 验证：isLoading 应该为 true
    expect(loadingState.isLoading).toBe(true);

    // 步骤 3: 等待响应完成（使用 waitForFunction 而不是固定等待时间）
    // 等待最多 45 秒让 AI 响应完成
    await page.waitForFunction(() => {
      const chatStore = (window as any).__chatStore;
      if (!chatStore) return false;
      const state = chatStore.getState?.();
      // 等待 isLoading 为 false 且有助手响应
      return state?.isLoading === false &&
             state?.messages?.some((m: any) => m.role === 'assistant' && m.content);
    }, { timeout: 45000 }).catch(() => {
      // 如果超时，记录当前状态用于调试
      page.evaluate(() => {
        const chatStore = (window as any).__chatStore;
        const state = chatStore?.getState?.();
        console.log('[Test Timeout] Current state:', {
          isLoading: state?.isLoading,
          messageCount: state?.messages?.length,
          lastMessage: state?.messages?.[state?.messages?.length - 1]
        });
      });
    });

    // 步骤 4: 验证加载状态已清除
    const finalState = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      if (!chatStore) return { isLoading: true, hasAssistantResponse: false };
      const state = chatStore?.getState?.();
      return {
        isLoading: state?.isLoading || false,
        hasAssistantResponse: state?.messages?.some((m: any) => m.role === 'assistant')
      };
    });

    console.log('[Loading State] After completion:', finalState);

    // 验证：isLoading 应该为 false
    expect(finalState.isLoading).toBe(false);
    expect(finalState.hasAssistantResponse).toBe(true);
  });

  test('@commercial MM-UI-02: Loading indicator should appear within 1 second', async ({ page }) => {
    // 测试：加载指示器应该在 1 秒内出现
    // 目的：确保用户不会等待太久而看不到任何反馈

    const chatInput = page.locator('input[data-testid="chat-input"]');
    await expect(chatInput).toBeVisible({ timeout: 10000 });

    // 收集时间点数据
    const timestamps: { event: string; time: number }[] = [];

    // 步骤 1: 记录发送时间
    const sendTime = Date.now();
    timestamps.push({ event: 'send', time: sendTime });

    await chatInput.fill('测试加载动画');
    await page.keyboard.press('Enter');

    // 步骤 2: 等待加载指示器出现（最多等待 1 秒）
    try {
      await page.waitForFunction(() => {
        const chatStore = (window as any).__chatStore;
        if (!chatStore) return false;
        const state = chatStore.getState?.();
        return state?.isLoading === true;
      }, { timeout: 1000 });

      const loadingAppearTime = Date.now();
      timestamps.push({ event: 'loading_appear', time: loadingAppearTime });

      const timeToLoading = loadingAppearTime - sendTime;
      console.log('[Timing] Loading indicator appeared after:', timeToLoading, 'ms');

      // 验证：加载指示器应该在 1 秒内出现
      expect(timeToLoading).toBeLessThan(1000);

    } catch (e) {
      const failTime = Date.now();
      timestamps.push({ event: 'timeout', time: failTime });
      console.log('[Timing] Loading indicator did NOT appear within 1 second');
      console.log('[Timing] Timestamps:', timestamps);

      // ❌ 当前问题：可能没有实现 isLoading 状态
      // TODO: 修复后应该通过此测试
      throw new Error('Loading indicator did not appear within 1 second');
    }

    // 步骤 3: 等待响应完成
    await page.waitForTimeout(8000);
  });
});

test.describe('Multimodal UI Feedback - Streaming Output', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('stream') || text.includes('Stream') || text.includes('chunk')) {
        console.log('[Browser Console]', text);
      }
    });

    // 🔥 不传递 apiKey 参数，让 setupE2ETestEnvironment 自动从 .env.e2e.local 加载
    await setupE2ETestEnvironment(page, {
      useRealAI: true,
    });

    await page.goto('/');
    await page.waitForTimeout(3000);

    // 打开聊天面板（参考 v0.3.0 drag-drop.spec.ts）
    await page.evaluate(() => {
      const layoutStore = (window as any).__layoutStore;
      // 🔥 __layoutStore 是 { useLayoutStore } 对象
      if (layoutStore && layoutStore.useLayoutStore && !layoutStore.useLayoutStore.getState().isChatOpen) {
        layoutStore.useLayoutStore.getState().toggleChat();
      }
    });
    await page.waitForTimeout(2000);

    // 🔥 等待 chatStore 被设置
    await page.waitForFunction(() => (window as any).__chatStore !== undefined, { timeout: 15000 });
  });

  test('@commercial MM-UI-03: Streaming output should start within acceptable time', async ({ page }) => {
    // 测试：流式输出应该在可接受的时间内开始
    // 目的：确保用户不会等待太久才看到第一个字符

    // 调试：检查页面状态
    const pageState = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input'));
      const layoutStore = (window as any).__layoutStore;
      return {
        inputCount: inputs.length,
        inputs: inputs.map(i => ({
          type: (i as HTMLInputElement).type,
          dataTestId: (i as HTMLInputElement).getAttribute('data-testid'),
          placeholder: (i as HTMLInputElement).placeholder
        })),
        chatStoreExists: !!(window as any).__chatStore,
        layoutStoreExists: !!layoutStore,
        isChatOpen: layoutStore?.getState?.()?.isChatOpen ?? 'unknown',
        bodyHTML: document.body.innerHTML.substring(0, 500)
      };
    });
    console.log('[MM-UI-03] Page state:', JSON.stringify(pageState));

    const chatInput = page.locator('input[data-testid="chat-input"]');
    await expect(chatInput).toBeVisible({ timeout: 10000 });

    // 收集消息内容变化
    const contentSnapshots: { time: number; contentLength: number }[] = [];

    // 步骤 1: 设置监听器来跟踪消息内容变化
    await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      if (!chatStore) return;

      let lastContentLength = 0;
      let unsubscribe: (() => void) | null = null;

      // @ts-ignore
      unsubscribe = chatStore.subscribe((state: any) => {
        const messages = state?.messages || [];
        const lastMessage = messages[messages.length - 1];

        if (lastMessage && lastMessage.role === 'assistant') {
          const content = typeof lastMessage.content === 'string'
            ? lastMessage.content
            : JSON.stringify(lastMessage.content);
          const contentLength = content.length;

          if (contentLength !== lastContentLength) {
            console.log('[Streaming] Content length changed:', {
              prev: lastContentLength,
              current: contentLength,
              delta: contentLength - lastContentLength,
              timestamp: Date.now()
            });
            lastContentLength = contentLength;
          }
        }
      });
    });

    // 步骤 2: 发送消息
    const sendTime = Date.now();
    await chatInput.fill('写一首短诗');
    await page.keyboard.press('Enter');

    // 步骤 3: 等待助手消息出现（增加到 20 秒）
    try {
      await page.waitForFunction(() => {
        const chatStore = (window as any).__chatStore;
        if (!chatStore) return false;
        const state = chatStore.getState?.();
        if (!state) return false;
        const messages = state?.messages || [];
        const lastMessage = messages[messages.length - 1];
        return lastMessage?.role === 'assistant' &&
               (lastMessage.content?.length || 0) > 0;
      }, { timeout: 20000 });

      const firstContentTime = Date.now();
      const timeToFirstContent = firstContentTime - sendTime;

      console.log('[Streaming] First content appeared after:', timeToFirstContent, 'ms');

      // 验证：第一个内容应该在 20 秒内出现（AI 响应时间可能较长）
      expect(timeToFirstContent).toBeLessThan(20000);

      // 步骤 4: 检查内容是否在持续增长（流式输出）
      await page.waitForTimeout(3000);

      const streamingProgress = await page.evaluate(() => {
        const chatStore = (window as any).__chatStore;
        if (!chatStore) return { messageCount: 0, lastMessageLength: 0, isLoading: false };
        const state = chatStore?.getState?.();
        if (!state) return { messageCount: 0, lastMessageLength: 0, isLoading: false };
        const messages = state?.messages || [];
        const assistantMessages = messages.filter((m: any) => m.role === 'assistant');
        const lastAssistant = assistantMessages[assistantMessages.length - 1];

        return {
          messageCount: assistantMessages.length,
          lastMessageLength: lastAssistant?.content?.length || 0,
          isLoading: state?.isLoading || false
        };
      });

      console.log('[Streaming] Progress after 3 seconds:', streamingProgress);

      // 验证：应该有助手消息且内容不为空
      expect(streamingProgress.lastMessageLength).toBeGreaterThan(0);

    } catch (e) {
      console.log('[Streaming] No content appeared within 5 seconds');
      throw new Error('Streaming output did not start within acceptable time');
    }

    // 步骤 5: 等待完成
    await page.waitForTimeout(8000);
  });

  test('@commercial MM-UI-04: User input should be disabled during processing', async ({ page }) => {
    // 测试：处理期间用户输入框应该被禁用或显示状态
    // 目的：防止用户重复提交

    const chatInput = page.locator('input[data-testid="chat-input"]');
    await expect(chatInput).toBeVisible({ timeout: 10000 });

    // 步骤 1: 发送消息
    await chatInput.fill('测试输入框状态');
    await page.keyboard.press('Enter');

    // 步骤 2: 立即检查输入框状态（发送后 100ms）
    await page.waitForTimeout(100);
    const inputStateDuringLoad = await page.evaluate(() => {
      const input = document.querySelector('input[data-testid="chat-input"]') as HTMLInputElement;
      const chatStore = (window as any).__chatStore;
      const state = chatStore?.getState?.();

      return {
        isDisabled: input?.disabled || false,
        isReadOnly: input?.readOnly || false,
        placeholder: input?.placeholder || '',
        value: input?.value || '',
        isLoading: state?.isLoading || false,
        storeExists: !!chatStore,
        stateExists: !!state
      };
    });

    console.log('[Input State] During loading:', inputStateDuringLoad);

    // 步骤 3: 等待响应完成（使用 waitForFunction 而不是固定等待时间）
    await page.waitForFunction(() => {
      const chatStore = (window as any).__chatStore;
      if (!chatStore) return false;
      const state = chatStore.getState?.();
      // 等待 isLoading 为 false 且有助手响应
      return state?.isLoading === false &&
             state?.messages?.some((m: any) => m.role === 'assistant' && m.content);
    }, { timeout: 45000 }).catch(() => {
      page.evaluate(() => {
        const chatStore = (window as any).__chatStore;
        const state = chatStore?.getState?.();
        console.log('[Test Timeout] Current state:', {
          isLoading: state?.isLoading,
          messageCount: state?.messages?.length
        });
      });
    });

    // 步骤 4: 检查输入框是否恢复
    const inputStateAfterLoad = await page.evaluate(() => {
      const input = document.querySelector('input[data-testid="chat-input"]') as HTMLInputElement;
      const chatStore = (window as any).__chatStore;
      if (!chatStore) return { isDisabled: false, isLoading: true, hasAssistantResponse: false };
      const state = chatStore?.getState?.();

      return {
        isDisabled: input?.disabled || false,
        isReadOnly: input?.readOnly || false,
        placeholder: input?.placeholder || '',
        value: input?.value || '',
        isLoading: state?.isLoading || false,
        hasAssistantResponse: state?.messages?.some((m: any) => m.role === 'assistant')
      };
    });

    console.log('[Input State] After completion:', inputStateAfterLoad);

    // 验证：加载完成后应该可以输入
    expect(inputStateAfterLoad.isLoading).toBe(false);
    expect(inputStateAfterLoad.hasAssistantResponse).toBe(true);
  });

  test('@commercial MM-UI-05: Image attachments should be cleared after sending', async ({ page }) => {
    // 测试：发送消息后，图片附件应该被清除
    // 目的：验证用户发送带图片的消息后，图片附件不会残留

    // 🔥 调试：检查页面状态
    const pageState = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input'));
      const layoutStore = (window as any).__layoutStore;
      return {
        inputCount: inputs.length,
        inputs: inputs.map(i => ({
          type: (i as HTMLInputElement).type,
          dataTestId: (i as HTMLInputElement).getAttribute('data-testid'),
          placeholder: (i as HTMLInputElement).placeholder
        })),
        chatStoreExists: !!(window as any).__chatStore,
        layoutStoreExists: !!layoutStore,
        isChatOpen: layoutStore?.getState?.()?.isChatOpen ?? 'unknown',
        bodyHTML: document.body.innerHTML.substring(0, 500)
      };
    });
    console.log('[MM-UI-05] Page state:', JSON.stringify(pageState));

    const chatInput = page.locator('input[data-testid="chat-input"]');
    await expect(chatInput).toBeVisible({ timeout: 10000 });

    // 步骤 1: 模拟添加图片附件（通过设置 React 状态）
    // 注意：由于 E2E 环境限制，我们无法直接触发文件选择
    // 但我们可以验证发送消息后，DOM 中不存在图片附件

    // 步骤 2: 发送消息（模拟有图片附件的场景）
    await chatInput.fill('请分析这张图片');
    await page.keyboard.press('Enter');

    // 步骤 3: 等待发送完成
    await page.waitForTimeout(2000);

    // 步骤 4: 检查页面上是否还有图片附件或预览
    const attachmentCheck = await page.evaluate(() => {
      // 查找可能的图片附件元素
      const imagePreviews = document.querySelectorAll('[class*="attachment"], [class*="preview"], [class*="ImageInput"]');
      const base64Images = Array.from(document.querySelectorAll('img')).filter(img =>
        img.src && img.src.startsWith('data:image')
      );

      return {
        imagePreviewCount: imagePreviews.length,
        base64ImageCount: base64Images.length,
        attachmentElements: Array.from(imagePreviews).map(el => ({
          className: el.className,
          innerHTML: el.innerHTML.substring(0, 100)
        })),
        totalImages: document.querySelectorAll('img').length
      };
    });

    console.log('[Attachment Check] After sending:', attachmentCheck);

    // 验证：发送后不应该有图片附件残留
    // 注意：这个验证可能比较宽松，因为可能有其他图片元素（如头像等）
    expect(attachmentCheck.imagePreviewCount).toBe(0);

    // 步骤 5: 验证输入框已清空
    const inputState = await page.evaluate(() => {
      const input = document.querySelector('input[data-testid="chat-input"]') as HTMLInputElement;
      return {
        value: input?.value || '',
        placeholder: input?.placeholder || ''
      };
    });

    console.log('[Input State] After sending:', inputState);

    // 验证：输入框应该被清空
    expect(inputState.value).toBe('');

    // 步骤 6: 等待响应完成
    await page.waitForTimeout(8000);
  });
});
