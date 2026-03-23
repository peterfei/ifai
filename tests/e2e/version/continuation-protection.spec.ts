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
        // Set a mock custom provider that doesn't need API key
        settingsStore.getState().updateProviderConfig('mock-provider', {
          id: 'mock-provider',
          name: 'Mock Provider',
          enabled: true,
          isCustom: true,
          baseUrl: 'http://localhost:11434'
        });
        settingsStore.getState().setCurrentProviderAndModel('mock-provider', 'mock-model');
        layoutStore.getState().setChatOpen(true);
      }
    });

    const correlationId = 'test-continuation-id';

    // 1. Manually trigger a chat start to initialize listeners
    await page.evaluate(({ cid }) => {
      const chatStore = (window as any).__chatStore.getState();
      const eventBus = (window as any).__chatEventBus;
      
      // Add a message with a tool call to simulate the state before continuation
      chatStore.addMessage({
        id: cid,
        role: 'assistant',
        content: 'I will scan the project...',
        toolCalls: [{
          id: 'call-1',
          type: 'function',
          function: { name: 'agent_scan_project', arguments: '{}' },
          status: 'completed',
          result: '{"status":"success"}'
        }]
      });

      // Start listening for this correlationId
      const streamController = (window as any).__StreamingResponseController;
      streamController.startListening(cid, {
        correlationId: cid,
        sessionId: 'test-session',
        timestamp: Date.now(),
        isContinuation: true
      });
    }, { cid: correlationId });

    // 2. Inject the FIRST chunk via PIVO Bridge
    // This flips hasReceivedChunk to true
    await page.evaluate(({ cid }) => {
      (window as any).__PIVO_BRIDGE__.push(cid, {
        type: 'content',
        content: 'Part 1: '
      });
    }, { cid: correlationId });

    // Verify first chunk is rendered
    await expect(page.locator('text=Part 1:')).toBeVisible();

    // 3. Wait for 7 seconds (exceeding the 5s fast-finish threshold but within 15s protection)
    console.log('[Test] Waiting 7s to see if Fast Finish is incorrectly triggered...');
    await page.waitForTimeout(7000);

    // 4. Inject SECOND chunk
    // If fast finish triggered, this chunk will be orphaned and not rendered
    await page.evaluate(({ cid }) => {
      (window as any).__PIVO_BRIDGE__.push(cid, {
        type: 'content',
        content: 'Part 2: Success'
      });
    }, { cid: correlationId });

    // 5. Verify if Part 2 is rendered
    // If the fix works, Part 2 should appear. If not, the stream was killed at T+5s.
    const messageContent = await page.evaluate(({ cid }) => {
      const messages = (window as any).__chatStore.getState().messages;
      const msg = messages.find(m => m.id === cid);
      return msg?.content || '';
    }, { cid: correlationId });

    console.log('[Test] Final content:', messageContent);
    expect(messageContent).toContain('Part 2: Success');
    
    // 6. Finalize
    await page.evaluate(({ cid }) => {
      (window as any).__PIVO_BRIDGE__.finalize(cid);
    }, { cid: correlationId });
    
    console.log('[Test] ✅ Mock verification passed: Continuation survived the 5s threshold.');
  });
});
