import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment, removeJoyrideOverlay } from '../setup';

/**
 * 🏆 PIVO 3.0: 物理保真度复现测试 - 工具调用渲染与状态同步
 * 
 * 目标：
 * 1. 验证长文本后的工具调用段落 (Segment) 是否能正常显示。
 * 2. 验证流结束瞬间到达的工具调用不会被状态覆盖。
 * 3. 验证空气泡自动清理机制。
 */

test.describe('Reproduction: Tool Rendering Fidelity', () => {
  
  test.beforeEach(async ({ page }) => {
    // 🏆 物理穿透：捕捉浏览器内部日志
    page.on('console', msg => {
      if (msg.text().includes('[FIDELITY') || msg.text().includes('[EventBus')) {
        console.log(`[Browser] ${msg.text()}`);
      }
    });
  });

  test('should render tool card correctly after long text chunks', async ({ page }) => {
    // 1. 初始化环境
    await setupE2ETestEnvironment(page, { skipWelcome: true });
    await page.goto('/');
    
    // 等待系统加载
    await page.waitForFunction(() => (window as any).__chatStore !== undefined, { timeout: 15000 });

    // 2. 模拟发送用户消息以建立上下文
    await page.evaluate(() => {
      (window as any).__E2E_SEND__('重写 README.md 120行左右');
    });
// 等待系统生成助手消息 ID
await page.waitForFunction(() => (window as any).__LAST_ASSISTANT_MSG_ID__ !== undefined, { timeout: 10000 });
const assistantMsgId = await page.evaluate(() => (window as any).__LAST_ASSISTANT_MSG_ID__);
console.log(`[E2E] Found dynamic AssistantMsgId: ${assistantMsgId}`);

// 🔥 物理缓冲：确保监听器已挂载
await page.waitForTimeout(500);

// 3. 模拟流式响应：先发一段长文本
await page.evaluate(() => {
  window.dispatchEvent(new CustomEvent('ifainew-fidelity-proxy', { 
    detail: { 
      id: 'LATEST', 
      type: 'chunk', 
      payload: { type: 'content', content: '好的，我已经读取了当前的 README.md 文件内容。' } 
    } 
  }));
});

await page.waitForTimeout(500);

// 4. 🏆 核心：模拟工具调用 Chunk
await page.evaluate(() => {
  window.dispatchEvent(new CustomEvent('ifainew-fidelity-proxy', { 
    detail: { 
      id: 'LATEST', 
      type: 'chunk', 
      payload: {
        type: 'tool_call',
        toolCall: {
          index: 0,
          id: 'call_test_write_123',
          type: 'function',
          function: { name: 'agent_write_file', arguments: '{"rel_path":"README.md","content":"# New README"}' }
        }
      }
    } 
  }));
});

// 5. 模拟流结束
await page.evaluate(() => {
  window.dispatchEvent(new CustomEvent('ifainew-fidelity-proxy', { 
    detail: { id: 'LATEST', type: 'finish' } 
  }));
});    // 6. 验证 UI 渲染
    await removeJoyrideOverlay(page);
    
    // 检查工具卡片是否可见
    const toolCard = page.getByTestId('approve-button').first();
    await expect(toolCard).toBeVisible({ timeout: 10000 });
    
    console.log('[E2E] ✅ Tool card rendered correctly after text chunks');
  });

  test('should clean up empty ghost bubbles after tool execution', async ({ page }) => {
    await setupE2ETestEnvironment(page, { skipWelcome: true });
    await page.goto('/');
    
    const ghostMsgId = 'ghost-assistant-id';

    // 1. 手动注入一条空消息
    await page.evaluate((id) => {
      const chatStore = (window as any).__chatStore;
      chatStore.getState().addMessage({
        id,
        role: 'assistant',
        content: '',
        toolCalls: []
      });
    }, ghostMsgId);

    // 2. 模拟流结束（针对特定 ID）
    await page.evaluate((id) => {
      console.log(`[E2E-Proxy] Dispatching finish for specific ID: ${id}`);
      window.dispatchEvent(new CustomEvent('ifainew-fidelity-proxy', { 
        detail: { id, type: 'finish' } 
      }));
    }, ghostMsgId);

    // 3. 验证气泡被清理
    await page.waitForTimeout(1000);
    const messageExists = await page.evaluate((id) => {
      const msgs = (window as any).__chatStore.getState().messages;
      return msgs.some((m: any) => m.id === id);
    }, ghostMsgId);

    expect(messageExists).toBe(false);
    console.log('[E2E] ✅ Empty ghost bubble cleaned up automatically');
  });

});
