import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from './setup-utils';

/**
 * Bash 工具结果传递测试
 *
 * 问题：bash 命令执行有返回结果，但 content 没有正确显示，
 * 导致 LLM 看不到结果而重复执行相同的命令。
 *
 * 期望：
 * 1. Bash 命令执行后，工具结果消息应该包含命令的实际输出
 * 2. LLM 能够看到输出内容，不会重复执行
 */
test.describe('Bash Tool Result - Content Display', () => {

  test.beforeEach(async ({ page }) => {
    // 设置控制台监听
    page.on('console', msg => {
      const text = msg.text();
      const type = msg.type();
      if (type === 'error') {
        console.log('[Browser Error]', text);
      } else if (text.includes('[E2E]') || text.includes('[Chat]')) {
        console.log('[Browser]', text);
      }
    });

    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForTimeout(5000);

    // 打开聊天面板
    await page.evaluate(() => {
      const layoutStore = (window as any).__layoutStore;
      if (layoutStore && !layoutStore.getState().isChatOpen) {
        layoutStore.getState().toggleChat();
      }
    });
    await page.waitForTimeout(2000);

    // 等待 store 可用
    for (let i = 0; i < 3; i++) {
      await page.waitForTimeout(2000);
      const hasChatStore = await page.evaluate(() => {
        const store = (window as any).__chatStore;
        return store && typeof store.getState === 'function';
      });
      if (hasChatStore) break;
    }
  });

  test('bash 命令结果应该包含实际输出内容', async ({ page }) => {
    const testCommand = 'echo "Hello World"';
    const expectedOutput = 'Hello World';

    // 1. 添加包含 bash 工具调用的消息
    await page.evaluate(({ command }) => {
      const chatStore = (window as any).__chatStore?.getState();
      chatStore.addMessage({
        id: 'msg-bash-test',
        role: 'assistant',
        content: '我会执行一个命令',
        toolCalls: [{
          id: 'bash-call-1',
          tool: 'bash',
          args: { command: command },
          status: 'pending'
        }]
      });
    }, { command: testCommand });

    // 2. 批准执行
    await page.locator('button:has-text("批准执行")').first().click();
    await page.waitForTimeout(2000);

    // 3. 验证工具调用状态变为 completed
    const toolCallStatus = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore?.getState();
      const msg = chatStore?.messages.find((m: any) => m.id === 'msg-bash-test');
      return msg?.toolCalls?.[0]?.status;
    });
    expect(toolCallStatus).toBe('completed');

    // 4. 🔥 关键验证：工具结果应该包含实际输出
    const toolCallResult = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore?.getState();
      const msg = chatStore?.messages.find((m: any) => m.id === 'msg-bash-test');
      return msg?.toolCalls?.[0]?.result;
    });
    console.log('[E2E] Bash tool result:', toolCallResult);

    // 5. 验证结果中包含预期的输出
    expect(toolCallResult).toBeTruthy();
    expect(toolCallResult).toContain(expectedOutput);

    // 6. 🔥 验证有 tool 角色的消息，且内容包含输出
    const toolMessageContent = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore?.getState();
      const toolMsg = chatStore?.messages.find((m: any) =>
        m.tool_call_id === 'bash-call-1' && m.role === 'tool'
      );
      return toolMsg?.content;
    });
    console.log('[E2E] Tool message content:', toolMessageContent);

    // 工具消息应该包含实际输出，而不只是 "Command completed"
    expect(toolMessageContent).toBeTruthy();
    expect(toolMessageContent).toContain(expectedOutput);
  });

  test('bash 命令失败时应该包含错误输出', async ({ page }) => {
    const testCommand = 'ls /nonexistent_directory_12345';
    const expectedError = 'No such file';

    // 添加包含 bash 工具调用的消息（会失败的命令）
    await page.evaluate(({ command }) => {
      const chatStore = (window as any).__chatStore?.getState();
      chatStore.addMessage({
        id: 'msg-bash-fail',
        role: 'assistant',
        content: '我会列出一个不存在的目录',
        toolCalls: [{
          id: 'bash-call-fail',
          tool: 'bash',
          args: { command: command },
          status: 'pending'
        }]
      });
    }, { command: testCommand });

    // 批准执行
    await page.locator('button:has-text("批准执行")').first().click();
    await page.waitForTimeout(2000);

    // 验证工具调用状态变为 completed（虽然失败，但状态还是完成）
    const toolCallStatus = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore?.getState();
      const msg = chatStore?.messages.find((m: any) => m.id === 'msg-bash-fail');
      return msg?.toolCalls?.[0]?.status;
    });
    expect(toolCallStatus).toBe('completed');

    // 🔥 验证错误消息包含错误信息
    const toolMessageContent = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore?.getState();
      const toolMsg = chatStore?.messages.find((m: any) =>
        m.tool_call_id === 'bash-call-fail' && m.role === 'tool'
      );
      return toolMsg?.content;
    });
    console.log('[E2E] Error tool message:', toolMessageContent);

    // 应该包含错误信息，而不只是 "Command completed"
    expect(toolMessageContent).toBeTruthy();
    // 即使命令失败，也应该有输出（stderr）
    expect(toolMessageContent.length).toBeGreaterThan(20);
  });

  test('多个 bash 命令应该都有正确的输出', async ({ page }) => {
    const commands = [
      { cmd: 'echo "First"', expected: 'First' },
      { cmd: 'echo "Second"', expected: 'Second' },
      { cmd: 'echo "Third"', expected: 'Third' }
    ];

    // 添加包含多个 bash 工具调用的消息
    await page.evaluate(({ cmds }) => {
      const chatStore = (window as any).__chatStore?.getState();
      chatStore.addMessage({
        id: 'msg-multi-bash',
        role: 'assistant',
        content: '我会执行多个命令',
        toolCalls: cmds.map((c, i) => ({
          id: `bash-call-${i}`,
          tool: 'bash',
          args: { command: c.cmd },
          status: 'pending'
        }))
      });
    }, { cmds: commands });

    // 批准所有工具调用 - 每次点击第一个可见的按钮
    for (let i = 0; i < commands.length; i++) {
      // 等待按钮出现
      await page.waitForSelector('button:has-text("批准执行")', { timeout: 5000 });
      // 点击第一个（当前可见的）按钮
      await page.locator('button:has-text("批准执行")').first().click();
      await page.waitForTimeout(500);
    }
    await page.waitForTimeout(2000);

    // 验证每个命令都有正确的输出
    for (let i = 0; i < commands.length; i++) {
      const toolMessageContent = await page.evaluate(({ index }) => {
        const chatStore = (window as any).__chatStore?.getState();
        const toolMsg = chatStore?.messages.find((m: any) =>
          m.tool_call_id === `bash-call-${index}` && m.role === 'tool'
        );
        return toolMsg?.content;
      }, { index: i });

      console.log(`[E2E] Command ${i} tool message:`, toolMessageContent);
      expect(toolMessageContent).toBeTruthy();
      expect(toolMessageContent).toContain(commands[i].expected);
    }
  });

  test('bash 命令输出不应只是 "Command completed"', async ({ page }) => {
    // 这个测试专门验证问题：输出不能只是 "Command completed. Exit code: 0"
    const testCommand = 'echo "Test Output"';
    const expectedOutput = 'Test Output';

    await page.evaluate(({ command }) => {
      const chatStore = (window as any).__chatStore?.getState();
      chatStore.addMessage({
        id: 'msg-verify',
        role: 'assistant',
        content: '执行命令',
        toolCalls: [{
          id: 'bash-verify',
          tool: 'bash',
          args: { command: command },
          status: 'pending'
        }]
      });
    }, { command: testCommand });

    await page.locator('button:has-text("批准执行")').first().click();
    await page.waitForTimeout(2000);

    const toolMessageContent = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore?.getState();
      const toolMsg = chatStore?.messages.find((m: any) =>
        m.tool_call_id === 'bash-verify' && m.role === 'tool'
      );
      return toolMsg?.content;
    });

    console.log('[E2E] Tool message content:', toolMessageContent);

    // 🔥 关键断言：不能只是 "Command completed" 这样的消息
    expect(toolMessageContent).toBeTruthy();
    expect(toolMessageContent).not.toBe('Command completed. Exit code: 0');
    expect(toolMessageContent).not.toBe('Command completed. Exit code: 1');
    expect(toolMessageContent).toContain(expectedOutput);
  });

  test('bash 命令输出应该包含 stdout 和 stderr（如果有）', async ({ page }) => {
    // 这个命令会产生 stdout 和 stderr
    const testCommand = 'echo "stdout message" && echo "stderr message" >&2';

    await page.evaluate(({ command }) => {
      const chatStore = (window as any).__chatStore?.getState();
      chatStore.addMessage({
        id: 'msg-both',
        role: 'assistant',
        content: '执行命令',
        toolCalls: [{
          id: 'bash-both',
          tool: 'bash',
          args: { command: command },
          status: 'pending'
        }]
      });
    }, { command: testCommand });

    await page.locator('button:has-text("批准执行")').first().click();
    await page.waitForTimeout(2000);

    const toolMessageContent = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore?.getState();
      const toolMsg = chatStore?.messages.find((m: any) =>
        m.tool_call_id === 'bash-both' && m.role === 'tool'
      );
      return toolMsg?.content;
    });

    console.log('[E2E] Tool message with stdout/stderr:', toolMessageContent);

    // 应该包含 stdout 和 stderr 的内容
    expect(toolMessageContent).toBeTruthy();
    expect(toolMessageContent).toContain('stdout message');
    expect(toolMessageContent).toContain('stderr message');
  });
});
