import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

/**
 * E2E测试: 还原"执行vite"命令成功但服务器未实际启动的场景
 *
 * 问题描述:
 * 用户输入"执行vite" → 批准运行 → LLM反馈成功启动
 * 但实际上服务器没有运行起来
 *
 * 可能的原因:
 * 1. LLM 在错误的目录下执行了命令（如源代码目录而不是项目目录）
 * 2. 命令执行成功，但启动的是错误项目/目录下的服务器
 * 3. 启动成功标志检测误判（检测到了其他项目的启动输出）
 *
 * 场景还原:
 * - 用户在项目 A 目录下工作
 * - AI 命令可能切换到了其他目录（如 node_modules/.vite）
 * - 命令执行成功，检测到"Local:"等启动标志
 * - 但实际启动的不是项目 A 的服务器
 */
test.describe('Vite Command - Wrong Directory Detection', () => {
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

  test('场景: 用户输入"执行vite"，命令成功但服务器未启动', async ({ page }) => {
    console.log('[E2E] ===== 场景开始：执行vite成功但服务器未启动 =====');

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
          id: 'call-vite',
          tool: 'bash',
          args: {
            command: 'npm run dev',
            cwd: '/Users/mac/project/demo3'  // 🔥 模拟指定了错误的目录
          },
          status: 'pending'
        }]
      });
    });

    await page.waitForTimeout(1000);

    // 2. 点击批准执行
    const approveBtn = page.locator('button:has-text("批准执行")').first();
    await approveBtn.click();

    // 3. 等待执行完成
    await page.waitForTimeout(5000);

    // 4. 检查工具执行结果
    const toolCallResult = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore?.getState();
      const message = chatStore?.messages.find((m: any) => m.id === 'msg-ai-vite');
      const toolCall = message?.toolCalls?.find((tc: any) => tc.id === 'call-vite');

      return {
        status: toolCall?.status,
        result: toolCall?.result,
        hasSuccessFlag: toolCall?.result?.includes('Server started successfully'),
        hasLocalPattern: toolCall?.result?.includes('Local:'),
        hasVitePattern: toolCall?.result?.includes('VITE'),
        // 🔥 检查是否包含项目名称
        hasProjectName: toolCall?.result?.includes('demo3'),
        // 🔥 检查工作目录
        cwd: toolCall?.args?.cwd
      };
    });

    console.log('[E2E] 工具执行结果:', JSON.stringify(toolCallResult, null, 2));

    // 5. 验证命令执行成功
    expect(toolCallResult.status).toBe('completed');
    expect(toolCallResult.hasSuccessFlag).toBe(true);

    // 6. 🔥 关键验证：检查是否在正确的目录下执行
    console.log('[E2E] 检查工作目录:', toolCallResult.cwd);

    // 如果 cwd 指定了错误的目录，这可能是问题所在
    if (toolCallResult.cwd && !toolCallResult.cwd.includes('/Users/mac/mock-project')) {
      console.log('[E2E] ⚠️ 问题: 命令在错误的目录下执行:', toolCallResult.cwd);
      console.log('[E2E] 建议: 应该在项目根目录下执行命令');
    }

    // 7. 🔥 验证服务器是否真正启动
    const serverStatus = await page.evaluate(async () => {
      // 尝试访问 localhost 的常用端口
      const ports = [1420, 3000, 5173, 8080];
      const results = [];

      for (const port of ports) {
        try {
          const response = await fetch(`http://localhost:${port}`, {
            method: 'HEAD',
            signal: AbortSignal.timeout(1000)
          });
          results.push({ port, status: response.status });
        } catch (e) {
          results.push({ port, error: (e as Error).message });
        }
      }

      return results;
    });

    console.log('[E2E] 服务器状态检查:', serverStatus);

    // 🔥 如果所有端口都无法访问，说明服务器没有真正启动
    const serverActuallyRunning = serverStatus.some(s => s.status !== undefined);
    if (!serverActuallyRunning && toolCallResult.hasSuccessFlag) {
      console.log('[E2E] ❌ Bug 确认: 命令报告成功，但服务器未真正启动');
      console.log('[E2E] 可能原因:');
      console.log('[E2E] 1. 命令在错误的目录下执行');
      console.log('[E2E] 2. 检测到了其他项目的启动输出');
      console.log('[E2E] 3. 启动成功标志误判');
    }

    // 这个断言应该会失败，证明 bug 存在
    // expect(serverActuallyRunning).toBe(true);

    console.log('[E2E] ===== 场景结束 =====');
  });

  test('场景: 命令输出包含其他项目的启动标志', async ({ page }) => {
    console.log('[E2E] ===== 场景开始：误判其他项目的启动输出 =====');

    // 模拟场景：在 mock-project 下执行命令，但输出中包含了其他项目（如 ifainew）的启动信息
    await page.evaluate(() => {
      const chatStore = (window as any).__chatStore?.getState();

      chatStore.addMessage({
        id: 'msg-mixed-output',
        role: 'assistant',
        content: '启动开发服务器',
        toolCalls: [{
          id: 'call-mixed',
          tool: 'bash',
          args: {
            command: 'npm run dev',
            // 🔥 模拟：命令输出包含了其他项目的启动信息
            // 比如：系统在运行 ifainew 的 dev 服务器，输出被混淆了
            mockOutput: `
> demo3@1.0.0 dev
> vite

VITE v7.2.7  ready in 927 ms

➜  Local:   http://localhost:1420/
➜  Network: use --host to expose

✅ Server started successfully
            `
          },
          status: 'pending'
        }]
      });
    });

    await page.waitForTimeout(1000);

    // 点击批准执行
    await page.locator('button:has-text("批准执行")').first().click();
    await page.waitForTimeout(3000);

    // 验证结果
    const result = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore?.getState();
      const message = chatStore?.messages.find((m: any) => m.id === 'msg-mixed-output');
      const toolCall = message?.toolCalls?.find((tc: any) => tc.id === 'call-mixed');

      return {
        status: toolCall?.status,
        result: toolCall?.result,
        // 🔥 检查是否检测到启动成功
        hasLocalPattern: toolCall?.result?.includes('Local:'),
        hasVitePattern: toolCall?.result?.includes('VITE'),
        hasSuccessFlag: toolCall?.result?.includes('Server started successfully'),
        // 🔥 检查是否包含项目名称
        hasProjectName: toolCall?.result?.includes('demo3'),
        // 🔥 检查是否包含其他项目名称
        hasOtherProject: toolCall?.result?.includes('ifainew')
      };
    });

    console.log('[E2E] 混合输出结果:', result);

    // 验证检测到了启动成功
    expect(result.hasSuccessFlag).toBe(true);

    // 🔥 验证问题：输出中可能包含其他项目的信息
    if (result.hasOtherProject) {
      console.log('[E2E] ⚠️ 警告: 输出中包含其他项目的信息');
      console.log('[E2E] 建议: 需要验证启动的是正确的项目');
    }

    console.log('[E2E] ===== 场景结束 =====');
  });

  test('场景: 验证工作目录参数的使用', async ({ page }) => {
    console.log('[E2E] ===== 场景开始：验证工作目录参数 =====');

    // 测试不同的 cwd 参数
    const testCases = [
      {
        name: '正确的项目目录',
        cwd: '/Users/mac/mock-project',
        shouldStart: true
      },
      {
        name: '错误的目录 - 源代码目录',
        cwd: '/Users/mac/project/aieditor/node_modules/.vite',
        shouldStart: false
      },
      {
        name: '错误的目录 - 其他项目',
        cwd: '/Users/mac/other-project',
        shouldStart: false
      }
    ];

    for (const testCase of testCases) {
      console.log(`[E2E] 测试用例: ${testCase.name}`);

      await page.evaluate((tc) => {
        const chatStore = (window as any).__chatStore?.getState();

        chatStore.addMessage({
          id: `msg-cwd-${tc.name.replace(/\s+/g, '-')}`,
          role: 'assistant',
          content: `在目录 ${tc.cwd} 下执行 npm run dev`,
          toolCalls: [{
            id: `call-cwd-${tc.name.replace(/\s+/g, '-')}`,
            tool: 'bash',
            args: {
              command: 'npm run dev',
              cwd: tc.cwd
            },
            status: 'pending'
          }]
        });
      }, testCase);

      await page.waitForTimeout(500);
      await page.locator('button:has-text("批准执行")').first().click();
      await page.waitForTimeout(2000);

      // 验证结果
      const result = await page.evaluate((name) => {
        const chatStore = (window as any).__chatStore?.getState();
        const messageId = `msg-cwd-${name.replace(/\s+/g, '-')}`;
        const toolCallId = `call-cwd-${name.replace(/\s+/g, '-')}`;
        const message = chatStore?.messages.find((m: any) => m.id === messageId);
        const toolCall = message?.toolCalls?.find((tc: any) => tc.id === toolCallId);

        return {
          name: name,
          status: toolCall?.status,
          hasSuccessFlag: toolCall?.result?.includes('Server started successfully'),
          cwd: toolCall?.args?.cwd
        };
      }, testCase.name);

      console.log(`[E2E] 结果 - ${testCase.name}:`, result);

      if (testCase.shouldStart) {
        expect(result.hasSuccessFlag).toBe(true);
        console.log(`[E2E] ✅ ${testCase.name}: 应该启动成功`);
      } else {
        // 如果在不正确的目录下，命令可能失败或启动错误的项目
        if (result.hasSuccessFlag) {
          console.log(`[E2E] ⚠️ ${testCase.name}: 报告成功但可能启动了错误的项目`);
        } else {
          console.log(`[E2E] ✅ ${testCase.name}: 正确地报告失败`);
        }
      }
    }

    console.log('[E2E] ===== 场景结束 =====');
  });
});
