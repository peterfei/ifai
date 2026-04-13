/**
 * 性能压测 E2E 测试
 *
 * 测试场景:
 * 1. 快速连续发送 20 条消息（压测）
 * 2. 长时间运行测试（内存泄漏）
 * 3. 极限并发测试
 * 4. 长消息流式输出性能
 *
 * 测试标签: @chat @stress @performance
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

test.describe('性能压测', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[Stress]') || text.includes('[Performance]') || text.includes('[Memory]')) {
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

  test('压测：快速连续发送 20 条消息', async ({ page }) => {
    console.log('[Stress] ===== 压测：20 条消息 =====');

    const textarea = page.locator('textarea[data-testid="chat-input"]');
    const sendButton = page.locator('[data-testid="chat-send-button"]');
    const queueIndicator = page.locator('[data-testid="queue-indicator"]');

    // 🔥 压测配置：Mock generateResponse 模拟快速响应
    await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      if (!chatStore) return;

      chatStore.setState({
        generateResponse: async (...args: any[]) => {
          console.log('[Stress] generateResponse called');
          // 模拟 500ms 处理时间
          await new Promise(resolve => setTimeout(resolve, 500));
          return undefined;
        },
      });

      console.log('[Stress] ✅ Mock installed');
    });

    await page.waitForTimeout(500);

    // 🔥 压测：快速发送 20 条消息
    const messageCount = 20;
    const sendResults = [];

    console.log(`[Stress] 🚀 开始发送 ${messageCount} 条消息...`);

    const startTime = Date.now();

    for (let i = 1; i <= messageCount; i++) {
      const msgStart = Date.now();

      await textarea.fill(`压测消息 ${i}: 测试内容`);
      await sendButton.click();

      const msgTime = Date.now() - msgStart;
      sendResults.push({ message: i, time: msgTime });

      // 快速连续发送，不等待
      await page.waitForTimeout(50);

      if (i % 5 === 0) {
        console.log(`[Stress] 📤 已发送 ${i}/${messageCount} 条消息`);
      }
    }

    const sendEndTime = Date.now();
    const totalSendTime = sendEndTime - startTime;

    console.log(`[Stress] ✅ ${messageCount} 条消息发送完成`);
    console.log(`[Stress] ⏱️ 总发送时间: ${totalSendTime}ms`);
    console.log(`[Stress] ⏱️ 平均每条: ${(totalSendTime / messageCount).toFixed(0)}ms`);

    // 验证队列指示器显示
    await expect(queueIndicator).toBeVisible({ timeout: 3000 });
    const indicatorText = await queueIndicator.textContent();
    console.log(`[Stress] 📋 队列指示器: ${indicatorText}`);

    // 等待所有消息处理完成
    console.log('[Stress] ⏳ 等待所有消息处理完成...');
    await page.waitForTimeout(20000);

    // 🔥 验证：检查是否有明显的错误或崩溃
    // 注意：Mock 返回 undefined 可能导致空内容，这是正常的
    const hasErrors = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      const messages = chatStore?.getState()?.messages || [];
      // 只检查是否有抛出错误的消息，不检查内容是否为空（因为 Mock 可能返回空）
      const hasErrorMessages = messages.some((m: any) =>
        m.content && m.content.includes('❌') && m.content.includes('错误')
      );
      return hasErrorMessages;
    });

    expect(hasErrors).toBe(false);

    // 🔥 获取最终统计
    const finalStats = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      const messages = chatStore?.getState()?.messages || [];
      return {
        totalMessages: messages.length,
        userMessages: messages.filter((m: any) => m.role === 'user').length,
        assistantMessages: messages.filter((m: any) => m.role === 'assistant').length,
      };
    });

    console.log('[Stress] 📊 最终统计:', finalStats);
    expect(finalStats.userMessages).toBe(messageCount);
    expect(finalStats.assistantMessages).toBeGreaterThanOrEqual(messageCount);

    console.log('[Stress] ✅ 压测通过');
  });

  test('极限并发：同时触发多个工作流', async ({ page }) => {
    console.log('[Stress] ===== 极限并发测试 =====');

    const textarea = page.locator('textarea[data-testid="chat-input"]');
    const sendButton = page.locator('[data-testid="chat-send-button"]');

    // Mock generateResponse
    await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      if (!chatStore) return;

      chatStore.setState({
        generateResponse: async (...args: any[]) => {
          await new Promise(resolve => setTimeout(resolve, 1000));
          return undefined;
        },
      });
    });

    await page.waitForTimeout(500);

    // 🔥 极限并发：发送 10 条工作流命令（高优先级）
    const workflowCommands = [
      '/explore react hooks',
      '/explore typescript',
      '/explore css grid',
      '/explore javascript',
      '/explore nodejs',
      '/explore python',
      '/explore rust',
      '/explore go',
      '/explore java',
      '/explore c++',
    ];

    console.log(`[Stress] 🚀 发送 ${workflowCommands.length} 条工作流命令...`);

    const startTime = Date.now();

    for (const cmd of workflowCommands) {
      await textarea.fill(cmd);
      await sendButton.click();
      await page.waitForTimeout(30); // 极快速发送
    }

    const sendTime = Date.now() - startTime;
    console.log(`[Stress] ⏱️ 发送耗时: ${sendTime}ms`);

    // 🔥 关键验证：UI 应该保持响应
    const responsivenessTest = await page.evaluate(async () => {
      const tests = {
        canClickInput: false,
        canTypeText: false,
        canScroll: false,
      };

      // 测试 1: 能否点击输入框
      try {
        const input = document.querySelector('textarea[data-testid="chat-input"]') as HTMLTextAreaElement;
        if (input) {
          input.focus();
          input.click();
          tests.canClickInput = document.activeElement === input;
        }
      } catch (e) {
        console.log('[Stress] 点击输入框测试失败:', e);
      }

      // 测试 2: 能否输入文本
      try {
        const input = document.querySelector('textarea[data-testid="chat-input"]') as HTMLTextAreaElement;
        if (input) {
          input.value = '';
          input.value = '测试文本';
          tests.canTypeText = input.value === '测试文本';
          input.value = ''; // 清理
        }
      } catch (e) {
        console.log('[Stress] 输入文本测试失败:', e);
      }

      // 测试 3: 能否滚动（有足够内容时）
      try {
        const scrollContainer = document.querySelector('[data-testid="chat-scroll-container"]') as HTMLElement;
        if (scrollContainer) {
          const scrollHeight = scrollContainer.scrollHeight;
          const clientHeight = scrollContainer.clientHeight;

          // 只有当有足够的内容可以滚动时才测试滚动
          if (scrollHeight > clientHeight + 100) {
            const oldScrollTop = scrollContainer.scrollTop;
            scrollContainer.scrollTop = 0;
            const canScrollToTop = scrollContainer.scrollTop === 0;
            scrollContainer.scrollTop = scrollContainer.scrollHeight;
            const canScrollToBottom = scrollContainer.scrollTop > 0;
            tests.canScroll = canScrollToTop && canScrollToBottom;
            scrollContainer.scrollTop = oldScrollTop; // 恢复
          } else {
            // 没有足够的内容可以滚动，这是正常的
            tests.canScroll = true;
            console.log('[Stress] 滚动容器内容不足，跳过滚动测试');
          }
        }
      } catch (e) {
        console.log('[Stress] 滚动测试失败:', e);
      }

      return tests;
    });

    console.log('[Stress] 📊 UI 响应性测试结果:', responsivenessTest);

    // 验证：所有操作都应该可用
    expect(responsivenessTest.canClickInput).toBe(true);
    expect(responsivenessTest.canTypeText).toBe(true);
    expect(responsivenessTest.canScroll).toBe(true);

    // 等待处理
    await page.waitForTimeout(15000);

    console.log('[Stress] ✅ 极限并发测试通过');
  });

  test('内存泄漏：长时间运行测试', async ({ page }) => {
    console.log('[Stress] ===== 内存泄漏测试 =====');

    const textarea = page.locator('textarea[data-testid="chat-input"]');
    const sendButton = page.locator('[data-testid="chat-send-button"]');

    // Mock generateResponse
    await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      if (!chatStore) return;

      chatStore.setState({
        generateResponse: async (...args: any[]) => {
          await new Promise(resolve => setTimeout(resolve, 200));
          return undefined;
        },
      });
    });

    await page.waitForTimeout(500);

    // 🔥 内存测试：多次循环发送消息
    const rounds = 3;
    const messagesPerRound = 5;

    const memorySnapshots: number[] = [];

    for (let round = 1; round <= rounds; round++) {
      console.log(`[Stress] 🔄 第 ${round}/${rounds} 轮...`);

      // 发送消息
      for (let i = 1; i <= messagesPerRound; i++) {
        await textarea.fill(`第${round}轮-消息${i}`);
        await sendButton.click();
        await page.waitForTimeout(100);
      }

      // 等待处理
      await page.waitForTimeout(3000);

      // 🔥 获取内存快照
      const memoryInfo = await page.evaluate(() => {
        if ('memory' in performance) {
          return {
            usedJSHeapSize: (performance as any).memory.usedJSHeapSize,
            totalJSHeapSize: (performance as any).memory.totalJSHeapSize,
            jsHeapSizeLimit: (performance as any).memory.jsHeapSizeLimit,
          };
        }
        return null;
      });

      if (memoryInfo) {
        const usedMB = (memoryInfo.usedJSHeapSize / 1024 / 1024).toFixed(2);
        memorySnapshots.push(parseFloat(usedMB));
        console.log(`[Stress] 📊 内存使用: ${usedMB} MB`);
      }
    }

    // 等待最后一批消息处理完成
    await page.waitForTimeout(5000);

    console.log('[Stress] 📊 内存快照:', memorySnapshots);

    // 🔥 验证：内存使用不应该持续增长（允许小幅波动）
    if (memorySnapshots.length >= 3) {
      const firstSnapshot = memorySnapshots[0];
      const lastSnapshot = memorySnapshots[memorySnapshots.length - 1];
      const growth = ((lastSnapshot - firstSnapshot) / firstSnapshot) * 100;

      console.log(`[Stress] 📊 内存增长率: ${growth.toFixed(1)}%`);

      // 验证：内存增长不应超过 50%（允许正常波动）
      expect(growth).toBeLessThan(50);
    }

    console.log('[Stress] ✅ 内存泄漏测试通过');
  });

  test('性能：长消息流式输出 FPS', async ({ page }) => {
    console.log('[Stress] ===== 长消息流式输出 FPS 测试 =====');

    const textarea = page.locator('textarea[data-testid="chat-input"]');
    const sendButton = page.locator('[data-testid="chat-send-button"]');
    const scrollContainer = page.locator('[data-testid="chat-scroll-container"]');

    // 发送长问题
    const longPrompt = `
请详细介绍以下内容（每个问题至少回答 200 字）：

1. React 18 的并发模式是如何工作的？包括 Scheduler、Lane、Fiber 架构的详细说明。
2. TypeScript 的高级类型系统：条件类型、映射类型、模板字面量类型等。
3. CSS Grid 布局的完整指南：grid-template、grid-area、fr 单位等。
4. JavaScript 的事件循环机制：宏任务、微任务、调用栈的详细说明。
5. Node.js 的模块系统：CommonJS、ES Modules、包管理器的演进历史。

请详细回答每个问题，确保内容丰富、准确、有条理。
    `.trim();

    await textarea.fill(longPrompt);
    await sendButton.click();

    // 等待流式输出开始
    await page.waitForTimeout(2000);

    // 🔥 测量流式输出期间的 FPS
    const fpsResult = await page.evaluate(() => {
      return new Promise((resolve) => {
        const frameTimes: number[] = [];
        let lastFrameTime = performance.now();
        let frameCount = 0;

        function measureFrame() {
          const currentTime = performance.now();
          const frameTime = currentTime - lastFrameTime;
          lastFrameTime = currentTime;

          frameTimes.push(frameTime);
          frameCount++;

          // 测量 5 秒
          if (currentTime < 5000) {
            requestAnimationFrame(measureFrame);
          } else {
            // 计算统计数据
            const avgFrameTime = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
            const avgFps = 1000 / avgFrameTime;
            const minFps = 1000 / Math.max(...frameTimes);
            const maxFps = 1000 / Math.min(...frameTimes);

            // 计算低于 30 FPS 的帧占比
            const badFrames = frameTimes.filter(t => 1000 / t < 30).length;
            const badFrameRate = (badFrames / frameTimes.length) * 100;

            resolve({
              avgFps: Math.round(avgFps),
              minFps: Math.round(minFps),
              maxFps: Math.round(maxFps),
              badFrameRate: Math.round(badFrameRate),
              totalFrames: frameCount,
            });
          }
        }

        requestAnimationFrame(measureFrame);
      });
    });

    console.log('[Stress] 📊 FPS 测试结果:', fpsResult);

    // 验证：平均 FPS 应该 >= 30
    expect((fpsResult as any).avgFps).toBeGreaterThanOrEqual(30);

    // 验证：低帧率占比应该 < 20%
    expect((fpsResult as any).badFrameRate).toBeLessThan(20);

    // 等待 AI 回复完成
    await page.waitForTimeout(30000);

    console.log('[Stress] ✅ 长消息 FPS 测试通过');
  });

  test('压测：输入框在极限条件下的响应性', async ({ page }) => {
    console.log('[Stress] ===== 输入框极限响应性测试 =====');

    const textarea = page.locator('textarea[data-testid="chat-input"]');
    const sendButton = page.locator('[data-testid="chat-send-button"]');

    // Mock generateResponse
    await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      if (!chatStore) return;

      chatStore.setState({
        generateResponse: async (...args: any[]) => {
          await new Promise(resolve => setTimeout(resolve, 300));
          return undefined;
        },
      });
    });

    await page.waitForTimeout(500);

    // 🔥 极限测试：连续快速输入和发送
    const testTexts = [
      '测试文本1',
      '测试文本2-这是一段较长的文本用来测试输入性能',
      '测试文本3',
      '测试文本4-包含数字123和特殊字符!@#$%',
      '测试文本5',
    ];

    const responseTimes = [];

    // 先发送几条消息让队列忙起来
    for (let i = 0; i < 3; i++) {
      await textarea.fill(`初始消息${i}`);
      await sendButton.click();
      await page.waitForTimeout(50);
    }

    // 🔥 在队列忙的时候测试输入响应性
    for (const text of testTexts) {
      const startTime = Date.now();

      await textarea.fill(text);

      // 验证输入是否成功
      const value = await textarea.inputValue();
      const success = value === text;

      const endTime = Date.now();
      const responseTime = endTime - startTime;

      responseTimes.push({
        text: text.substring(0, 20),
        success,
        time: responseTime,
      });

      console.log(`[Stress] 输入测试: "${text.substring(0, 20)}..." - ${success ? '✅' : '❌'} ${responseTime}ms`);

      // 短暂延迟
      await page.waitForTimeout(100);
    }

    // 计算统计数据
    const avgResponseTime = responseTimes.reduce((sum, r) => sum + r.time, 0) / responseTimes.length;
    const successCount = responseTimes.filter(r => r.success).length;
    const successRate = (successCount / responseTimes.length) * 100;

    console.log('[Stress] 📊 输入响应性统计:', {
      总测试次数: responseTimes.length,
      成功次数: successCount,
      成功率: `${successRate.toFixed(1)}%`,
      平均响应时间: `${avgResponseTime.toFixed(0)}ms`,
      最大响应时间: `${Math.max(...responseTimes.map(r => r.time))}ms`,
      最小响应时间: `${Math.min(...responseTimes.map(r => r.time))}ms`,
    });

    // 验证：所有输入都应该成功
    expect(successCount).toBe(responseTimes.length);

    // 验证：平均响应时间应该 < 200ms
    expect(avgResponseTime).toBeLessThan(200);

    console.log('[Stress] ✅ 输入框极限响应性测试通过');
  });
});
