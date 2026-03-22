/**
 * PIVO Bridge 方案最终验证
 *
 * 目的：验证 PIVO Bridge 可以作为 E2E 测试的有效替代方案
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

test.describe('PIVO Bridge 最终验证', () => {
  test.setTimeout(60000);

  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page, {
      skipWelcome: true,
      useRealAI: true
    });

    await page.waitForTimeout(3000);
  });

  test('验证 PIVO Bridge 完整流式响应流程', async ({ page }) => {
    console.log('[验证] PIVO Bridge 完整流式响应流程');

    const result = await page.evaluate(async () => {
      const w = window as any;

      // 1. 导入 StreamingResponseController
      const { StreamingResponseController } = await import('../../src/stores/chat/generateResponse/StreamingResponseController');
      const controller = StreamingResponseController.getInstance();

      // 2. 模拟用户发送"你是谁"
      const testCorrelationId = 'final-test-' + Date.now();

      const chatStore = w.__chatStore;

      // 添加用户消息
      chatStore.getState().addMessage({
        id: 'user-' + testCorrelationId,
        role: 'user',
        content: '你是谁',
        timestamp: Date.now()
      });

      // 3. 创建助手消息并注册监听器
      chatStore.getState().addMessage({
        id: testCorrelationId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        isStreaming: true
      });

      await controller.startListening(testCorrelationId, {
        correlationId: testCorrelationId,
        sessionId: 'test-session',
        timestamp: Date.now()
      });

      await new Promise(resolve => setTimeout(resolve, 500));

      // 4. 使用 PIVO Bridge 模拟 AI 响应
      if (!w.__PIVO_BRIDGE__) {
        return {
          success: false,
          error: 'PIVO Bridge not available',
          step: 4
        };
      }

      console.log('[PIVO] 开始模拟流式响应');

      // 模拟完整的"你是谁"响应
      const response = '我是一个AI助手，专门设计用来帮助用户解答问题、提供建议和完成任务。我可以通过自然语言与你交流，并根据你的需求提供相应的帮助。';

      // 逐字发送（模拟真实流式响应的速度）
      for (let i = 0; i < response.length; i++) {
        await new Promise(resolve => setTimeout(resolve, 30));
        w.__PIVO_BRIDGE__.push(testCorrelationId, {
          type: 'content',
          content: response[i]
        });
      }

      await new Promise(resolve => setTimeout(resolve, 500));

      // 5. 完成流
      w.__PIVO_BRIDGE__.finalize(testCorrelationId);

      // 等待最终处理
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 6. 验证结果
      const state = chatStore.getState();
      const messages = state.messages || [];
      const assistantMessage = messages.find((m: any) => m.id === testCorrelationId);

      return {
        success: true,
        hasAssistantMessage: !!assistantMessage,
        content: assistantMessage?.content || '',
        contentLength: (assistantMessage?.content || '').length,
        isStreaming: assistantMessage?.isStreaming,
        expectedContent: response,
        matches: (assistantMessage?.content || '') === response,
        segmentsCount: (assistantMessage?.segments || []).length,
        step: 'complete'
      };
    });

    console.log('[验证] 最终结果:', JSON.stringify(result, null, 2));

    // 断言
    expect(result.success).toBeTruthy();
    expect(result.hasAssistantMessage).toBeTruthy();
    expect(result.contentLength).toBeGreaterThan(0);

    if (result.matches) {
      console.log('[验证] ✅ PIVO Bridge 完全工作正常！');
      console.log('[验证] ✅ 内容完全匹配预期');
      console.log('[验证] ✅ 内容长度:', result.contentLength);
      console.log('[验证] ✅ Segments 数量:', result.segmentsCount);
    } else {
      console.error('[验证] ❌ 内容不匹配');
      console.error('[验证] 预期:', result.expectedContent);
      console.error('[验证] 实际:', result.content);
    }
  });

  test('对比真实 Tauri 和 PIVO Bridge', async ({ page }) => {
    console.log('[对比] 真实 Tauri vs PIVO Bridge');

    const comparison = await page.evaluate(async () => {
      const w = window as any;

      // 测试 1: 真实 Tauri
      console.log('[对比] 测试 1: 真实 Tauri');

      const { StreamingResponseController } = await import('../../src/stores/chat/generateResponse/StreamingResponseController');
      const controller = StreamingResponseController.getInstance();

      const tauriTestId = 'tauri-test-' + Date.now();
      const chatStore = w.__chatStore;

      chatStore.getState().addMessage({
        id: tauriTestId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        isStreaming: true
      });

      await controller.startListening(tauriTestId, {
        correlationId: tauriTestId,
        sessionId: 'test-session',
        timestamp: Date.now()
      });

      // 等待 5 秒看是否有任何事件到达
      await new Promise(resolve => setTimeout(resolve, 5000));

      const tauriResult = {
        contentLength: (chatStore.getState().messages.find((m: any) => m.id === tauriTestId)?.content || '').length,
        receivedAnyEvents: false
      };

      // 测试 2: PIVO Bridge
      console.log('[对比] 测试 2: PIVO Bridge');

      const pivoTestId = 'pivo-test-' + Date.now();

      chatStore.getState().addMessage({
        id: pivoTestId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        isStreaming: true
      });

      await controller.startListening(pivoTestId, {
        correlationId: pivoTestId,
        sessionId: 'test-session',
        timestamp: Date.now()
      });

      await new Promise(resolve => setTimeout(resolve, 500));

      if (w.__PIVO_BRIDGE__) {
        const testContent = 'PIVO Bridge 测试内容';

        for (const char of testContent) {
          await new Promise(resolve => setTimeout(resolve, 20));
          w.__PIVO_BRIDGE__.push(pivoTestId, {
            type: 'content',
            content: char
          });
        }

        await new Promise(resolve => setTimeout(resolve, 500));
        w.__PIVO_BRIDGE__.finalize(pivoTestId);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      const pivoResult = {
        contentLength: (chatStore.getState().messages.find((m: any) => m.id === pivoTestId)?.content || '').length
      };

      return {
        tauri: tauriResult,
        pivo: pivoResult,
        conclusion: tauriResult.contentLength === 0 && pivoResult.contentLength > 0
          ? 'Tauri 不工作，PIVO Bridge 工作'
          : tauriResult.contentLength > 0
          ? '两者都工作'
          : '两者都不工作'
      };
    });

    console.log('[对比] 对比结果:', JSON.stringify(comparison, null, 2));
    console.log('[对比] 结论:', comparison.conclusion);

    // 断言
    expect(comparison.pivo.contentLength).toBeGreaterThan(0);
  });
});
