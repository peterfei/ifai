/**
 * 对比测试：正常工作的查询 vs 失败的查询
 *
 * 目的：找出为什么"当前项目下js文件"正常工作，但"你是谁"只显示"用户用户"
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

test.describe('对比测试：工作 vs 失败的查询', () => {
  test.setTimeout(180000); // 3分钟超时

  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page, {
      skipWelcome: true,
      useRealAI: true
    });

    await page.waitForTimeout(3000);

    // 配置 AI Provider 和项目路径
    await page.evaluate(() => {
      const settingsStore = (window as any).__settingsStore;
      if (settingsStore) {
        const fileConfig = (window as any).__E2E_REAL_AI_CONFIG__;
        if (fileConfig && fileConfig.realAIApiKey) {
          settingsStore.getState().updateProviderConfig('zhipu', {
            apiKey: fileConfig.realAIApiKey,
            baseUrl: fileConfig.realAIBaseUrl || 'https://open.bigmodel.cn/api/paas/v4'
          });
        }
        settingsStore.getState().setCurrentProviderAndModel('zhipu', 'glm-4');
      }

      // 设置项目路径
      const fileStore = (window as any).__fileStore;
      if (fileStore) {
        fileStore.getState().setRootPath('/Users/mac/project/demo/demo3');
        console.log('[TEST] ✅ Set project root to: /Users/mac/project/demo/demo3');
      }
    });
  });

  /**
   * 测试1: "当前项目下js文件" - 应该正常工作
   */
  test('工作查询：当前项目下js文件', async ({ page }) => {
    console.log('[对比测试] 测试1: 当前项目下js文件（预期正常工作）');

    // 设置事件追踪
    await page.evaluate(() => {
      const w = window as any;
      w.__STREAM_EVENT_TRACE__ = [];
      w.__BACKEND_INVOKE_PARAMS__ = null;

      const chatEventBus = w.__chatEventBus;
      if (!chatEventBus) {
        console.error('[TEST] chatEventBus not found!');
        return;
      }

      // 追踪所有事件
      const allEvents = [
        'chat:stream:start',
        'chat:stream:chunk',
        'chat:stream:finished',
        'chat:segment:created',
        'chat:tool:pending',
        'chat:tool:approved',
        'chat:tool:completed',
        'chat:message:completed'
      ];

      allEvents.forEach(eventName => {
        chatEventBus.on(eventName, (payload: any) => {
          w.__STREAM_EVENT_TRACE__.push({
            event: eventName,
            timestamp: Date.now(),
            correlationId: payload.correlationId,
            delta: payload.delta ? payload.delta.substring(0, 30) : null,
            deltaLength: payload.delta ? payload.delta.length : 0,
            toolId: payload.toolId || null
          });
        });
      });
    });

    // 拦截 invoke 调用
    await page.evaluate(() => {
      const w = window as any;
      const originalInvoke = w.__TAURI__?.core?.invoke;

      if (originalInvoke) {
        w.__TAURI__.core.invoke = async function(cmd: string, args: any) {
          if (cmd === 'ai_chat') {
            w.__BACKEND_INVOKE_PARAMS__ = {
              cmd,
              eventId: args?.eventId,
              messagesCount: args?.messages?.length,
              enableTools: args?.enableTools,
              projectRoot: args?.projectRoot
            };
            console.log('[TEST INTERCEPT] ai_chat invoked with:', w.__BACKEND_INVOKE_PARAMS__);
          }
          return originalInvoke.call(this, cmd, args);
        };
      }
    });

    // 发送"当前项目下js文件"查询
    console.log('[对比测试] 发送查询: 当前项目下js文件');
    await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      const settingsStore = (window as any).__settingsStore;
      chatStore.getState().sendMessage(
        '当前项目下js文件',
        settingsStore.getState().currentProviderId,
        settingsStore.getState().currentModel
      );
    });

    // 监控 60 秒
    for (let i = 0; i < 60; i++) {
      await page.waitForTimeout(1000);

      const check = await page.evaluate((elapsed: number) => {
        const w = window as any;
        const trace = w.__STREAM_EVENT_TRACE__ || [];
        const chatStore = w.__chatStore;
        const state = chatStore?.getState();
        const messages = state?.messages || [];
        const lastMessage = messages[messages.length - 1];

        const traceSummary = trace.reduce((acc: any, t: any) => {
          acc[t.event] = (acc[t.event] || 0) + 1;
          return acc;
        }, {});

        return {
          elapsedSeconds: elapsed,
          totalEvents: trace.length,
          contentLength: (lastMessage?.content || '').length,
          content: (lastMessage?.content || '').substring(0, 100),
          isStreaming: lastMessage?.isStreaming,
          toolCallsCount: (lastMessage?.toolCalls || []).length,
          traceSummary: traceSummary,
          invokeParams: w.__BACKEND_INVOKE_PARAMS__
        };
      }, i + 1);

      if (i % 5 === 0 || check.contentLength > 0) {
        console.log(`[对比测试] T+${check.elapsedSeconds}s:`, {
          totalEvents: check.totalEvents,
          contentLength: check.contentLength,
          content: check.content,
          isStreaming: check.isStreaming,
          toolCallsCount: check.toolCallsCount,
          traceSummary: check.traceSummary,
          invokeParams: check.invokeParams
        });
      }

      // 如果有足够内容且流完成，提前结束
      if (check.contentLength > 50 && !check.isStreaming) {
        console.log('[对比测试] ✅ 测试1完成：收到完整内容');
        break;
      }
    }

    // 保存结果1
    const result1 = await page.evaluate(() => {
      const w = window as any;
      const chatStore = w.__chatStore;
      const state = chatStore?.getState();
      const messages = state?.messages || [];
      const lastMessage = messages[messages.length - 1];

      return {
        content: lastMessage?.content || '',
        contentLength: (lastMessage?.content || '').length,
        segmentsCount: (lastMessage?.segments || []).length,
        toolCallsCount: (lastMessage?.toolCalls || []).length,
        traceSummary: (w.__STREAM_EVENT_TRACE__ || []).reduce((acc: any, t: any) => {
          acc[t.event] = (acc[t.event] || 0) + 1;
          return acc;
        }, {}),
        invokeParams: w.__BACKEND_INVOKE_PARAMS__
      };
    });

    console.log('[对比测试] 测试1结果:');
    console.log('  - 内容长度:', result1.contentLength);
    console.log('  - 内容预览:', result1.content.substring(0, 150));
    console.log('  - Segments:', result1.segmentsCount);
    console.log('  - Tool Calls:', result1.toolCallsCount);
    console.log('  - Event Summary:', result1.traceSummary);
    console.log('  - Invoke Params:', result1.invokeParams);

    // 将结果存储到 window 供后续比较
    await page.evaluate((r1) => {
      (window as any).__TEST1_RESULT__ = r1;
    }, result1);
  });

  /**
   * 测试2: "你是谁" - 预期失败（只显示"用户用户"）
   */
  test('失败查询：你是谁', async ({ page }) => {
    console.log('[对比测试] 测试2: 你是谁（预期失败）');

    // 设置事件追踪
    await page.evaluate(() => {
      const w = window as any;
      w.__STREAM_EVENT_TRACE__ = [];
      w.__BACKEND_INVOKE_PARAMS__ = null;

      const chatEventBus = w.__chatEventBus;
      if (!chatEventBus) {
        console.error('[TEST] chatEventBus not found!');
        return;
      }

      // 追踪所有事件
      const allEvents = [
        'chat:stream:start',
        'chat:stream:chunk',
        'chat:stream:finished',
        'chat:segment:created',
        'chat:tool:pending',
        'chat:tool:approved',
        'chat:tool:completed',
        'chat:message:completed'
      ];

      allEvents.forEach(eventName => {
        chatEventBus.on(eventName, (payload: any) => {
          w.__STREAM_EVENT_TRACE__.push({
            event: eventName,
            timestamp: Date.now(),
            correlationId: payload.correlationId,
            delta: payload.delta ? payload.delta.substring(0, 30) : null,
            deltaLength: payload.delta ? payload.delta.length : 0,
            toolId: payload.toolId || null
          });
        });
      });
    });

    // 拦截 invoke 调用
    await page.evaluate(() => {
      const w = window as any;
      const originalInvoke = w.__TAURI__?.core?.invoke;

      if (originalInvoke) {
        w.__TAURI__.core.invoke = async function(cmd: string, args: any) {
          if (cmd === 'ai_chat') {
            w.__BACKEND_INVOKE_PARAMS__ = {
              cmd,
              eventId: args?.eventId,
              messagesCount: args?.messages?.length,
              enableTools: args?.enableTools,
              projectRoot: args?.projectRoot
            };
            console.log('[TEST INTERCEPT] ai_chat invoked with:', w.__BACKEND_INVOKE_PARAMS__);
          }
          return originalInvoke.call(this, cmd, args);
        };
      }
    });

    // 发送"你是谁"查询
    console.log('[对比测试] 发送查询: 你是谁');
    await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      const settingsStore = (window as any).__settingsStore;
      chatStore.getState().sendMessage(
        '你是谁',
        settingsStore.getState().currentProviderId,
        settingsStore.getState().currentModel
      );
    });

    // 监控 60 秒
    for (let i = 0; i < 60; i++) {
      await page.waitForTimeout(1000);

      const check = await page.evaluate((elapsed: number) => {
        const w = window as any;
        const trace = w.__STREAM_EVENT_TRACE__ || [];
        const chatStore = w.__chatStore;
        const state = chatStore?.getState();
        const messages = state?.messages || [];
        const lastMessage = messages[messages.length - 1];

        const traceSummary = trace.reduce((acc: any, t: any) => {
          acc[t.event] = (acc[t.event] || 0) + 1;
          return acc;
        }, {});

        return {
          elapsedSeconds: elapsed,
          totalEvents: trace.length,
          contentLength: (lastMessage?.content || '').length,
          content: (lastMessage?.content || '').substring(0, 100),
          isStreaming: lastMessage?.isStreaming,
          toolCallsCount: (lastMessage?.toolCalls || []).length,
          traceSummary: traceSummary,
          invokeParams: w.__BACKEND_INVOKE_PARAMS__
        };
      }, i + 1);

      if (i % 5 === 0 || check.contentLength > 0) {
        console.log(`[对比测试] T+${check.elapsedSeconds}s:`, {
          totalEvents: check.totalEvents,
          contentLength: check.contentLength,
          content: check.content,
          isStreaming: check.isStreaming,
          toolCallsCount: check.toolCallsCount,
          traceSummary: check.traceSummary,
          invokeParams: check.invokeParams
        });
      }

      // 如果有足够内容且流完成，提前结束
      if (check.contentLength > 50 && !check.isStreaming) {
        console.log('[对比测试] ✅ 测试2完成：收到完整内容');
        break;
      }
    }

    // 保存结果2
    const result2 = await page.evaluate(() => {
      const w = window as any;
      const chatStore = w.__chatStore;
      const state = chatStore?.getState();
      const messages = state?.messages || [];
      const lastMessage = messages[messages.length - 1];

      return {
        content: lastMessage?.content || '',
        contentLength: (lastMessage?.content || '').length,
        segmentsCount: (lastMessage?.segments || []).length,
        toolCallsCount: (lastMessage?.toolCalls || []).length,
        traceSummary: (w.__STREAM_EVENT_TRACE__ || []).reduce((acc: any, t: any) => {
          acc[t.event] = (acc[t.event] || 0) + 1;
          return acc;
        }, {}),
        invokeParams: w.__BACKEND_INVOKE_PARAMS__
      };
    });

    console.log('[对比测试] 测试2结果:');
    console.log('  - 内容长度:', result2.contentLength);
    console.log('  - 内容预览:', result2.content.substring(0, 150));
    console.log('  - Segments:', result2.segmentsCount);
    console.log('  - Tool Calls:', result2.toolCallsCount);
    console.log('  - Event Summary:', result2.traceSummary);
    console.log('  - Invoke Params:', result2.invokeParams);
  });
});
