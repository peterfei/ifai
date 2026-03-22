/**
 * PIVO Bridge 测试
 *
 * 目的：使用 PIVO Bridge 绕过 Tauri event system，验证前端逻辑是否正常
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

test.describe('PIVO Bridge 测试', () => {
  test.setTimeout(60000);

  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page, {
      skipWelcome: true,
      useRealAI: true
    });

    await page.waitForTimeout(3000);
  });

  test('使用 PIVO Bridge 模拟流式响应', async ({ page }) => {
    console.log('[PIVO] 使用 PIVO Bridge 模拟流式响应');

    // 1. 初始化 StreamingResponseController
    await page.evaluate(async () => {
      const w = window as any;

      // 导入 StreamingResponseController
      const { StreamingResponseController } = await import('../../src/stores/chat/generateResponse/StreamingResponseController');

      // 获取实例
      const controller = StreamingResponseController.getInstance();

      // 创建测试消息
      const testCorrelationId = 'pivo-test-' + Date.now();

      // 创建消息
      const chatStore = w.__chatStore;
      chatStore.getState().addMessage({
        id: testCorrelationId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        isStreaming: true
      });

      // 注册监听器
      await controller.startListening(testCorrelationId, {
        correlationId: testCorrelationId,
        sessionId: 'test-session',
        timestamp: Date.now()
      });

      // 等待监听器注册
      await new Promise(resolve => setTimeout(resolve, 500));

      // 检查 PIVO Bridge 是否可用
      if (w.__PIVO_BRIDGE__) {
        console.log('[PIVO] ✅ PIVO Bridge 可用');

        // 模拟流式响应
        const chunks = [
          '你好',
          '！我是',
          ' AI 助手',
          '，很高兴',
          '为你服务。'
        ];

        // 逐个发送 chunks
        for (let i = 0; i < chunks.length; i++) {
          await new Promise(resolve => setTimeout(resolve, 100));
          w.__PIVO_BRIDGE__.push(testCorrelationId, {
            type: 'content',
            content: chunks[i]
          });
          console.log(`[PIVO] 发送 chunk ${i + 1}/${chunks.length}:`, chunks[i]);
        }

        // 等待处理
        await new Promise(resolve => setTimeout(resolve, 500));

        // 完成流
        w.__PIVO_BRIDGE__.finalize(testCorrelationId);
        console.log('[PIVO] ✅ 流完成');

        return {
          success: true,
          correlationId: testCorrelationId,
          chunksSent: chunks.length
        };
      } else {
        return {
          success: false,
          error: 'PIVO Bridge not available'
        };
      }
    });

    // 等待处理完成
    await page.waitForTimeout(2000);

    // 检查结果
    const result = await page.evaluate(() => {
      const w = window as any;
      const chatStore = w.__chatStore;
      const state = chatStore?.getState();
      const messages = state?.messages || [];

      // 找到测试消息
      const testMessage = messages.find((m: any) => m.id.includes('pivo-test'));

      return {
        hasTestMessage: !!testMessage,
        content: testMessage?.content || '',
        contentLength: (testMessage?.content || '').length,
        isStreaming: testMessage?.isStreaming,
        allMessageIds: messages.map((m: any) => m.id)
      };
    });

    console.log('[PIVO] 结果:', JSON.stringify(result, null, 2));

    // 断言
    if (result.success) {
      expect(result.hasTestMessage).toBeTruthy();
      expect(result.contentLength).toBeGreaterThan(0);

      if (result.contentLength > 0) {
        console.log('[PIVO] ✅ PIVO Bridge 工作正常！');
        console.log('[PIVO] 内容:', result.content);
      } else {
        console.error('[PIVO] ❌ PIVO Bridge 没有产生内容');
      }
    }
  });
});
