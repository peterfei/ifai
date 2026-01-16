import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

test.describe('Agent Loop Prevention - Directory Listing', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForTimeout(2000);
  });

  test('should list directory using agent_list_dir without looping', async ({ page }) => {
    test.setTimeout(60000);

    // Enable auto-approve to let the agent run freely
    await page.evaluate(async () => {
      const settings = (window as any).__settingsStore;
      if (settings) {
        settings.setState({ agentAutoApprove: true });
      }
    });

    // Ask to list directory explicitly to trigger agent_list_dir
    // We use a phrase that likely triggers the internal tool, not bash
    // "使用 agent_list_dir 列出当前目录下的文件" means "Use agent_list_dir to list files in current directory"
    await page.evaluate(async () => {
      await (window as any).__E2E_SEND__('使用 agent_list_dir 列出当前目录下的文件');
    });

    // Monitor for loops by tracking total tool calls across all messages
    const startTime = Date.now();
    let maxMessages = 0;
    let totalToolCalls = 0;
    let finalContent = '';
    let finished = false;

    while (Date.now() - startTime < 45000) {
      const state = await page.evaluate(() => {
        const msgs = (window as any).__chatStore.getState().messages;
        const last = msgs[msgs.length - 1];

        // Count total tool calls across all messages
        let toolCallCount = 0;
        for (const msg of msgs) {
          if (msg.toolCalls && msg.toolCalls.length > 0) {
            toolCallCount += msg.toolCalls.length;
          }
        }

        return {
          messageCount: msgs.length,
          lastRole: last?.role,
          content: last?.content || '',
          totalToolCalls: toolCallCount,
          isLoading: (window as any).__chatStore.getState().isLoading
        };
      });

      maxMessages = Math.max(maxMessages, state.messageCount);
      totalToolCalls = state.totalToolCalls;

      // Success criteria: loading finished with some response
      if (!state.isLoading && state.content.length > 5 && state.lastRole === 'assistant') {
        finalContent = state.content;
        finished = true;
        break;
      }

      // Check for excessive message count which indicates looping
      if (state.messageCount > 10) {
        console.error('[E2E] Too many messages, potential loop detected');
        break;
      }

      await page.waitForTimeout(1000);
    }

    console.log('[E2E] Final content:', finalContent);
    console.log('[E2E] Total messages:', maxMessages);
    console.log('[E2E] Total tool calls:', totalToolCalls);

    // Primary assertion: Agent finished without looping
    expect(finished).toBe(true);

    // Loop prevention: Should not have excessive tool calls (5 is a reasonable threshold)
    expect(totalToolCalls).toBeLessThanOrEqual(5);

    // Verify the response is valid (either file listing OR intent recognition)
    const hasFile = /package\.json|src|tsconfig|tests/.test(finalContent);
    const hasIntent = finalContent.includes('自动识别意图') || finalContent.includes('Explore');

    // Accept either file listing or intent recognition as valid
    expect(hasFile || hasIntent).toBe(true);
  });
});
