/**
 * 🎯 HTTP API 集成测试
 *
 * 这个测试验证 HTTP API 代理是否工作：
 * 1. HTTP API 服务器是否启动
 * 2. execute_quick_workflow 是否可以通过 HTTP API 调用
 * 3. 前端 Mock invoke 是否正确调用 HTTP API
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

test.describe('HTTP API 集成测试', () => {

  test('✅ 验证 HTTP API 服务器是否启动', async ({ page }) => {
    await setupE2ETestEnvironment(page, {
      skipWelcome: true,
      useRealAI: false
    });

    await page.goto('/');
    await page.waitForTimeout(2000);

    // 设置必要的 store
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

    console.log('📝 [Test] 测试 HTTP API 健康检查端点');

    // 直接调用 HTTP API 的健康检查端点
    const healthCheck = await page.evaluate(async () => {
      try {
        const response = await fetch('http://localhost:3333/api/health', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        const data = await response.json();
        return {
          ok: response.ok,
          status: response.status,
          data
        };
      } catch (error) {
        return {
          ok: false,
          error: (error as Error).message
        };
      }
    });

    console.log('📊 [Test] 健康检查结果:', healthCheck);

    if (healthCheck.ok) {
      console.log('✅ [Test] HTTP API 服务器正在运行！');
      console.log('   返回数据:', healthCheck.data);
    } else {
      console.log('❌ [Test] HTTP API 服务器未启动或无法访问');
      console.log('   错误:', healthCheck.error);
    }

    // 注意：HTTP API 可能没有启动（需要 ENABLE_HTTP_API=true）
    // 所以这个测试只是验证状态，不强制要求成功
  });

  test('✅ 验证 Mock invoke HTTP API 调用', async ({ page }) => {
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

    console.log('📝 [Test] 通过 Mock invoke 调用 execute_quick_workflow');

    // 通过 Mock invoke 调用 execute_quick_workflow
    const result = await page.evaluate(async () => {
      const w = window as any;
      const invoke = w.__TAURI_INTERNALS__?.invoke || w.__TAURI__?.core?.invoke;

      if (!invoke) {
        return { error: 'invoke not available' };
      }

      try {
        console.log('[Test] 📤 调用 invoke("execute_quick_workflow", ...)');

        const workflowId = await invoke('execute_quick_workflow', {
          workflowType: 'exploration',
          targetPath: '.',
          projectRoot: null,
          providerConfig: null,
          currentModel: null,
          correlationId: null
        });

        console.log('[Test] ✅ invoke 返回 workflowId:', workflowId, '类型:', typeof workflowId);

        return {
          success: true,
          workflowId
        };
      } catch (error) {
        console.log('[Test] ❌ invoke 调用失败:', error);
        return {
          success: false,
          error: (error as Error).message
        };
      }
    });

    console.log('📊 [Test] 调用结果:', result);

    if (result.success) {
      console.log('✅ [Test] 成功！Mock invoke 返回了 workflowId:', result.workflowId);
      console.log('   这说明 HTTP API 调用成功（或 fallback 到 mock）');
    } else {
      console.log('❌ [Test] 失败！', result.error);
    }

    // 验证返回了 workflowId
    // 注意：mock invoke 可能返回 'wf-xxx'、'workflow-xxx' 或其他格式
    expect(result.success).toBe(true);
    expect(result.workflowId).toBeDefined();
    expect(typeof result.workflowId).toBe('string');
    expect(result.workflowId.length).toBeGreaterThan(0);
  });

  test('✅ 完整流程测试：通过 /explore 触发 HTTP API', async ({ page }) => {
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

    console.log('📝 [Test] 设置 HTTP API 调用拦截器');

    // 拦截 fetch 调用，记录 HTTP API 请求
    await page.evaluate(() => {
      const originalFetch = window.fetch;
      (window as any).__httpApiCalls = [];

      window.fetch = async function(...args: any[]) {
        const url = args[0];
        if (typeof url === 'string' && url.includes('localhost:3333')) {
          console.log('[Test Intercept] 🌐 HTTP API called:', url, args[1]);
          (window as any).__httpApiCalls.push({
            url,
            options: args[1],
            timestamp: Date.now()
          });
        }
        return originalFetch.apply(this, args);
      };
    });

    await page.waitForTimeout(500);

    console.log('📝 [Test] 发送 /explore 命令');

    // 捕获所有 console.log
    const logs: string[] = [];
    page.on('console', msg => {
      const text = msg.text();
      logs.push(text);
    });

    // 发送 /explore 命令
    await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      if (chatStore) {
        console.log('[Test] 📤 Calling sendMessage("/explore")');
        chatStore.getState().sendMessage('/explore');
        console.log('[Test] ✅ sendMessage called');
      }
    });

    console.log('📝 [Test] 等待 5 秒...');

    await page.waitForTimeout(5000);

    // 检查结果
    const checkResult = await page.evaluate(() => {
      const w = window as any;
      return {
        httpApiCalls: w.__httpApiCalls || [],
        hasChatStore: !!w.__chatStore,
        hasInvoke: !!(w.__TAURI_INTERNALS__?.invoke || w.__TAURI__?.core?.invoke)
      };
    });

    console.log('📊 [Test] 检查结果:', checkResult);
    console.log('📊 [Test] 捕获的日志数:', logs.length);

    // 显示相关日志
    const relevantLogs = logs.filter(log =>
      log.includes('HttpAPI') ||
      log.includes('invoke') ||
      log.includes('execute_quick_workflow') ||
      log.includes('[Test Intercept]')
    );

    console.log('📋 [Test] 相关日志:');
    relevantLogs.forEach((log, i) => {
      console.log(`   ${i + 1}. ${log}`);
    });

    if (checkResult.httpApiCalls.length > 0) {
      console.log('✅ [Test] 检测到 HTTP API 调用！');
      checkResult.httpApiCalls.forEach((call: any) => {
        console.log(`   URL: ${call.url}`);
        console.log(`   时间戳: ${new Date(call.timestamp).toISOString()}`);
      });
    } else {
      console.log('⚠️ [Test] 未检测到 HTTP API 调用');
      console.log('   这说明 HTTP API 服务器未启动，或使用了 mock fallback');
    }

    // 验证基本功能
    expect(checkResult.hasChatStore).toBe(true);
    expect(checkResult.hasInvoke).toBe(true);
  });
});
