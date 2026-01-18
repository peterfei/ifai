import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment, removeJoyrideOverlay } from '../setup';

/**
 * Tool 消息格式测试
 *
 * 目的：验证发送给 LLM 的 tool 消息格式是否清晰明确
 * 特别要确保 LLM 理解命令已经执行完成，不要重复执行
 */

test.describe.skip('Tool Message Format - LLM Understanding - TODO: Fix this test', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', msg => {
      const text = msg.text();
      const type = msg.type();
      if (type === 'error') {
        console.log('[Browser Error]', text);
      } else if (text.includes('[E2E]') || text.includes('[Core]') || text.includes('[Chat]')) {
        console.log('[Browser]', text);
      }
    });

    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForTimeout(2000);
  });

  test('npm run dev 成功后，tool 消息应该包含明确的说明', async ({ page }) => {
    await page.evaluate(() => {
      const chatStore = (window as any).__chatStore?.getState();
      chatStore.addMessage({
        id: 'msg-user-run',
        role: 'user',
        content: '运行 vite'
      });

      chatStore.addMessage({
        id: 'msg-ai-run',
        role: 'assistant',
        content: '好的，我来启动 vite 开发服务器',
        toolCalls: [{
          id: 'call_npm_run_dev',
          tool: 'bash',
          args: { command: 'npm run dev' },
          status: 'pending'
        }]
      });
    });

    // 批准执行
    await removeJoyrideOverlay(page);
    await page.locator('button:has-text("批准执行")').first().click();
    await page.waitForTimeout(3000);

    // 获取发送给 LLM 的 tool 消息内容
    const toolMessageContent = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore?.getState();
      const messages = chatStore?.messages || [];

      // 找到 tool 消息
      const toolMessage = messages.find((m: any) =>
        m.role === 'tool' && m.tool_call_id === 'call_npm_run_dev'
      );

      return {
        content: toolMessage?.content || '',
        length: toolMessage?.content?.length || 0,
        // 检查关键标记
        hasSuccessFlag: toolMessage?.content?.includes('Command executed successfully') || false,
        hasImportantNotice: toolMessage?.content?.includes('IMPORTANT:') || false,
        hasDoNotRepeat: toolMessage?.content?.includes('Do NOT attempt to run this command again') || false,
        hasServerReady: toolMessage?.content?.includes('development server has been successfully started') || false
      };
    });

    console.log('[E2E] Tool message content preview:', toolMessageContent.content.substring(0, 300));
    console.log('[E2E] Tool message analysis:', JSON.stringify({
      hasSuccessFlag: toolMessageContent.hasSuccessFlag,
      hasImportantNotice: toolMessageContent.hasImportantNotice,
      hasDoNotRepeat: toolMessageContent.hasDoNotRepeat,
      hasServerReady: toolMessageContent.hasServerReady
    }, null, 2));

    // 验证：tool 消息包含所有关键标记
    expect(toolMessageContent.hasSuccessFlag).toBe(true);
    expect(toolMessageContent.hasImportantNotice).toBe(true);
    expect(toolMessageContent.hasDoNotRepeat).toBe(true);
    expect(toolMessageContent.hasServerReady).toBe(true);
  });

  test('LLM 收到 tool 消息后不应该重复执行相同的命令', async ({ page }) => {
    // 完整场景测试
    await page.evaluate(() => {
      const chatStore = (window as any).__chatStore?.getState();
      chatStore.addMessage({
        id: 'msg-user-start',
        role: 'user',
        content: '启动 vite 开发服务器'
      });

      chatStore.addMessage({
        id: 'msg-ai-start',
        role: 'assistant',
        content: '好的，我来启动 vite 开发服务器',
        toolCalls: [{
          id: 'call_start_vite',
          tool: 'bash',
          args: { command: 'npm run dev' },
          status: 'pending'
        }]
      });
    });

    // 批准执行
    await removeJoyrideOverlay(page);
    await page.locator('button:has-text("批准执行")').first().click();
    await page.waitForTimeout(3000);

    // 等待 LLM 响应
    await page.waitForTimeout(3000);

    // 统计 npm run dev 命令的数量
    const commandCount = await page.evaluate(() => {
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
        totalMessages: messages.length,
        // 检查是否有 LLM 的响应（应该有新的 assistant 消息）
        hasFollowUpResponse: messages.some((m: any) =>
          m.role === 'assistant' && m.id !== 'msg-ai-start' && m.content?.trim().length > 0
        )
      };
    });

    console.log('[E2E] Command statistics:', JSON.stringify(commandCount, null, 2));

    // 关键验证：应该只有 1 个 npm run dev 命令（不重复执行）
    expect(commandCount.npmDevCount).toBe(1);

    // 可选验证：LLM 可能有响应（取决于 LLM 行为，不是强制要求）
    // hasFollowUpResponse 表示 LLM 理解了结果并生成后续消息
    // 在 mock 环境中可能不会有后续响应，所以这是可选的
    if (commandCount.hasFollowUpResponse) {
      console.log('[E2E] ✅ LLM 生成后续响应，说明理解了工具结果');
    } else {
      console.log('[E2E] ℹ️ LLM 未生成后续响应（在 mock 环境中是正常的）');
    }

    // 主要验证点：命令不重复执行（已通过）
    expect(commandCount.npmDevCount).toBe(1);
  });
});
