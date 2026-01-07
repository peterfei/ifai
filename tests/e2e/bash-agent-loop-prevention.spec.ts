import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from './setup-utils';

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

    // Monitor for loops
    const startTime = Date.now();
    let loopCount = 0;
    let success = false;
    let finalContent = '';

    while (Date.now() - startTime < 45000) {
      const state = await page.evaluate(() => {
        const msgs = (window as any).__chatStore.getState().messages;
        const last = msgs[msgs.length - 1];
        return {
          count: msgs.length,
          lastRole: last?.role,
          content: last?.content || '',
          toolCalls: last?.toolCalls || [],
          isLoading: (window as any).__chatStore.getState().isLoading
        };
      });

      // We track distinct tool execution cycles by checking message count or tool calls
      // Ideally, we'd check if tool calls are repeating.
      // Here we just check total tool calls in the sequence.
      
      // Simple heuristic: check if finished
      if (!state.isLoading && state.content.length > 20 && state.lastRole === 'assistant') {
          // If content mentions "error" or "failed", it might be a failure but not necessarily a loop.
          // We want to ensure it succeeded.
          finalContent = state.content;
          success = true;
          break;
      }
      
      // Check for excessive message count which indicates looping
      if (state.count > 10) {
          console.error('[E2E] Too many messages, potential loop detected');
          break;
      }

      await page.waitForTimeout(1000);
    }

    expect(success).toBe(true);
    // Verify content contains some expected files (e.g. package.json)
    // or at least doesn't say "I failed" or "retry".
    const hasFile = /package\.json|src|tsconfig/.test(finalContent) || finalContent.includes('tests');
    // If it fell back to bash, that's also "success" in terms of UX, but we want to verify it didn't LOOP.
    // The loop would mean it keeps trying and failing.
    
    console.log('[E2E] Final content:', finalContent);
    expect(hasFile).toBe(true);
  });
});
