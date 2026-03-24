
/**
 * 消息流式渲染回归测试 (Mock 后端版)
 * 验证：当事件到达时，前端 Store 和 UI 必须实时更新内容和工具卡片
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

test.describe('Stream Rendering Regression (Mock)', () => {
  test('应该实时渲染流式文本和工具调用', async ({ page }) => {
    // 1. 初始化环境 (使用商业版模式，但 Mock AI)
    await setupE2ETestEnvironment(page, {
      skipWelcome: true,
      useRealAI: false 
    });

    // 2. 注入 API Key 绕过 UI 遮罩
    await page.evaluate(() => {
      const settingsStore = (window as any).__settingsStore;
      if (settingsStore) {
        settingsStore.getState().providers.forEach((p: any) => {
          settingsStore.getState().updateProviderConfig(p.id, { apiKey: 'mock-key', enabled: true });
        });
        (window as any).__layoutStore.getState().setChatOpen(true);
      }
    });

    const cid = 'test-repro-id-' + Date.now();

    // 3. 模拟前端发起请求，初始化监听器
    await page.evaluate(({ correlationId }) => {
      const chatStore = (window as any).__chatStore.getState();
      const controller = (window as any).__StreamingResponseController;
      
      // 创建初始消息
      chatStore.addMessage({
        id: correlationId,
        role: 'assistant',
        content: '',
        status: 'streaming'
      });

      // 启动流监听
      controller.startListening(correlationId, {
        correlationId,
        sessionId: 'mock-session',
        timestamp: Date.now()
      });
    }, { correlationId: cid });

    console.log('[Test] 开始模拟数据注入...');

    // 4. 模拟注入文本 Chunk
    await page.evaluate(({ correlationId }) => {
      const bridge = (window as any).__PIVO_BRIDGE__;
      bridge.push(correlationId, { type: 'content', content: 'Hello' });
      bridge.push(correlationId, { type: 'content', content: ' World' });
    }, { correlationId: cid });

    // 验证 Store 状态
    const storeContent = await page.evaluate(({ correlationId }) => {
      const msgs = (window as any).__chatStore.getState().messages;
      const msg = msgs.find((m: any) => m.id === correlationId);
      return msg?.content || 'EMPTY';
    }, { correlationId: cid });
    console.log('[Test] Store content:', storeContent);

    // 验证 UI 文本渲染 (尝试更通用的选择器)
    await expect(page.locator('[data-type="text"]').last()).toContainText('Hello World');
    console.log('[Test] ✅ 文本实时渲染正常');

    // 5. 模拟流式工具调用 (DeepSeek 风格)
    await page.evaluate(({ correlationId }) => {
      const bridge = (window as any).__PIVO_BRIDGE__;
      
      // Chunk 1: ID 和 名称
      bridge.push(correlationId, {
        type: 'tool_call',
        toolCall: { index: 0, id: 'call-123', type: 'function', function: { name: 'agent_write_file', arguments: '' } }
      });
      
      // Chunk 2: 部分参数
      bridge.push(correlationId, {
        type: 'tool_call',
        toolCall: { index: 0, id: null, function: { arguments: '{"rel_path":' } }
      });

      // Chunk 3: 完整参数
      bridge.push(correlationId, {
        type: 'tool_call',
        toolCall: { index: 0, id: null, function: { arguments: '"test.txt"}' } }
      });
    }, { correlationId: cid });

    // 验证工具卡片是否出现且显示了路径
    await expect(page.locator('text=test.txt')).toBeVisible();
    console.log('[Test] ✅ 工具调用实时渲染正常');

    // 6. 结束流
    await page.evaluate(({ correlationId }) => {
      (window as any).__PIVO_BRIDGE__.finalize(correlationId);
    }, { correlationId: cid });

    // 验证状态重置
    const isLoading = await page.evaluate(() => (window as any).__chatStore.getState().isLoading);
    expect(isLoading).toBe(false);
    console.log('[Test] ✅ 流结束状态重置正常');
  });
});
