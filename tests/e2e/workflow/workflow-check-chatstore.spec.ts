/**
 * 🎯 检查 chatStore 初始化状态
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

test.describe('chatStore 初始化检查', () => {

  test('✅ 验证 chatStore 是否正确初始化', async ({ page }) => {
    await setupE2ETestEnvironment(page, {
      skipWelcome: true,
      useRealAI: true
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

    console.log('📝 [Test] 步骤 1: 检查 window 上的所有 store');

    // 检查所有 store 是否存在
    const storesCheck = await page.evaluate(() => {
      const w = window as any;

      return {
        hasChatStore: !!w.__chatStore,
        hasSettingsStore: !!w.__settingsStore,
        hasFileStore: !!w.__fileStore,
        hasAgentStore: !!w.__agentStore,
        hasLayoutStore: !!w.__layoutStore,
        chatStoreType: typeof w.__chatStore,
        chatStoreState: w.__chatStore ? {
          hasGetState: typeof w.__chatStore.getState === 'function',
          hasSendMessage: typeof w.__chatStore.getState?.()?.sendMessage === 'function',
          messagesCount: w.__chatStore.getState?.()?.messages?.length || 0
        } : null
      };
    });

    console.log('📊 [Test] Store 状态:', JSON.stringify(storesCheck, null, 2));

    expect(storesCheck.hasChatStore).toBe(true, 'chatStore 应该存在');

    if (!storesCheck.hasChatStore) {
      console.log('❌ [Test] chatStore 不存在，测试无法继续');
      return;
    }

    console.log('📝 [Test] 步骤 2: 检查 sendMessage 方法');

    const sendMessageCheck = await page.evaluate(() => {
      const w = window as any;
      const chatStore = w.__chatStore;

      if (!chatStore) return { error: 'chatStore not found' };

      const state = chatStore.getState();
      const sendMessage = state?.sendMessage;

      return {
        hasSendMessage: !!sendMessage,
        sendMessageType: typeof sendMessage,
        sendMessageSource: sendMessage ? sendMessage.toString().substring(0, 200) : null
      };
    });

    console.log('📊 [Test] sendMessage 状态:', JSON.stringify(sendMessageCheck, null, 2));

    console.log('📝 [Test] 步骤 3: 调用 sendMessage 并观察日志');

    // 设置全局变量来捕获日志
    await page.evaluate(() => {
      const w = window as any;

      // 捕获所有 console.log
      const originalLog = console.log;
      w.__capturedLogs = [];

      console.log = function(...args: any[]) {
        w.__capturedLogs.push({
          type: 'log',
          args: args.map(a => {
            try {
              return typeof a === 'object' ? JSON.stringify(a) : String(a);
            } catch {
              return String(a);
            }
          }),
          timestamp: Date.now()
        });
        originalLog.apply(console, args);
      };
    });

    await page.waitForTimeout(500);

    // 发送 /explore 命令
    console.log('📝 [Test] 调用 sendMessage("/explore")...');
    await page.evaluate(() => {
      const w = window as any;
      const chatStore = w.__chatStore;

      if (chatStore && chatStore.getState && chatStore.getState().sendMessage) {
        console.log('[Test] 📤 About to call sendMessage("/explore")');
        chatStore.getState().sendMessage('/explore');
        console.log('[Test] ✅ sendMessage called');
      } else {
        console.log('[Test] ❌ sendMessage not available');
      }
    });

    console.log('📝 [Test] 等待 5 秒...');
    await page.waitForTimeout(5000);

    // 检查捕获的日志
    const logsCheck = await page.evaluate(() => {
      const w = window as any;
      const logs = w.__capturedLogs || [];

      // 过滤出相关的日志
      const relevantLogs = logs.filter((log: any) => {
        const str = log.args.join(' ');
        return str.includes('Workflow') ||
               str.includes('Intent') ||
               str.includes('workflow') ||
               str.includes('explore') ||
               str.includes('CoreProxy') ||
               str.includes('SendMessageOrchestrator');
      });

      return {
        totalLogs: logs.length,
        relevantLogsCount: relevantLogs.length,
        relevantLogs: relevantLogs.slice(0, 50) // 只返回前 50 条
      };
    });

    console.log('📊 [Test] 捕获的日志统计:', logsCheck);

    if (logsCheck.relevantLogsCount > 0) {
      console.log('✅ [Test] 找到相关日志！');
      logsCheck.relevantLogs.forEach((log: any, i: number) => {
        console.log(`   ${i + 1}. [${log.type}] ${log.args.join(' ')}`);
      });
    } else {
      console.log('❌ [Test] 没有找到任何工作流相关的日志！');
      console.log('   这说明 sendMessage 可能没有触发工作流处理逻辑');
    }

    expect(storesCheck.hasChatStore).toBe(true);
  });
});
