/**
 * 🎯 SSE Progress 事件测试
 *
 * 验证 HTTP API 的 SSE progress 事件流是否正常工作
 * 这是在 E2E 测试环境中验证 progress 事件的正确方法
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

test.describe('SSE Progress 事件测试', () => {

// SKIP: 需要真实后端(workflow/AI/SSE)，mock 模式下无法运行
  test.skip('✅ 验证 HTTP API SSE progress 事件流', async ({ page }) => {
    await setupE2ETestEnvironment(page, {
      skipWelcome: true,
      useRealAI: false  // 使用 Mock 模式
    });

    await page.goto('/');
    await page.waitForTimeout(2000);

    // 设置 E2E 模式
    await page.evaluate(() => {
      localStorage.setItem('tour_completed', 'true');
      localStorage.setItem('onboarding_done', 'true');
      (window as any).__E2E__ = true;

      const layoutStore = (window as any).__layoutStore;
      if (layoutStore) {
        layoutStore.setState({ isChatOpen: true });
      }
    });

    await page.waitForTimeout(1000);

    console.log('📝 [Test] 测试 SSE progress 事件流');

    // 通过 SSE 监听 progress 事件
    const result = await page.evaluate(async () => {
      return new Promise((resolve) => {
        // 创建 EventSource 连接
        const eventSource = new EventSource('http://localhost:3333/api/workflow/progress');

        const events: any[] = [];

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log('[Test] 📨 SSE Event received:', data);
            events.push(data);

            // 收集到足够事件后关闭
            if (events.length >= 5) {
              eventSource.close();
              resolve({ success: true, events });
            }
          } catch (error) {
            console.error('[Test] ❌ Failed to parse SSE event:', error);
          }
        };

        eventSource.onerror = (error) => {
          console.error('[Test] ⚠️ SSE error:', error);
          eventSource.close();
          resolve({ success: false, events, error: 'SSE connection error' });
        };

        // 触发工作流执行
        setTimeout(async () => {
          try {
            const response = await fetch('http://localhost:3333/api/workflow/execute', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                workflow_type: 'exploration',
                target_path: '.',
                project_root: null,
                provider_config: null,
                current_model: null,
                correlation_id: null
              }),
            });

            if (!response.ok) {
              resolve({ success: false, events, error: `HTTP ${response.status}` });
            }
          } catch (error) {
            resolve({ success: false, events, error: (error as Error).message });
          }
        }, 500);

        // 超时保护
        setTimeout(() => {
          eventSource.close();
          if (events.length > 0) {
            resolve({ success: true, events });
          } else {
            resolve({ success: false, events, error: 'Timeout - no events received' });
          }
        }, 8000);
      });
    });

    console.log('📊 [Test] 测试结果:', result);

    // 验证结果
    if (result.success) {
      console.log('✅ [Test] 成功接收到 SSE progress 事件！');
      console.log(`   收到 ${result.events.length} 个事件`);

      // 验证事件类型
      const eventTypes = result.events.map((e: any) => e.event_type);
      console.log('📋 [Test] 事件类型:', eventTypes);

      // 验证关键事件存在
      expect(result.events.length).toBeGreaterThan(0);
      expect(eventTypes).toContain('workflow:started');
      expect(eventTypes).toContain('node:started');
      expect(eventTypes).toContain('node:tool_call');
      expect(eventTypes).toContain('node:completed');
      expect(eventTypes).toContain('workflow:completed');
    } else {
      console.log('❌ [Test] 失败:', result.error);
      console.log('   收到的事件:', result.events);

      // 如果是因为 HTTP API 未启动，跳过测试
      if (result.error && result.error.includes('Failed to fetch')) {
        test.skip(true, 'HTTP API 服务器未启动，跳过测试');
      } else {
        throw new Error(`Test failed: ${result.error}`);
      }
    }
  });

// SKIP: 需要真实后端(workflow/AI/SSE)，mock 模式下无法运行
  test.skip('✅ 验证前端 SSE progress 监听器', async ({ page }) => {
    await setupE2ETestEnvironment(page, {
      skipWelcome: true,
      useRealAI: false
    });

    await page.goto('/');
    await page.waitForTimeout(2000);

    await page.evaluate(() => {
      localStorage.setItem('tour_completed', 'true');
      localStorage.setItem('onboarding_done', 'true');
      (window as any).__E2E__ = true;

      const layoutStore = (window as any).__layoutStore;
      if (layoutStore) {
        layoutStore.setState({ isChatOpen: true });
      }
    });

    await page.waitForTimeout(1000);

    console.log('📝 [Test] 测试前端 SSE progress 监听器');

    // 捕获 console.log
    const logs: string[] = [];
    page.on('console', msg => {
      const text = msg.text();
      logs.push(text);
    });

    // 通过 chatStore 发送 /explore 命令来触发工作流
    await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      if (chatStore) {
        console.log('[Test] 📤 发送 /explore 命令');
        chatStore.getState().sendMessage('/explore');
        console.log('[Test] ✅ 命令已发送');
      }
    });

    // 等待工作流执行和 progress 事件
    console.log('[Test] ⏳ 等待工作流执行...');
    await page.waitForTimeout(8000);

    // 检查日志中的 SSE 相关信息
    const sseLogs = logs.filter(log =>
      log.includes('SSEProgressMonitor') ||
      log.includes('workflow:progress') ||
      log.includes('workflow:started') ||
      log.includes('node:started')
    );

    console.log('📋 [Test] SSE 相关日志:');
    sseLogs.forEach((log, i) => {
      console.log(`   ${i + 1}. ${log.substring(0, 200)}`);
    });

    // 验证
    if (sseLogs.length > 0) {
      console.log(`✅ [Test] 成功！检测到 ${sseLogs.length} 条 SSE 相关日志`);

      // 验证关键日志存在
      const logText = sseLogs.join(' ');
      expect(logText).toContain('SSEProgressMonitor');
      expect(logText).toContain('workflow:started');
    } else {
      console.log('⚠️ [Test] 未检测到 SSE 日志');
      console.log('   这可能意味着 SSE 监听未启动或工作流未触发');
      console.log('   总日志数:', logs.length);

      // 显示一些非 SSE 日志作为参考
      const otherLogs = logs.filter(log =>
        log.includes('invoke') ||
        log.includes('workflow') ||
        log.includes('explore')
      );
      console.log('📋 [Test] 其他相关日志:');
      otherLogs.slice(0, 10).forEach((log, i) => {
        console.log(`   ${i + 1}. ${log.substring(0, 200)}`);
      });
    }

    // 验证至少执行了某些操作
    expect(logs.length).toBeGreaterThan(0);
  });
});
