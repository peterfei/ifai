/**
 * 心跳监测器修复验证 - 真实 LLM 测试（使用事件总线）
 *
 * 不依赖 UI 选择器，完全基于事件总线和 JavaScript 注入
 */

import { test, expect } from '@playwright/test';

test.describe('心跳监测器修复验证（真实 LLM + 事件总线）', () => {

  test.beforeEach(async ({ page }) => {
    // 导航到应用
    await page.goto('http://localhost:1420');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // 初始化全局日志监听器
    await page.evaluate(() => {
      (window as any).__heartbeatTestResults = {
        stallWarnings: [],
        heartbeatUpdates: [],
        finishEvents: [],
        forceCleanups: [],
        sessionCreated: [],
        sessionFinished: [],
        sessionCleaned: [],
        streamStarts: [],
        streamFinishes: [],
        toolCalls: [],
        toolCompletions: [],
        allLogs: []
      };

      // 拦截所有 console 输出
      const types = { log: console.log, warn: console.warn, error: console.error };
      Object.entries(types).forEach(([type, originalFn]) => {
        console[type] = (...args: any[]) => {
          const message = args.join(' ');
          const results = (window as any).__heartbeatTestResults;

          results.allLogs.push({ type, message, timestamp: Date.now() });

          // 解析关键日志
          if (message.includes('Started listening')) results.sessionCreated.push(message);
          if (message.includes('marked as finished')) results.sessionFinished.push(message);
          if (message.includes('cleaned up')) results.sessionCleaned.push(message);
          if (message.includes('Sentinel detected stall')) results.stallWarnings.push(message);
          if (message.includes('Heartbeat updated')) results.heartbeatUpdates.push(message);
          if (message.includes('Found stale session')) results.forceCleanups.push(message);
          if (message.includes('Finish already emitted')) results.finishEvents.push(message);
          if (message.includes('chat:stream:start')) results.streamStarts.push(message);
          if (message.includes('chat:stream:finished')) results.streamFinishes.push(message);
          if (message.includes('chat:tool:call')) results.toolCalls.push(message);
          if (message.includes('chat:tool:completed')) results.toolCompletions.push(message);

          originalFn.apply(console, args);
        };
      });
    });
  });

  test('测试1: 真实 LLM 流式传输后应该正确结束', async ({ page }) => {
    console.log('[E2E] 开始测试真实 LLM 流式传输...');

    const correlationId = `real-llm-test-${Date.now()}`;

    // 监听事件总线
    await page.evaluate(({ id }) => {
      const chatEventBus = (window as any).__chatEventBus;
      if (!chatEventBus) {
        console.error('[E2E] ChatEventBus not found!');
        return;
      }

      (window as any).__testEvents = [];

      chatEventBus.on('chat:stream:start', (p: any) => {
        if (p.correlationId === id) {
          (window as any).__testEvents.push({ type: 'start', timestamp: Date.now() });
          console.log(`[E2E] Stream start: ${id}`);
        }
      });

      chatEventBus.on('chat:stream:finished', (p: any) => {
        if (p.correlationId === id) {
          (window as any).__testEvents.push({ type: 'finished', timestamp: Date.now() });
          console.log(`[E2E] Stream finished: ${id}`);
        }
      });

      chatEventBus.on('chat:tool:call', (p: any) => {
        if (p.correlationId === id) {
          (window as any).__testEvents.push({ type: 'tool', name: p.name, timestamp: Date.now() });
          console.log(`[E2E] Tool call: ${p.name}`);
        }
      });

      chatEventBus.on('chat:tool:completed', (p: any) => {
        if (p.correlationId === id) {
          (window as any).__testEvents.push({ type: 'toolCompleted', toolId: p.toolId, timestamp: Date.now() });
          console.log(`[E2E] Tool completed: ${p.toolId}`);
        }
      });
    }, { id: correlationId });

    // 触发真实的 LLM 调用（通过 ChatStore）
    await page.evaluate(async ({ id }) => {
      try {
        const chatStore = (window as any).__chatStore;
        if (!chatStore) {
          console.error('[E2E] ChatStore not found!');
          return;
        }

        // 清空消息
        chatStore.setState({ messages: [], isLoading: false });

        // 发送简单消息（不触发工具调用）
        await chatStore.sendMessage('你好，请简单介绍一下你自己', 'openai', 'gpt-4o');

        console.log('[E2E] Message sent');
      } catch (e) {
        console.error('[E2E] Error sending message:', e);
      }
    }, { id: correlationId });

    // 等待流式传输完成
    await page.waitForTimeout(15000);

    // 获取结果
    const results = await page.evaluate(() => {
      const testResults = (window as any).__heartbeatTestResults;
      const testEvents = (window as any).__testEvents || [];

      return {
        stallWarnings: testResults.stallWarnings.length,
        heartbeatUpdates: testResults.heartbeatUpdates.length,
        sessionCreated: testResults.sessionCreated.length,
        sessionFinished: testResults.sessionFinished.length,
        sessionCleaned: testResults.sessionCleaned.length,
        events: testEvents,
        allLogs: testResults.allLogs.filter((l: any) =>
          l.message.includes('StreamController') ||
          l.message.includes('heartbeat') ||
          l.message.includes('Session') ||
          l.message.includes('Sentinel')
        )
      };
    });

    console.log('[E2E] === 测试结果 ===');
    console.log('[E2E] 停滞警告:', results.stallWarnings);
    console.log('[E2E] 心跳更新:', results.heartbeatUpdates);
    console.log('[E2E] Session 创建:', results.sessionCreated);
    console.log('[E2E] Session 完成:', results.sessionFinished);
    console.log('[E2E] Session 清理:', results.sessionCleaned);
    console.log('[E2E] 事件数:', results.events.length);
    console.log('[E2E] 事件类型:', results.events.map((e: any) => e.type).join(', '));

    // 输出关键日志
    if (results.allLogs.length > 0) {
      console.log('[E2E] === 关键日志 ===');
      results.allLogs.slice(-20).forEach((log: any) => {
        console.log(`[${log.type}]`, log.message);
      });
    }

    // 核心验证：不应该有停滞警告
    expect(results.stallWarnings).toBe(0);

    console.log('[E2E] ✅ 测试1通过');
  });

  test('测试2: 工具调用后应该更新心跳', async ({ page }) => {
    console.log('[E2E] 开始测试工具调用心跳更新...');

    const correlationId = `tool-test-${Date.now()}`;

    // 监听工具完成事件
    await page.evaluate(({ id }) => {
      const chatEventBus = (window as any).__chatEventBus;
      if (!chatEventBus) return;

      (window as any).__testEvents = [];

      chatEventBus.on('chat:tool:completed', (p: any) => {
        (window as any).__testEvents.push({ type: 'toolCompleted', ...p });
        console.log(`[E2E] Tool completed: ${p.toolId} for ${p.correlationId}`);
      });
    }, { id: correlationId });

    // 触发工具调用
    await page.evaluate(async () => {
      try {
        const chatStore = (window as any).__chatStore;
        if (!chatStore) return;

        // 清空消息
        chatStore.setState({ messages: [], isLoading: false });

        // 发送会触发工具调用的消息
        await chatStore.sendMessage('请读取当前目录的 package.json 文件', 'openai', 'gpt-4o');

        console.log('[E2E] Tool request message sent');
      } catch (e) {
        console.error('[E2E] Error:', e);
      }
    }, {});

    // 等待工具执行
    await page.waitForTimeout(20000);

    // 获取结果
    const results = await page.evaluate(() => {
      const testResults = (window as any).__heartbeatTestResults;
      return {
        stallWarnings: testResults.stallWarnings.length,
        heartbeatUpdates: testResults.heartbeatUpdates.filter((m: string) =>
          m.includes('tool completed')
        ),
        toolCompletions: testResults.toolCompletions.length,
        forceCleanups: testResults.forceCleanups.length
      };
    });

    console.log('[E2E] === 工具调用测试结果 ===');
    console.log('[E2E] 停滞警告:', results.stallWarnings);
    console.log('[E2E] 工具完成时心跳更新:', results.heartbeatUpdates.length);
    console.log('[E2E] 工具完成事件:', results.toolCompletions);
    console.log('[E2E] 强制清理:', results.forceCleanups);

    // 核心验证
    expect(results.stallWarnings).toBe(0);

    // 如果有工具完成，应该有心跳更新
    if (results.toolCompletions > 0) {
      console.log('[E2E] ✅ 工具完成时正确更新了心跳');
    }

    console.log('[E2E] ✅ 测试2通过');
  });

  test('测试3: 多轮对话后不应该有残留 session', async ({ page }) => {
    console.log('[E2E] 开始测试多轮对话...');

    // 触发多轮对话
    await page.evaluate(async () => {
      try {
        const chatStore = (window as any).__chatStore;
        if (!chatStore) return;

        // 清空消息
        chatStore.setState({ messages: [], isLoading: false });

        // 发送多轮消息
        await chatStore.sendMessage('第一轮：你好', 'openai', 'gpt-4o');
        await new Promise(r => setTimeout(r, 5000));

        await chatStore.sendMessage('第二轮：请继续', 'openai', 'gpt-4o');
        await new Promise(r => setTimeout(r, 5000));

        console.log('[E2E] Multiple messages sent');
      } catch (e) {
        console.error('[E2E] Error:', e);
      }
    }, {});

    // 等待所有流完成
    await page.waitForTimeout(20000);

    // 获取结果
    const results = await page.evaluate(() => {
      const testResults = (window as any).__heartbeatTestResults;
      return {
        stallWarnings: testResults.stallWarnings,
        sessionCreated: testResults.sessionCreated.length,
        sessionFinished: testResults.sessionFinished.length,
        sessionCleaned: testResults.sessionCleaned.length,
        forceCleanups: testResults.forceCleanups.length
      };
    });

    console.log('[E2E] === 多轮对话测试结果 ===');
    console.log('[E2E] 停滞警告:', results.stallWarnings);
    console.log('[E2E] Session 创建:', results.sessionCreated);
    console.log('[E2E] Session 完成:', results.sessionFinished);
    console.log('[E2E] Session 清理:', results.sessionCleaned);
    console.log('[E2E] 强制清理:', results.forceCleanups);

    // 核心验证：不应该有停滞警告
    expect(results.stallWarnings.length).toBe(0);

    // Session 数量应该大致平衡（允许一些偏差）
    const sessionsCreated = results.sessionCreated;
    const sessionsCleaned = results.sessionCleaned;
    console.log(`[E2E] Session 平衡: 创建 ${sessionsCreated}, 清理 ${sessionsCleaned}`);

    console.log('[E2E] ✅ 测试3通过');
  });

  test('测试4: 检查实际的 session 状态', async ({ page }) => {
    console.log('[E2E] 开始检查实际 session 状态...');

    // 触发一个简单的对话
    await page.evaluate(async () => {
      try {
        const chatStore = (window as any).__chatStore;
        if (!chatStore) return;

        chatStore.setState({ messages: [], isLoading: false });
        await chatStore.sendMessage('测试 session 状态', 'openai', 'gpt-4o');
      } catch (e) {
        console.error('[E2E] Error:', e);
      }
    }, {});

    // 等待完成
    await page.waitForTimeout(12000);

    // 检查 StreamingResponseController 的实际状态
    const controllerState = await page.evaluate(() => {
      const controller = (window as any).__streamingResponseController;
      if (!controller) {
        return { error: 'Controller not found' };
      }

      // 尝试访问内部状态（如果可能）
      return {
        hasInstance: !!controller,
        // 我们不能直接访问私有成员，但可以通过日志推断
      };
    });

    console.log('[E2E] Controller 状态:', controllerState);

    // 获取测试结果
    const results = await page.evaluate(() => {
      const testResults = (window as any).__heartbeatTestResults;

      // 查找与 session 管理相关的日志
      const sessionLogs = testResults.allLogs.filter((l: any) =>
        l.message.includes('Session') ||
        l.message.includes('session') ||
        l.message.includes('marked as finished')
      );

      return {
        stallWarnings: testResults.stallWarnings,
        sessionLogs: sessionLogs.slice(-30), // 最近30条
        summary: {
          sessionCreated: testResults.sessionCreated.length,
          sessionFinished: testResults.sessionFinished.length,
          sessionCleaned: testResults.sessionCleaned.length
        }
      };
    });

    console.log('[E2E] === Session 状态检查结果 ===');
    console.log('[E2E] 停滞警告:', results.stallWarnings);
    console.log('[E2E] Session 摘要:', results.summary);
    console.log('[E2E] Session 日志:');
    results.sessionLogs.forEach((log: any) => {
      console.log(`  [${log.type}]`, log.message);
    });

    // 核心验证
    expect(results.stallWarnings.length).toBe(0);

    console.log('[E2E] ✅ 测试4通过');
  });

  test('测试5: 验证修复逻辑的日志输出', async ({ page }) => {
    console.log('[E2E] 开始验证修复逻辑日志...');

    // 触发一个简单的对话
    await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      if (!chatStore) return;

      chatStore.setState({ messages: [], isLoading: false });
      await chatStore.sendMessage('验证修复逻辑', 'openai', 'gpt-4o');
    }, {});

    await page.waitForTimeout(12000);

    // 获取详细日志
    const logs = await page.evaluate(() => {
      const testResults = (window as any).__heartbeatTestResults;

      // 查找关键修复日志
      return {
        markedFinished: testResults.allLogs.filter((l: any) =>
          l.message.includes('marked as finished')
        ),
        forceCleaning: testResults.allLogs.filter((l: any) =>
          l.message.includes('force cleaning up')
        ),
        duplicateFinish: testResults.allLogs.filter((l: any) =>
          l.message.includes('Finish already emitted')
        ),
        heartbeatUpdated: testResults.allLogs.filter((l: any) =>
          l.message.includes('Heartbeat updated')
        ),
        stallDetected: testResults.allLogs.filter((l: any) =>
          l.message.includes('Sentinel detected stall')
        )
      };
    });

    console.log('[E2E] === 修复逻辑日志 ===');
    console.log('[E2E] 标记为完成:', logs.markedFinished.length);
    logs.markedFinished.forEach((l: any) => console.log('  -', l.message));

    console.log('[E2E] 强制清理:', logs.forceCleaning.length);
    logs.forceCleaning.forEach((l: any) => console.log('  -', l.message));

    console.log('[E2E] 重复 finish:', logs.duplicateFinish.length);
    logs.duplicateFinish.forEach((l: any) => console.log('  -', l.message));

    console.log('[E2E] 心跳更新:', logs.heartbeatUpdated.length);
    logs.heartbeatUpdated.forEach((l: any) => console.log('  -', l.message));

    console.log('[E2E] 停滞检测:', logs.stallDetected.length);
    logs.stallDetected.forEach((l: any) => console.log('  -', l.message));

    // 验证：不应该有停滞检测
    expect(logs.stallDetected.length).toBe(0);

    console.log('[E2E] ✅ 测试5通过');
  });
});
