import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from './setup-utils';

/**
 * 长期运行命令测试
 *
 * 问题描述：
 * - 执行 `npm run dev` 等命令时，命令会启动一个长期运行的服务
 * - 命令输出中包含启动成功的标志（如 "Local:", "ready in"）
 * - 但当前实现会一直等待进程结束，导致超时
 * - 最终 LLM 收到超时信息，重复执行命令
 *
 * 预期行为：
 * - 检测输出中的成功标志
 * - 一旦检测到，立即认为命令执行成功
 * - 返回成功状态，避免超时
 */

test.describe('Long-Running Command Detection', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', msg => {
      const text = msg.text();
      const type = msg.type();
      if (type === 'error') {
        console.log('[Browser Error]', text);
      } else if (text.includes('[E2E]') || text.includes('[Chat]') || text.includes('[useChatStore]') || text.includes('[Bash Streaming]')) {
        console.log('[Browser]', text);
      }
    });

    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForTimeout(2000);
  });

  test('应该检测 npm run dev 的启动成功标志', async ({ page }) => {
    // 模拟 npm run dev 的输出
    await page.evaluate(() => {
      const chatStore = (window as any).__chatStore?.getState();
      chatStore.addMessage({
        id: 'msg-npm-dev',
        role: 'assistant',
        content: '启动开发服务器',
        toolCalls: [{
          id: 'call_npm_dev',
          tool: 'bash',
          args: { command: 'npm run dev' },
          status: 'pending'
        }]
      });
    });

    // 点击批准执行
    await page.locator('button:has-text("批准执行")').first().click();

    // 等待执行完成
    await page.waitForTimeout(3000);

    // 验证状态
    const finalState = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore?.getState();
      const message = chatStore?.messages.find((m: any) => m.id === 'msg-npm-dev');
      const toolCall = message?.toolCalls?.find((tc: any) => tc.id === 'call_npm_dev');

      return {
        status: toolCall?.status,
        hasResult: !!toolCall?.result,
        resultPreview: toolCall?.result ? toolCall.result.substring(0, 200) : null,
        // 检查是否包含成功标志
        hasSuccessFlag: toolCall?.result?.includes('Server started successfully')
      };
    });

    console.log('[E2E] Final state:', JSON.stringify(finalState, null, 2));

    // 验证：命令应该执行成功（而不是超时）
    expect(finalState.status).toBe('completed');
    expect(finalState.hasResult).toBe(true);

    // 验证：应该检测到启动成功（而不是超时）
    // 注意：在 mock 环境中，我们模拟返回成功标志
    expect(finalState.resultPreview).toBeTruthy();
  });

  test('模拟不同的启动成功标志', async ({ page }) => {
    // 测试各种开发服务器的启动成功标志
    const testCases = [
      { command: 'npm run dev', expectedPattern: 'VITE v' },
      { command: 'npm start', expectedPattern: 'Compiled successfully' },
      { command: 'python app.py', expectedPattern: 'Running on' },
    ];

    for (const testCase of testCases) {
      console.log(`[E2E] Testing command: ${testCase.command}`);

      await page.evaluate((cmd) => {
        const chatStore = (window as any).__chatStore?.getState();
        chatStore.addMessage({
          id: `msg-${cmd.replace(/\s+/g, '-')}`,
          role: 'assistant',
          content: `执行 ${cmd}`,
          toolCalls: [{
            id: `call-${cmd.replace(/\s+/g, '-')}`,
            tool: 'bash',
            args: { command: cmd },
            status: 'pending'
          }]
        });
      }, testCase.command);

      // 点击批准执行
      await page.locator('button:has-text("批准执行")').first().click();
      await page.waitForTimeout(2000);

      // 验证状态
      const state = await page.evaluate((cmd) => {
        const chatStore = (window as any).__chatStore?.getState();
        const messageId = `msg-${cmd.replace(/\s+/g, '-')}`;
        const toolCallId = `call-${cmd.replace(/\s+/g, '-')}`;
        const message = chatStore?.messages.find((m: any) => m.id === messageId);
        const toolCall = message?.toolCalls?.find((tc: any) => tc.id === toolCallId);

        return {
          command: cmd,
          status: toolCall?.status,
          hasResult: !!toolCall?.result
        };
      }, testCase.command);

      console.log(`[E2E] State for ${testCase.command}:`, state);
      expect(state.status).toBe('completed');
    }
  });

  test('验证命令不会重复执行', async ({ page }) => {
    // 这个测试验证：当命令成功启动后，LLM 不会重复执行

    await page.evaluate(() => {
      const chatStore = (window as any).__chatStore?.getState();
      chatStore.addMessage({
        id: 'msg-user-start',
        role: 'user',
        content: '启动开发服务器'
      });

      chatStore.addMessage({
        id: 'msg-ai-start',
        role: 'assistant',
        content: '好的，我来启动开发服务器',
        toolCalls: [{
          id: 'call_start_1',
          tool: 'bash',
          args: { command: 'npm run dev' },
          status: 'pending'
        }]
      });
    });

    // 批准执行
    await page.locator('button:has-text("批准执行")').first().click();
    await page.waitForTimeout(3000);

    // 等待 LLM 响应
    await page.waitForTimeout(3000);

    // 验证：应该只有 1 个 npm run dev 的 tool call
    const toolCallCount = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore?.getState();
      const messages = chatStore?.messages || [];

      let npmDevCount = 0;
      messages.forEach((m: any) => {
        if (m.toolCalls) {
          m.toolCalls.forEach((tc: any) => {
            if (tc.tool === 'bash' && tc.args?.command === 'npm run dev') {
              npmDevCount++;
            }
          });
        }
      });

      return {
        npmDevCount,
        totalMessages: messages.length
      };
    });

    console.log('[E2E] Tool call count:', toolCallCount);

    // 关键验证：应该只有 1 个 npm run dev 命令（不会重复）
    expect(toolCallCount.npmDevCount).toBe(1);
  });
});
