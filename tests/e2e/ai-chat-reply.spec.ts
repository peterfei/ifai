/**
 * AI 面板回复 E2E 测试
 *
 * 测试场景：
 * 1. 发送 /task:start 命令触发 AI 回复
 * 2. 检测虚拟滚动是否正确启用（消息数 >= 15）
 * 3. 检测流式回复过程中是否有闪屏现象
 * 4. 验证消息内容正确渲染
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from './setup-utils';

test.describe('AI Chat Reply & Virtual Scrolling', () => {
  test.beforeEach(async ({ page }) => {
    // 1. Skip onboarding & Configure Ollama as default
    await setupE2ETestEnvironment(page);

    await page.goto('/');

    // Wait for app to be ready
    await page.waitForTimeout(1000);
  });

  test('should send /task:start command and receive AI reply', async ({ page }) => {
    // AI Chat panel is open by default via setupE2ETestEnvironment

    // Step 1: Get the chat input
    const chatInput = page.locator('input[placeholder*="询问 DeepSeek"], input[type="text"]').last();
    await expect(chatInput).toBeVisible({ timeout: 10000 });

    // Step 3: Type /task:start command
    await chatInput.fill('/task:start 1');
    await page.waitForTimeout(200);

    // Step 4: Send the command
    const sendButton = page.locator('button:has-text("Send"), button.bg-blue-600').last();
    await sendButton.click();

    // Step 5: Verify user message appears
    const userMessage = page.locator('text=/task:start 1');
    await expect(userMessage).toBeVisible({ timeout: 5000 });

    // Step 6: Wait for AI response (may take a while)
    // Look for assistant message with content
    await page.waitForTimeout(3000);

    const assistantMessages = page.locator('.bg-\[\#252526\], [class*="assistantBubble"]');
    const messageCount = await assistantMessages.count();

    console.log(`[E2E] Found ${messageCount} assistant messages`);

    // Verify at least one assistant message appears
    expect(messageCount).toBeGreaterThan(0);
  });

  test('should detect virtual scrolling activation with 15+ messages', async ({ page }) => {
    // Open AI Chat panel (already open)
    const chatInput = page.locator('input[placeholder*="询问 DeepSeek"], input[type="text"]').last();
    await expect(chatInput).toBeVisible({ timeout: 10000 });
    const sendButton = page.locator('button.bg-blue-600').last();

    // Send multiple messages to trigger virtual scrolling (need 15+ messages)
    for (let i = 1; i <= 16; i++) {
      await chatInput.fill(`test message ${i}`);
      await sendButton.click();
      await page.waitForTimeout(100);
    }

    // Wait for messages to be rendered
    await page.waitForTimeout(1000);

    // Count visible message elements
    const allMessages = page.locator('[class*="message"], [class*="MessageItem"], .space-y-4 > div');
    const visibleCount = await allMessages.count();

    console.log(`[E2E] Total messages: ${visibleCount}`);

    // With virtual scrolling, we should see approximately 15-20 messages visible
    expect(visibleCount).toBeGreaterThanOrEqual(16);
  });

  test('should detect flickering during streaming response', async ({ page }) => {
    // Open AI Chat panel (already open)
    const chatInput = page.locator('input[placeholder*="询问 DeepSeek"], input[type="text"]').last();
    await expect(chatInput).toBeVisible({ timeout: 10000 });
    const sendButton = page.locator('button.bg-blue-600').last();

    // Setup flicker detection
    const scrollContainer = page.locator('.min-h-0.overflow-auto').last();
    let flickerCount = 0;

    // Monitor scroll height changes during streaming
    scrollContainer.evaluate((element: any) => {
      window.__flickerEvents = [];
      let lastScrollHeight = element.scrollHeight;
      let lastTime = Date.now();

      const observer = new MutationObserver(() => {
        const currentTime = Date.now();
        const currentScrollHeight = element.scrollHeight;

        if (currentScrollHeight !== lastScrollHeight) {
          const timeDiff = currentTime - lastTime;
          if (timeDiff < 50 && Math.abs(currentScrollHeight - lastScrollHeight) > 10) {
            window.__flickerEvents.push({
              time: currentTime,
              heightChange: currentScrollHeight - lastScrollHeight,
              timeDiff
            });
          }
          lastScrollHeight = currentScrollHeight;
          lastTime = currentTime;
        }
      });

      observer.observe(element, { childList: true, subtree: true, attributes: true });
      return observer;
    });

    // Send a message that will trigger streaming response
    await chatInput.fill('hello');
    await sendButton.click();

    // Wait for streaming to complete (monitor for 5 seconds)
    await page.waitForTimeout(5000);

    // Check for flicker events
    const flickerEvents = await page.evaluate(() => (window as any).__flickerEvents || []);
    flickerCount = flickerEvents.length;

    console.log(`[E2E] Detected ${flickerCount} potential flicker events`);

    // Assert: Flicker events should be minimal (< 10 rapid changes)
    expect(flickerCount).toBeLessThan(10);
  });

  test('should verify smooth transition between normal and virtual scrolling', async ({ page }) => {
    // Open AI Chat panel (already open)
    const chatInput = page.locator('input[placeholder*="询问 DeepSeek"], input[type="text"]').last();
    await expect(chatInput).toBeVisible({ timeout: 10000 });
    const sendButton = page.locator('button.bg-blue-600').last();
    const scrollContainer = page.locator('.min-h-0.overflow-auto').last();

    // Send messages up to the virtual scrolling threshold (15 messages)
    for (let i = 1; i <= 17; i++) {
      await chatInput.fill(`test message ${i}`);
      await sendButton.click();
      await page.waitForTimeout(50);
    }

    // Wait for final render
    await page.waitForTimeout(500);

    // Verify virtual scrolling is now active
    const virtualItems = await scrollContainer.locator('div[style*="position: absolute"]').count();
    console.log(`[E2E] Virtual scrolling items: ${virtualItems}`);

    expect(virtualItems).toBeGreaterThan(0);
  });

  test('should handle /task:start command with long AI response', async ({ page }) => {
    // Open AI Chat panel (already open)
    const chatInput = page.locator('input[placeholder*="询问 DeepSeek"], input[type="text"]').last();
    await expect(chatInput).toBeVisible({ timeout: 10000 });
    const sendButton = page.locator('button.bg-blue-600').last();

    // Send /task:start command
    await chatInput.fill('/task:start 1');
    await sendButton.click();

    // Wait for response stream to start
    await page.waitForTimeout(2000);

    // Monitor for visual stability during streaming
    const scrollContainer = page.locator('.min-h-0.overflow-auto').last();

    // Check that container is scrollable
    const isScrollable = await scrollContainer.evaluate((el: any) => {
      return el.scrollHeight > el.clientHeight;
    });

    console.log(`[E2E] Scroll container is ${isScrollable ? 'scrollable' : 'not scrollable'}`);

    // Wait longer for complete response
    await page.waitForTimeout(5000);

    // Verify response was received
    const assistantMessages = page.locator('.assistant-message, [class*="assistantBubble"]');
    const hasResponse = await assistantMessages.count() > 0;

    expect(hasResponse).toBeTruthy();
  });
});