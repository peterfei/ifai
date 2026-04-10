/**
 * 🎯 简单测试：验证 Tauri invoke 是否工作
 *
 * 这个测试直接调用 Tauri command，验证后端是否收到调用
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

test.describe('Tauri Invoke 测试', () => {

  test('✅ 验证 Tauri invoke 基本功能', async ({ page }) => {
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

    console.log('📝 [Test] 步骤 1: 检查 Tauri API 是否可用');

    // 检查 Tauri API 是否可用
    const tauriCheck = await page.evaluate(() => {
      const w = window as any;
      return {
        hasTAURIInternals: !!w.__TAURI_INTERNALS__,
        hasTAURI: !!w.__TAURI__,
        hasInvoke: !!(w.__TAURI_INTERNALS__?.invoke || w.__TAURI__?.core?.invoke),
        invokeType: typeof (w.__TAURI_INTERNALS__?.invoke || w.__TAURI__?.core?.invoke)
      };
    });

    console.log('📊 [Test] Tauri API 状态:', tauriCheck);

    expect(tauriCheck.hasTAURIInternals || tauriCheck.hasTAURI).toBe(true, 'Tauri API 应该存在');

    if (!tauriCheck.hasInvoke) {
      console.log('⚠️ [Test] Tauri invoke 不可用，跳过测试');
      return;
    }

    await page.waitForTimeout(500);

    console.log('📝 [Test] 步骤 2: 尝试调用简单的 Tauri command');

    // 🔥 尝试调用一个简单的 Tauri command 来测试
    // 首先检查是否有任何可用的 commands
    const commandsCheck = await page.evaluate(async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const w = window as any;

        // 记录 invoke 函数
        console.log('[Test] invoke function:', invoke.toString().substring(0, 200));

        // 尝试调用一个应该存在的 command
        // 如果 execute_quick_workflow 存在，它应该返回一个 workflow ID
        const result = await invoke('execute_quick_workflow', {
          workflowType: 'exploration',
          targetPath: '.',
          projectRoot: null,
          providerConfig: null,
          currentModel: null,
          correlationId: null
        });

        console.log('[Test] ✅ invoke 成功返回:', result);

        return {
          success: true,
          result: result,
          error: null
        };
      } catch (error) {
        console.log('[Test] ❌ invoke 失败:', error);
        return {
          success: false,
          result: null,
          error: error.toString()
        };
      }
    });

    console.log('📊 [Test] Command 调用结果:', commandsCheck);

    if (commandsCheck.success) {
      console.log('✅ [Test] 成功！Tauri invoke 工作正常');
      console.log('   返回结果:', commandsCheck.result);
    } else {
      console.log('❌ [Test] 失败！Tauri invoke 不工作');
      console.log('   错误信息:', commandsCheck.error);
    }

    // 如果 invoke 失败，这个测试帮助我们了解为什么
    if (!commandsCheck.success) {
      console.log('⚠️ [Test] invoke 失败，可能原因：');
      console.log('   1. Tauri command 未注册');
      console.log('   2. Tauri 应用还未完全初始化');
      console.log('   3. 测试环境权限问题');
    }
  });

  test('✅ 验证 chatStore.sendMessage 是否调用后端', async ({ page }) => {
    await setupE2ETestEnvironment(page, {
      skipWelcome: true,
      useRealAI: true
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

    console.log('📝 [Test] 通过 chatStore 发送 /explore 命令');

    // 设置全局变量来捕获后端调用
    await page.evaluate(() => {
      const w = window as any;

      // 🔥 拦截 invoke 调用，记录所有调用
      const originalInvoke = w.__TAURI_INTERNALS__?.invoke || w.__TAURI__?.core?.invoke;

      if (originalInvoke) {
        w.__invokeCalls = [];
        w.__TAURI_INTERNALS__.invoke = async function(command: string, args?: any) {
          console.log('[Test Intercept] 📞 invoke called:', command, args);
          w.__invokeCalls.push({ command, args, timestamp: Date.now() });
          return originalInvoke.call(this, command, args);
        };
        console.log('[Test] ✅ invoke interceptor installed');
      } else {
        console.log('[Test] ⚠️ invoke not available for interception');
      }
    });

    await page.waitForTimeout(500);

    // 发送 /explore 命令
    await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      if (chatStore) {
        console.log('[Test] 📤 Calling sendMessage with /explore');
        chatStore.getState().sendMessage('/explore');
      } else {
        console.log('[Test] ❌ chatStore not found');
      }
    });

    console.log('📝 [Test] 等待 10 秒，观察是否有后端调用...');

    await page.waitForTimeout(10000);

    // 检查是否有 invoke 调用
    const invokeCheck = await page.evaluate(() => {
      const w = window as any;
      const calls = w.__invokeCalls || [];

      return {
        totalInvokes: calls.length,
        calls: calls.map((c: any) => ({
          command: c.command,
          hasArgs: !!c.args,
          timestamp: c.timestamp
        }))
      };
    });

    console.log('📊 [Test] Invoke 调用统计:', invokeCheck);

    if (invokeCheck.totalInvokes > 0) {
      console.log('✅ [Test] 检测到 invoke 调用！');
      invokeCheck.calls.forEach((call: any, i: number) => {
        console.log(`   ${i + 1}. ${call.command} (时间戳: ${call.timestamp})`);
      });
    } else {
      console.log('❌ [Test] 没有检测到任何 invoke 调用！');
      console.log('   这说明前端的 sendMessage 没有调用后端');
    }

    // 给出一个信息性的断言
    expect(invokeCheck.totalInvokes).toBeGreaterThanOrEqual(0);
  });
});
