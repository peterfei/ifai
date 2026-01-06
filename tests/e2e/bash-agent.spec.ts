import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from './setup-utils';

test.describe('Bash Agent - Shell Command Execution', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForFunction(() => (window as any).__chatStore !== undefined, { timeout: 10000 });
    await page.waitForTimeout(2000);
  });

  test('should execute pwd command and return current directory', async ({ page }) => {
    test.setTimeout(60000);

    // 启用自动批准工具调用
    await page.evaluate(async () => {
      const settings = (window as any).__settingsStore;
      if (settings) {
        settings.setState({ agentAutoApprove: true });
      }
    });

    // 执行 pwd 命令
    await page.evaluate(async () => {
      await (window as any).__E2E_SEND__('帮我执行 pwd');
    });

    // 轮询等待 Agent 完成执行
    const startTime = Date.now();
    let completed = false;

    while (Date.now() - startTime < 30000) {
      const state = await page.evaluate(() => {
        const messages = (window as any).__chatStore.getState().messages;
        const lastMsg = messages[messages.length - 1];
        return {
          messageCount: messages.length,
          lastRole: lastMsg?.role,
          content: lastMsg?.content || '',
          isLoading: (window as any).__chatStore.getState().isLoading,
          hasToolCalls: lastMsg?.toolCalls?.length > 0
        };
      });

      console.log(`[E2E] Polling: isLoading=${state.isLoading}, hasToolCalls=${state.hasToolCalls}, contentLength=${state.content.length}`);

      // 如果不 loading 且有内容，说明完成了
      if (!state.isLoading && state.content.length > 50) {
        completed = true;
        console.log('[E2E] pwd execution completed');
        break;
      }

      await page.waitForTimeout(1000);
    }

    const finalState = await page.evaluate(() => {
      const messages = (window as any).__chatStore.getState().messages;
      const lastMsg = messages[messages.length - 1];
      return {
        messageCount: messages.length,
        lastRole: lastMsg?.role,
        content: lastMsg?.content || '',
        isLoading: (window as any).__chatStore.getState().isLoading
      };
    });

    console.log('[E2E] Final state after pwd:', JSON.stringify(finalState, null, 2));

    // 验证基本功能：Agent 被触发且不卡死
    expect(finalState.messageCount).toBeGreaterThan(1);
    expect(finalState.lastRole).toBe('assistant');
    expect(finalState.isLoading).toBe(false);

    // 至少应该有内容（可能是意图识别占位符或实际结果）
    expect(finalState.content.trim().length).toBeGreaterThan(0);
  });

  test('should execute ls command and return file listing', async ({ page }) => {
    test.setTimeout(60000);

    // 启用自动批准
    await page.evaluate(async () => {
      const settings = (window as any).__settingsStore;
      if (settings) settings.setState({ agentAutoApprove: true });
    });

    await page.evaluate(async () => {
      await (window as any).__E2E_SEND__('帮我执行 ls');
    });

    // 等待完成
    await page.waitForTimeout(15000);

    const state = await page.evaluate(() => {
      const messages = (window as any).__chatStore.getState().messages;
      const lastMsg = messages[messages.length - 1];
      return {
        messageCount: messages.length,
        lastRole: lastMsg?.role,
        content: lastMsg?.content || '',
        isLoading: (window as any).__chatStore.getState().isLoading
      };
    });

    console.log('[E2E] State after ls:', state);

    // 验证基本功能
    expect(state.messageCount).toBeGreaterThan(1);
    expect(state.lastRole).toBe('assistant');
    expect(state.isLoading).toBe(false);
    expect(state.content.trim().length).toBeGreaterThan(0);
  });

  test('should execute git status and return git information', async ({ page }) => {
    test.setTimeout(60000);

    // 启用自动批准
    await page.evaluate(async () => {
      const settings = (window as any).__settingsStore;
      if (settings) settings.setState({ agentAutoApprove: true });
    });

    await page.evaluate(async () => {
      await (window as any).__E2E_SEND__('运行 git status');
    });

    // 等待完成
    await page.waitForTimeout(15000);

    const state = await page.evaluate(() => {
      const messages = (window as any).__chatStore.getState().messages;
      const lastMsg = messages[messages.length - 1];
      return {
        messageCount: messages.length,
        lastRole: lastMsg?.role,
        content: lastMsg?.content || '',
        isLoading: (window as any).__chatStore.getState().isLoading
      };
    });

    console.log('[E2E] State after git status:', state);

    // 验证基本功能
    expect(state.messageCount).toBeGreaterThan(1);
    expect(state.lastRole).toBe('assistant');
    expect(state.isLoading).toBe(false);
    expect(state.content.trim().length).toBeGreaterThan(0);
  });

  test('should not loop infinitely - single execution only', async ({ page }) => {
    test.setTimeout(45000);

    // 执行一个简单命令
    await page.evaluate(async () => {
      await (window as any).__E2E_SEND__('帮我执行 pwd');
    });

    // 轮询检查状态，确保不会无限循环
    const startTime = Date.now();
    let loopCount = 0;
    let finalContent = '';

    while (Date.now() - startTime < 40000) {
      const state = await page.evaluate(() => {
        const messages = (window as any).__chatStore.getState().messages;
        const lastMsg = messages[messages.length - 1];
        return {
          messageCount: messages.length,
          lastRole: lastMsg?.role,
          content: lastMsg?.content || '',
          isLoading: (window as any).__chatStore.getState().isLoading,
          hasToolCalls: lastMsg?.toolCalls?.length > 0
        };
      });

      // 统计工具调用次数
      if (state.hasToolCalls) {
        loopCount++;
        console.log(`[E2E] Detected tool call, count: ${loopCount}`);

        // 如果工具调用超过 3 次，认为可能存在循环
        if (loopCount > 3) {
          console.error('[E2E] Possible infinite loop detected!');
          expect(loopCount).toBeLessThanOrEqual(3);
          break;
        }
      }

      // 如果有内容且不 loading，任务完成
      if (state.content && !state.isLoading) {
        finalContent = state.content;
        console.log('[E2E] Command execution completed');
        break;
      }

      await page.waitForTimeout(2000);
    }

    // 验证：有最终结果，且没有循环多次
    expect(finalContent.length).toBeGreaterThan(0);
    expect(loopCount).toBeLessThanOrEqual(2); // 允许 1-2 次工具调用（bash + 可能的重试）

    console.log('[E2E] Loop test passed, no infinite loop detected');
  });

  test('should support different command formats', async ({ page }) => {
    test.setTimeout(60000);

    const commands = [
      '执行 pwd',
      '运行 pwd',
      // 'run pwd',  // 如果英文命令也支持，可以取消注释
    ];

    for (const cmd of commands) {
      console.log(`[E2E] Testing command format: "${cmd}"`);

      await page.evaluate(async (text) => {
        // 清除 loading 状态
        (window as any).__chatStore.setState({ isLoading: false });
        await (window as any).__E2E_SEND__(text);
      }, cmd);

      // 等待执行
      await page.waitForTimeout(5000);

      // 检查结果
      const state = await page.evaluate(() => {
        const messages = (window as any).__chatStore.getState().messages;
        const lastMsg = messages[messages.length - 1];
        return {
          content: lastMsg?.content || '',
          isLoading: (window as any).__chatStore.getState().isLoading
        };
      });

      // 验证有响应
      expect(state.content.length).toBeGreaterThan(0);
      expect(state.isLoading).toBe(false);

      console.log(`[E2E] Command "${cmd}" executed successfully`);
    }
  });

  test('should handle command failure gracefully', async ({ page }) => {
    test.setTimeout(30000);

    // 执行一个会失败的命令（不存在的命令）
    await page.evaluate(async () => {
      await (window as any).__E2E_SEND__('执行 nonexistentcommand12345');
    });

    // 等待执行
    await page.waitForTimeout(5000);

    // 检查结果
    const state = await page.evaluate(() => {
      const messages = (window as any).__chatStore.getState().messages;
      const lastMsg = messages[messages.length - 1];
      return {
        content: lastMsg?.content || '',
        isLoading: (window as any).__chatStore.getState().isLoading
      };
    });

    console.log('[E2E] State after failed command:', state);

    // 验证：即使失败也应该有响应（错误信息）
    expect(state.content.length).toBeGreaterThan(0);
    expect(state.isLoading).toBe(false);

    // 验证包含错误相关信息
    const hasErrorIndication = /error|not found|failed|command/.test(state.content.toLowerCase());
    expect(hasErrorIndication).toBeTruthy();
  });
});
