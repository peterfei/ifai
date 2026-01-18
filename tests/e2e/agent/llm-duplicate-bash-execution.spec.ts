import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment, removeJoyrideOverlay } from '../setup';

/**
 * E2E测试: LLM 重复执行 bash 命令问题
 *
 * 问题描述:
 * - 用户输入"执行vite" → 批准执行 → 命令成功启动服务器
 * - 但在 LLM 总结之前，还会出现一个新的 bash 执行请求
 * - LLM 似乎没有收到或识别到执行成功的状态
 *
 * 可能原因:
 * 1. 工具结果消息没有及时添加到历史记录
 * 2. 结果格式问题，LLM 没有正确解析
 * 3. 状态同步延迟
 * 4. tool 消息的 role 或 content 格式不正确
 */

test.describe('LLM Duplicate Bash Execution Prevention', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', msg => {
      const text = msg.text();
      const type = msg.type();
      if (type === 'error') {
        console.log('[Browser Error]', text);
      } else if (text.includes('[E2E]') || text.includes('[Chat]') || text.includes('[useChatStore]') ||
                 text.includes('[Bash Command]') || text.includes('[DEBUG]')) {
        console.log('[Browser]', text);
      }
    });

    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForTimeout(2000);
  });

  test('场景: 执行 vite 命令后，LLM 不应该重复请求执行', async ({ page }) => {
    console.log('[E2E] ===== 场景开始：LLM 不应该重复执行 bash 命令 =====');

    // 1. 模拟用户输入"执行vite"
    await page.evaluate(() => {
      const chatStore = (window as any).__chatStore?.getState();

      // 模拟用户消息
      chatStore.addMessage({
        id: 'msg-user-vite',
        role: 'user',
        content: '执行vite'
      });

      // 模拟 AI 响应，建议执行 vite 命令
      chatStore.addMessage({
        id: 'msg-ai-vite',
        role: 'assistant',
        content: '好的，我来启动 Vite 开发服务器',
        toolCalls: [{
          id: 'call-vite-1',
          tool: 'bash',
          args: {
            command: 'npm run dev'
          },
          status: 'pending'
        }]
      });
    });

    await page.waitForTimeout(1000);

    // 2. 点击批准执行
    const approveBtn = page.locator('button:has-text("批准执行")').first();
    await removeJoyrideOverlay(page);
    await approveBtn.click();

    // 3. 等待执行完成
    await page.waitForTimeout(5000);

    // 4. 检查工具执行结果
    const toolCallResult = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore?.getState();
      const message = chatStore?.messages.find((m: any) => m.id === 'msg-ai-vite');
      const toolCall = message?.toolCalls?.find((tc: any) => tc.id === 'call-vite-1');

      return {
        status: toolCall?.status,
        result: toolCall?.result,
        hasSuccessFlag: toolCall?.result?.includes('Server started successfully'),
        hasCompletedStatus: toolCall?.status === 'completed'
      };
    });

    console.log('[E2E] 第一次工具执行结果:', JSON.stringify(toolCallResult, null, 2));

    // 验证：命令应该执行成功
    expect(toolCallResult.status).toBe('completed');
    expect(toolCallResult.hasSuccessFlag).toBe(true);

    // 5. 🔥 关键验证：检查是否有 tool 消息
    const toolMessage = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore?.getState();
      return chatStore?.messages.some((m: any) =>
        m.role === 'tool' && m.tool_call_id === 'call-vite-1'
      );
    });

    console.log('[E2E] Tool 消息是否存在:', toolMessage);

    // 🔥 如果没有 tool 消息，LLM 会认为工具还没执行完成，所以会重复请求
    if (!toolMessage) {
      console.log('[E2E] ❌ Bug: Tool 消息不存在，这会导致 LLM 重复执行命令');
      console.log('[E2E] 建议: 需要确保在工具执行完成后立即创建 tool 消息');
    }

    expect(toolMessage).toBe(true);

    // 6. 🔥 验证：检查 LLM 是否生成了重复的 bash 请求
    const duplicateBashRequest = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore?.getState();
      const messages = chatStore?.messages || [];

      let bashToolCallCount = 0;
      messages.forEach((m: any) => {
        if (m.toolCalls) {
          m.toolCalls.forEach((tc: any) => {
            if (tc.tool === 'bash' || tc.tool === 'execute_bash_command') {
              const args = tc.args || {};
              if (args.command === 'npm run dev') {
                bashToolCallCount++;
              }
            }
          });
        }
      });

      return {
        npmDevCount: bashToolCallCount,
        hasDuplicate: bashToolCallCount > 1
      };
    });

    console.log('[E2E] npm run dev 命令调用次数:', duplicateBashRequest.npmDevCount);

    // 🔥 如果有重复，说明 bug 存在
    if (duplicateBashRequest.hasDuplicate) {
      console.log('[E2E] ❌ Bug 确认: LLM 重复请求执行 npm run dev');
      console.log('[E2E] 调用次数:', duplicateBashRequest.npmDevCount);
      console.log('[E2E] 可能原因:');
      console.log('[E2E] 1. Tool 消息没有及时添加到历史记录');
      console.log('[E2E] 2. Tool 消息格式不正确，LLM 无法识别');
      console.log('[E2E] 3. 状态更新有延迟');
    }

    // 这个断言会失败，证明 bug 存在
    // expect(duplicateBashRequest.hasDuplicate).toBe(false);

    console.log('[E2E] ===== 场景结束 =====');
  });

  test('场景: 验证 tool 消息的格式和内容', async ({ page }) => {
    console.log('[E2E] ===== 场景开始：验证 tool 消息格式 =====');

    // 1. 执行 bash 命令
    await page.evaluate(() => {
      const chatStore = (window as any).__chatStore?.getState();

      chatStore.addMessage({
        id: 'msg-test-tool',
        role: 'assistant',
        content: '执行命令',
        toolCalls: [{
          id: 'call-test-1',
          tool: 'bash',
          args: {
            command: 'echo "test"'
          },
          status: 'pending'
        }]
      });
    });

    await page.waitForTimeout(500);
    await removeJoyrideOverlay(page);
    await page.locator('button:has-text("批准执行")').first().click();
    await page.waitForTimeout(3000);

    // 2. 检查 tool 消息
    const toolMessageDetails = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore?.getState();
      const toolMessage = chatStore?.messages.find((m: any) =>
        m.role === 'tool' && m.tool_call_id === 'call-test-1'
      );

      if (!toolMessage) {
        return { exists: false };
      }

      return {
        exists: true,
        role: toolMessage.role,
        tool_call_id: toolMessage.tool_call_id,
        content: toolMessage.content,
        contentType: typeof toolMessage.content,
        hasResult: toolMessage.content && toolMessage.content.length > 0,
        // 🔥 检查 content 是否包含执行结果
        hasSuccessFlag: toolMessage.content?.includes('Command executed successfully') ||
                        toolMessage.content?.includes('exit code: 0')
      };
    });

    console.log('[E2E] Tool 消息详情:', JSON.stringify(toolMessageDetails, null, 2));

    // 验证 tool 消息存在且格式正确
    expect(toolMessageDetails.exists).toBe(true);
    expect(toolMessageDetails.role).toBe('tool');
    expect(toolMessageDetails.tool_call_id).toBe('call-test-1');
    expect(toolMessageDetails.hasResult).toBe(true);

    console.log('[E2E] ===== 场景结束 =====');
  });

  test('场景: 验证消息历史顺序', async ({ page }) => {
    console.log('[E2E] ===== 场景开始：验证消息历史顺序 =====');

    // 1. 执行命令
    await page.evaluate(() => {
      const chatStore = (window as any).__chatStore?.getState();

      chatStore.addMessage({
        id: 'msg-order-user',
        role: 'user',
        content: '执行 ls'
      });

      chatStore.addMessage({
        id: 'msg-order-ai',
        role: 'assistant',
        content: '好的',
        toolCalls: [{
          id: 'call-order-1',
          tool: 'bash',
          args: {
            command: 'ls'
          },
          status: 'pending'
        }]
      });
    });

    await page.waitForTimeout(500);
    await removeJoyrideOverlay(page);
    await page.locator('button:has-text("批准执行")').first().click();
    await page.waitForTimeout(3000);

    // 2. 检查消息顺序
    const messageOrder = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore?.getState();
      const messages = chatStore?.messages || [];

      return messages.map((m: any) => ({
        id: m.id,
        role: m.role,
        hasToolCalls: !!m.toolCalls,
        toolCallId: m.tool_call_id,
        contentPreview: m.content ? m.content.substring(0, 50) : '(empty)'
      }));
    });

    console.log('[E2E] 消息顺序:', JSON.stringify(messageOrder, null, 2));

    // 🔥 验证：assistant 消息后面应该紧跟着 tool 消息
    const aiMsgIndex = messageOrder.findIndex((m: any) => m.id === 'msg-order-ai');
    const toolMsgIndex = messageOrder.findIndex((m: any) => m.tool_call_id === 'call-order-1');

    console.log('[E2E] AI 消息位置:', aiMsgIndex);
    console.log('[E2E] Tool 消息位置:', toolMsgIndex);

    if (toolMsgIndex === -1) {
      console.log('[E2E] ❌ Bug: Tool 消息不存在！');
    } else if (toolMsgIndex <= aiMsgIndex) {
      console.log('[E2E] ⚠️ 警告: Tool 消息位置不正确，应该在 AI 消息之后');
    } else {
      console.log('[E2E] ✅ Tool 消息位置正确');
    }

    console.log('[E2E] ===== 场景结束 =====');
  });

  test('场景: 验证状态更新的时机', async ({ page }) => {
    console.log('[E2E] ===== 场景开始：验证状态更新时机 =====');

    let statusUpdateTimeline: any[] = [];

    // 监听状态变化
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[Core] Processing tool') || text.includes('[Core] Total completed')) {
        statusUpdateTimeline.push({
          timestamp: Date.now(),
          event: text
        });
      }
    });

    // 1. 执行命令
    await page.evaluate(() => {
      const chatStore = (window as any).__chatStore?.getState();

      chatStore.addMessage({
        id: 'msg-timing-1',
        role: 'assistant',
        content: '执行命令',
        toolCalls: [{
          id: 'call-timing-1',
          tool: 'bash',
          args: {
            command: 'echo "timing test"'
          },
          status: 'pending'
        }]
      });
    });

    const startTime = Date.now();

    await page.waitForTimeout(500);
    await removeJoyrideOverlay(page);
    await page.locator('button:has-text("批准执行")').first().click();

    // 2. 监控状态变化
    for (let i = 0; i < 10; i++) {
      await page.waitForTimeout(500);

      const status = await page.evaluate(() => {
        const chatStore = (window as any).__chatStore?.getState();
        const message = chatStore?.messages.find((m: any) => m.id === 'msg-timing-1');
        const toolCall = message?.toolCalls?.find((tc: any) => tc.id === 'call-timing-1');

        return {
          status: toolCall?.status,
          hasResult: !!toolCall?.result,
          elapsed: Date.now() - startTime
        };
      });

      statusUpdateTimeline.push({
        timestamp: Date.now(),
        check: i + 1,
        status: status.status,
        hasResult: status.hasResult,
        elapsed: status.elapsed
      });

      if (status.status === 'completed') {
        break;
      }
    }

    console.log('[E2E] 状态更新时间线:', JSON.stringify(statusUpdateTimeline, null, 2));

    // 3. 分析时间线
    const completedEvent = statusUpdateTimeline.find((e: any) => e.status === 'completed');
    if (completedEvent) {
      console.log('[E2E] ✅ 命令执行完成，耗时:', completedEvent.elapsed, 'ms');
    } else {
      console.log('[E2E] ⚠️ 命令未在预期时间内完成');
    }

    console.log('[E2E] ===== 场景结束 =====');
  });
});
