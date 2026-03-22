/**
 * 后端调用诊断测试
 *
 * 检查 invoke('ai_chat') 是否被正确调用
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

test.describe('后端调用诊断', () => {
  test.setTimeout(120000);

  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page, {
      skipWelcome: true,
      useRealAI: true
    });

    await page.waitForTimeout(3000);

    // 配置 AI Provider
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
    });
  });

  test('检查后端 invoke 调用', async ({ page }) => {
    console.log('[测试] 开始检查后端调用');

    // 拦截 invoke 调用
    await page.evaluate(() => {
      const w = window as any;
      w.__INVOKE_CALLS__ = [];

      // 保存原始 invoke 函数
      const originalInvoke = w.__TAURI_INTERNALS__?.invoke || w.__TAURI__?.core?.invoke;

      if (!originalInvoke) {
        console.error('[测试] ❌ invoke 函数不存在！');
        return;
      }

      // 替换 invoke 函数来记录调用
      const wrappedInvoke = async (cmd: string, args?: any) => {
        const callRecord = {
          cmd,
          args: JSON.stringify(args, null, 2),
          timestamp: Date.now(),
          success: false,
          error: null
        };

        w.__INVOKE_CALLS__.push(callRecord);

        console.log('[测试] 🔧 invoke called:', {
          cmd,
          argsKeys: args ? Object.keys(args) : [],
          timestamp: callRecord.timestamp
        });

        try {
          const result = await originalInvoke(cmd, args);
          callRecord.success = true;
          console.log('[测试] ✅ invoke success:', {
            cmd,
            resultPreview: JSON.stringify(result).substring(0, 100)
          });
          return result;
        } catch (error) {
          callRecord.error = String(error);
          console.error('[测试] ❌ invoke failed:', {
            cmd,
            error: String(error)
          });
          throw error;
        }
      };

      // 替换 invoke
      if (w.__TAURI_INTERNALS__?.invoke) {
        w.__TAURI_INTERNALS__.invoke = wrappedInvoke;
      }
      if (w.__TAURI__?.core?.invoke) {
        w.__TAURI__.core.invoke = wrappedInvoke;
      }

      console.log('[测试] ✅ invoke wrapper installed');
    });

    // 发送消息
    console.log('[测试] 发送消息');
    await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      const settingsStore = (window as any).__settingsStore;
      chatStore.getState().sendMessage(
        '你好',
        settingsStore.getState().currentProviderId,
        settingsStore.getState().currentModel
      );
    });

    // 等待一段时间
    console.log('[测试] 等待 30 秒...');
    await page.waitForTimeout(30000);

    // 获取 invoke 调用记录
    const invokeResult = await page.evaluate(() => {
      const w = window as any;
      const calls = w.__INVOKE_CALLS__ || [];

      return {
        totalCalls: calls.length,
        calls: calls.map((c: any) => ({
          cmd: c.cmd,
          timestamp: c.timestamp,
          success: c.success,
          error: c.error,
          argsPreview: c.args ? c.args.substring(0, 500) : null
        }))
      };
    });

    console.log('[测试] ════════════════════════════════════════');
    console.log('[测试] Invoke 调用结果:');
    console.log('[测试] ════════════════════════════════════════');
    console.log(JSON.stringify(invokeResult, null, 2));
    console.log('[测试] ════════════════════════════════════════');

    // 检查是否调用了 ai_chat
    const aiChatCalls = invokeResult.calls.filter((c: any) => c.cmd === 'ai_chat');
    if (aiChatCalls.length === 0) {
      console.error('[测试] ❌ CRITICAL: invoke("ai_chat") was never called!');
      console.error('[测试]    This means the backend was not invoked at all');
    } else {
      console.log(`[测试] ✅ Found ${aiChatCalls.length} ai_chat invoke(s)`);
      aiChatCalls.forEach((call: any, idx: number) => {
        if (!call.success) {
          console.error(`[测试] ❌ ai_chat call #${idx + 1} failed:`, call.error);
        }
      });
    }

    expect(aiChatCalls.length).toBeGreaterThan(0);
    expect(aiChatCalls[0].success).toBe(true);
  });
});
