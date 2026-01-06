import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from './setup-utils';

test.describe('Tool Failure and Crash Prevention', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForTimeout(3000);
  });

  test('should handle tool failure and subsequent ai response without crashing', async ({ page }) => {
    // 1. 模拟工具执行失败
    // 我们通过 mockInvoke 来模拟 agent_read_file 抛出错误
    await page.addInitScript(() => {
        const originalInvoke = (window as any).__TAURI__.core.invoke;
        (window as any).__TAURI__.core.invoke = async (cmd: string, args: any) => {
            if (cmd === 'agent_read_file') {
                throw "No such file or directory (os error 2)";
            }
            return originalInvoke(cmd, args);
        };
    });

    // 2. 注入一个待审批的工具调用
    await page.evaluate(() => {
        const store = (window as any).__chatStore;
        const assistantMsgId = 'test-tool-msg';
        store.getState().addMessage({
            id: assistantMsgId,
            role: 'assistant',
            content: 'I will read the file.',
            toolCalls: [{
                id: 'call-1',
                tool: 'agent_read_file',
                args: { rel_path: 'non_existent.js' },
                status: 'pending',
                isPartial: false
            }]
        });
    });

    // 3. 监控控制台错误
    const errors: string[] = [];
    page.on('console', msg => {
        if (msg.type() === 'error') {
            errors.push(msg.text());
            console.log('[Browser Error]', msg.text());
        }
    });

    // 4. 批准工具调用，这会触发失败并自动调用 patchedGenerateResponse
    await page.evaluate(async () => {
        const store = (window as any).__chatStore;
        await store.getState().approveToolCall('test-tool-msg', 'call-1');
    });

    await page.waitForTimeout(2000);

    // 5. 验证是否出现了 match 报错
    const hasMatchError = errors.some(e => e.includes('match is not a function'));
    expect(hasMatchError, 'Should not have "match is not a function" error').toBe(false);

    // 6. 验证 UI 是否还活着（检查输入框是否可用）
    const inputVisible = await page.isVisible('input[placeholder*="Ask"]');
    expect(inputVisible).toBe(true);
  });
});
