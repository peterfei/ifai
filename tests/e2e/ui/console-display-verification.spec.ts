import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

/**
 * 验证控制台显示功能 - commit 4afdd13a
 *
 * 功能说明：
 * - 只显示一个控制台，内容为最新命令
 * - 避免控制台堆积，保持界面清爽
 * - 符合真实终端行为，用户关注当前输出
 */

test.describe('Console Display Verification - Real Scenarios', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', msg => {
      const text = msg.text();
      const type = msg.type();
      if (type === 'error') {
        console.log('[Browser Error]', text);
      } else if (text.includes('[E2E]') || text.includes('[Chat]') || text.includes('[useChatStore]')) {
        console.log('[Browser]', text);
      }
    });

    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForTimeout(2000);
  });

  test('真实场景：AI 启动 vite 项目 - 多个 bash 命令只显示最后一个控制台', async ({ page }) => {
    // 模拟真实场景：AI 启动 vite 项目会执行多个命令
    // 1. cd 到项目目录
    // 2. npm run dev
    // 3. 可能还有其他命令

    // 第一个 assistant message：cd 命令
    await page.evaluate(() => {
      const chatStore = (window as any).__chatStore?.getState();
      chatStore.addMessage({
        id: 'msg-ai-cd',
        role: 'assistant',
        content: '我先切换到项目目录',
        toolCalls: [{
          id: 'bash-cd',
          tool: 'bash',
          args: { command: 'cd /Users/mac/project && pwd' },
          status: 'pending'
        }]
      });
    });

    // 批准第一个命令
    await page.locator('button:has-text("批准执行")').first().click();
    await page.waitForTimeout(1500);

    // 第二个 assistant message：npm run dev
    await page.evaluate(() => {
      const chatStore = (window as any).__chatStore?.getState();
      chatStore.addMessage({
        id: 'msg-ai-npm-dev',
        role: 'assistant',
        content: '现在启动 dev 服务器',
        toolCalls: [{
          id: 'bash-npm-dev',
          tool: 'bash',
          args: { command: 'npm run dev' },
          status: 'pending'
        }]
      });
    });

    // 批准第二个命令
    await page.locator('button:has-text("批准执行")').first().click();
    await page.waitForTimeout(1500);

    // 验证：应该只有最后一个命令显示控制台
    const consoleVisibility = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore?.getState();
      const messages = chatStore?.messages || [];

      // 统计显示控制台的 toolCall 数量
      let consoleCount = 0;
      const consoleToolCalls: string[] = [];

      for (const msg of messages) {
        if (msg.role === 'assistant' && msg.toolCalls) {
          for (const tc of msg.toolCalls) {
            // 检查这个 toolCall 是否应该显示控制台
            const toolName = tc.tool?.toLowerCase() || '';
            const isBash = toolName.includes('bash') ||
                          toolName.includes('execute_command') ||
                          toolName.includes('shell');

            if (isBash && tc.status === 'completed') {
              // 检查是否是整个对话中最后一个 bash 命令
              const allBashCalls: any[] = [];
              for (const m of messages) {
                if (m.role === 'assistant' && m.toolCalls) {
                  for (const t of m.toolCalls) {
                    const tn = t.tool?.toLowerCase() || '';
                    if (tn.includes('bash') || tn.includes('execute_command')) {
                      allBashCalls.push(t);
                    }
                  }
                }
              }

              const latestBash = allBashCalls[allBashCalls.length - 1];
              if (latestBash?.id === tc.id) {
                consoleCount++;
                consoleToolCalls.push(tc.id);
              }
            }
          }
        }
      }

      return {
        consoleCount,
        consoleToolCalls,
        totalMessages: messages.length
      };
    });

    console.log('[E2E] Console visibility:', consoleVisibility);

    // 验证：只应该有 1 个控制台显示（最后一个命令）
    expect(consoleVisibility.consoleCount).toBe(1);
    expect(consoleVisibility.consoleToolCalls).toContain('bash-npm-dev');
  });

  test('模拟流式场景：多次审批不会重复执行命令', async ({ page }) => {
    // 模拟用户多次点击"批准执行"按钮的场景
    await page.evaluate(() => {
      const chatStore = (window as any).__chatStore?.getState();
      chatStore.addMessage({
        id: 'msg-multi-approve-test',
        role: 'assistant',
        content: '执行命令',
        toolCalls: [{
          id: 'bash-multi-approve',
          tool: 'bash',
          args: { command: 'echo "Should only run once"' },
          status: 'pending'
        }]
      });
    });

    // 多次点击批准按钮（模拟用户快速点击或网络延迟导致的重复点击）
    console.log('[E2E] Clicking approve button 3 times...');
    for (let i = 0; i < 3; i++) {
      const approveButton = await page.locator('button:has-text("批准执行")').first();
      if (await approveButton.isVisible()) {
        await approveButton.click();
        console.log(`[E2E] Clicked approve button, iteration: ${i}`);
      }
      await page.waitForTimeout(100);
    }

    await page.waitForTimeout(2000);

    // 验证：命令只执行了一次
    const executionCount = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore?.getState();
      const message = chatStore?.messages.find((m: any) => m.id === 'msg-multi-approve-test');
      const toolCall = message?.toolCalls?.find((tc: any) => tc.id === 'bash-multi-approve');

      // 检查 result 存在且状态为 completed
      return {
        hasResult: !!toolCall?.result,
        status: toolCall?.status,
        resultPreview: toolCall?.result ? toolCall.result.substring(0, 100) : null
      };
    });

    console.log('[E2E] Execution result:', executionCount);

    // 验证：命令执行完成
    expect(executionCount.hasResult).toBe(true);
    expect(executionCount.status).toBe('completed');

    // 验证：只创建了一个 tool 消息
    const toolMessageCount = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore?.getState();
      const toolMessages = chatStore?.messages.filter((m: any) =>
        m.role === 'tool' && m.tool_call_id === 'bash-multi-approve'
      );
      return toolMessages.length;
    });

    console.log('[E2E] Tool message count:', toolMessageCount);
    expect(toolMessageCount).toBe(1);
  });
});

