/**
 * Continuation Fast-Finish Protection Mock Test
 * 
 * This test verifies that the "Fast Finish" mechanism does not prematurely
 * terminate a continuation stream during its first 15 seconds.
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

test.describe('Continuation Fast-Finish Protection', () => {
  test('should not trigger fast finish during the first 15s of a continuation', async ({ page }) => {
    await setupE2ETestEnvironment(page, {
      skipWelcome: true,
      useRealAI: false 
    });

    // 0. Ensure Chat Panel is open and configured
    await page.evaluate(() => {
      const layoutStore = (window as any).__layoutStore;
      const settingsStore = (window as any).__settingsStore;
      if (layoutStore && settingsStore) {
        const state = settingsStore.getState();
        // Ensure every provider has an API key so the UI doesn't block
        state.providers.forEach((p: any) => {
          state.updateProviderConfig(p.id, { ...p, apiKey: 'dummy-key', enabled: true });
        });
        
        // 🔥 CRITICAL: Trigger a re-render by toggling something or setting current provider
        state.setCurrentProviderAndModel(state.currentProviderId, state.currentModel);
        
        layoutStore.getState().setChatOpen(true);
      }
    });

    // 1. Send a message to create a real thread and assistant message
    const userMsg = 'Hello mock';
    await page.evaluate((msg) => (window as any).__E2E_SEND__(msg), userMsg);
    
    // Wait for the AI response to appear
    await page.waitForFunction(() => (window as any).__E2E_GET_MESSAGES__().length >= 2, { timeout: 15000 });
    
    const messages = await page.evaluate(() => (window as any).__E2E_GET_MESSAGES__());
    const assistantMsg = messages.find((m: any) => m.role === 'assistant');
    const cid = assistantMsg.id;

    console.log('[Test] Created assistant message with ID:', cid);

    // 2. Start a mock continuation
    await page.evaluate(({ correlationId }) => {
      const streamController = (window as any).__StreamingResponseController;
      streamController.startListening(correlationId, {
        correlationId,
        sessionId: 'test-session',
        timestamp: Date.now(),
        isContinuation: true
      });
    }, { correlationId: cid });

    // 3. Inject the FIRST chunk via PIVO Bridge
    // This flips hasReceivedChunk to true
    await page.evaluate(({ correlationId }) => {
      (window as any).__PIVO_BRIDGE__.push(correlationId, {
        type: 'content',
        content: 'Part 1: '
      });
    }, { correlationId: cid });

    // Verify first chunk is rendered
    await expect(page.locator('text=Part 1:')).toBeVisible();

    // 4. Wait for 7 seconds (exceeding the 5s fast-finish threshold but within 15s protection)
    console.log('[Test] Waiting 7s to see if Fast Finish is incorrectly triggered...');
    await page.waitForTimeout(7000);

    // 5. Inject SECOND chunk
    await page.evaluate(({ correlationId }) => {
      (window as any).__PIVO_BRIDGE__.push(correlationId, {
        type: 'content',
        content: 'Part 2: Success'
      });
    }, { correlationId: cid });

    // 6. Verify if Part 2 is rendered
    await expect(page.locator('text=Part 2: Success')).toBeVisible();
    
    // 7. Finalize
    await page.evaluate(({ correlationId }) => {
      (window as any).__PIVO_BRIDGE__.finalize(correlationId);
    }, { correlationId: cid });
    
    console.log('[Test] ✅ Mock verification passed: Continuation survived the 5s threshold.');
    
    console.log('[Test] ✅ Mock verification passed: Continuation survived the 5s threshold.');
  });
});