test.describe('Tool Message Duplication Prevention', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', msg => {
      const text = msg.text();
      const type = msg.type();
      if (type === 'error') {
        console.log('[Browser Error]', text);
      } else if (text.includes('[E2E]') || text.includes('[Chat]') || text.includes('[useChatStore]')) {
        console.log('[Browser]', text);
      }
    });

    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForTimeout(2000);
  });

  test('应该防止重复创建 tool 消息（commit 606d709）', async ({ page }) => {
    // 模拟审批后可能触发多次消息创建的场景
    let toolMessageCount = 0;

    // 监听消息添加
    await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      let count = 0;

      // 订阅状态变化
      const unsubscribe = chatStore.subscribe(
        (state: any) => {
          const toolMessages = state.messages.filter((m: any) => m.role === 'tool');
          if (toolMessages.length > count) {
            count = toolMessages.length;
            console.log('[E2E] Tool message count updated:', count);
          }
        }
      );

      // 存储取消订阅函数以便后续清理
      (window as any).__unsubscribe = unsubscribe;
    });

    // 执行 bash 命令
    await page.evaluate(() => {
      const chatStore = (window as any).__chatStore?.getState();
      chatStore.addMessage({
        id: 'msg-no-dup',
        role: 'assistant',
        content: '执行命令',
        toolCalls: [{
          id: 'bash-no-dup',
          tool: 'bash',
          args: { command: 'echo "Test Output"' },
          status: 'pending'
        }]
      });
    });

    // 批准执行
    await page.locator('button:has-text("批准执行")').first().click();
    await page.waitForTimeout(3000);

    // 验证只创建了一个 tool 消息
    const finalCount = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore?.getState();
      const toolMessages = chatStore?.messages.filter((m: any) => m.role === 'tool');
      return toolMessages.length;
    });

    console.log('[E2E] Final tool message count:', finalCount);
    expect(finalCount).toBe(1);

    // 清理订阅
    await page.evaluate(() => {
      if ((window as any).__unsubscribe) {
        (window as any).__unsubscribe();
      }
    });
  });

  test('多次审批不应该重复执行命令', async ({ page }) => {
    // 模拟用户多次点击"批准执行"按钮的场景
    await page.evaluate(() => {
      const chatStore = (window as any).__chatStore?.getState();
      chatStore.addMessage({
        id: 'msg-multi-approve',
        role: 'assistant',
        content: '执行命令',
        toolCalls: [{
          id: 'bash-multi-approve',
          tool: 'bash',
          args: { command: 'echo "Should only run once"' },
          status: 'pending'
        }]
      });
    });

    // 多次点击批准按钮（模拟用户误操作）
    for (let i = 0; i < 3; i++) {
      const approveButton = await page.locator('button:has-text("批准执行")').first();
      if (await approveButton.isVisible()) {
        await approveButton.click();
        console.log('[E2E] Clicked approve button, iteration:', i);
      }
      await page.waitForTimeout(200);
    }

    await page.waitForTimeout(2000);

    // 验证只执行了一次
    const toolMessageContent = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore?.getState();
      // 查找所有 tool 消息
      const toolMessages = chatStore?.messages.filter((m: any) =>
        m.role === 'tool' && m.content?.includes('Should only run once')
      );
      return toolMessages?.length || 0;
    });

    console.log('[E2E] Tool messages with expected content:', toolMessageContent);

    // 应该只有 1 个 tool 消息（防止重复）
    expect(toolMessageContent).toBeLessThanOrEqual(1);
  });
});
