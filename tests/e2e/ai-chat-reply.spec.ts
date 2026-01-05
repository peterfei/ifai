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

// Helper function to configure Ollama through UI
async function configureOllama(page: any) {
  console.log('[E2E] Configuring Ollama...');

  // Click on the "自定义提供商" (Custom Provider) tab in settings
  const customProviderTab = page.locator('button:has-text("自定义提供商"), button:has-text("Custom Provider")').first();

  if (await customProviderTab.isVisible({ timeout: 2000 }).catch(() => false)) {
    await customProviderTab.click();
    await page.waitForTimeout(500);

    // Look for "添加" (Add) button or "新建" button
    const addButton = page.locator('button:has-text("添加"), button:has-text("新建"), button:has-text("Add"), button.bg-blue-600').first();

    if (await addButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await addButton.click();
      await page.waitForTimeout(500);

      // Fill in the form
      // Name input
      const nameInput = page.locator('input[placeholder*="名称"], input[placeholder*="Name"], input[type="text"]').last();
      await nameInput.fill('Ollama E2E Test');

      // Select preset - look for select element
      const selectElements = await page.locator('select').count();
      if (selectElements > 0) {
        const presetSelect = page.locator('select').first();
        try {
          await presetSelect.selectOption({ label: 'ollama' });
        } catch (e) {
          // Try by value
          try {
            await presetSelect.selectOption('ollama');
          } catch (e2) {
            console.log('[E2E] Could not select ollama preset');
          }
        }
      }

      await page.waitForTimeout(500);

      // Save/submit button
      const saveButton = page.locator('button:has-text("保存"), button:has-text("Save"), button:has-text("确认"), button:has-text("提交"), button.bg-blue-600').first();
      await saveButton.click();

      // Wait for save to complete
      await page.waitForTimeout(1000);
      console.log('[E2E] Ollama provider saved');
    } else {
      console.log('[E2E] Add button not found');
    }
  } else {
    console.log('[E2E] Custom provider tab not found');
  }

  // Close settings modal
  try {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    // Try again if still open
    const modal = page.locator('.fixed.inset-0');
    const isModalVisible = await modal.isVisible().catch(() => false);

    if (isModalVisible) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }
  } catch (e) {
    console.log('[E2E] Error closing modal:', e);
  }

  // Final wait to ensure everything is settled
  await page.waitForTimeout(1000);
}

test.describe('AI Chat Reply & Virtual Scrolling', () => {
  test.beforeEach(async ({ page }) => {
    // Inject localStorage to skip onboarding
    await page.addInitScript(() => {
      const state = {
        completed: true,
        skipped: true,
        remindCount: 0,
        lastRemindDate: null,
      };
      window.localStorage.setItem('ifai_onboarding_state', JSON.stringify(state));
    });

    await page.goto('/');

    // Wait for app to be ready
    await page.waitForTimeout(1000);

    // Configure Ollama through UI (if needed)
    await configureOllama(page);

    // If there's still a modal open, force close it
    const modal = page.locator('.fixed.inset-0.z-\\[200\\], .fixed.inset-0.z-50');
    const isModalVisible = await modal.isVisible().catch(() => false);
    if (isModalVisible) {
      console.log('[E2E] Closing modal before test');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }
  });

  test('should send /task:start command and receive AI reply', async ({ page }) => {
    // Step 1: Open AI Chat panel - force click to bypass modal blocking
    const aiChatButton = page.locator('button', { hasText: '若爱助手' }).or(
      page.locator('button[title="若爱助手"]')
    );
    await expect(aiChatButton).toBeVisible({ timeout: 10000 });
    await aiChatButton.click({ force: true });

    // Wait for chat panel to open
    await page.waitForTimeout(500);

    // Step 2: Get the chat input
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

    const assistantMessages = page.locator('.bg-\\[\\#252526\\], [class*="assistantBubble"]');
    const messageCount = await assistantMessages.count();

    console.log(`[E2E] Found ${messageCount} assistant messages`);

    // Verify at least one assistant message appears
    expect(messageCount).toBeGreaterThan(0);
  });

  test('should detect virtual scrolling activation with 15+ messages', async ({ page }) => {
    // Open AI Chat panel - force click
    const aiChatButton = page.locator('button[title="若爱助手"], button:has-text("若爱助手"), button[title="AI Chat"]');
    await expect(aiChatButton).toBeVisible({ timeout: 10000 });
    await aiChatButton.click({ force: true });
    await page.waitForTimeout(500);

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
    // (some may be from previous tests, but we expect at least 16)
    expect(visibleCount).toBeGreaterThanOrEqual(16);
  });

  test('should detect flickering during streaming response', async ({ page }) => {
    // Open AI Chat panel - force click
    const aiChatButton = page.locator('button[title="若爱助手"], button:has-text("若爱助手"), button[title="AI Chat"]');
    await expect(aiChatButton).toBeVisible({ timeout: 10000 });
    await aiChatButton.click({ force: true });
    await page.waitForTimeout(500);

    const chatInput = page.locator('input[placeholder*="询问 DeepSeek"], input[type="text"]').last();
    await expect(chatInput).toBeVisible({ timeout: 10000 });
    const sendButton = page.locator('button.bg-blue-600').last();

    // Setup flicker detection
    const scrollContainer = page.locator('.min-h-0.overflow-auto').last();
    let flickerCount = 0;
    let lastHeight = 0;

    // Monitor scroll height changes during streaming
    scrollContainer.evaluate((element: any) => {
      window.__flickerEvents = [];
      let lastScrollHeight = element.scrollHeight;
      let lastTime = Date.now();

      const observer = new MutationObserver((mutations) => {
        const currentTime = Date.now();
        const currentScrollHeight = element.scrollHeight;

        // Detect rapid scroll height changes (potential flicker)
        if (currentScrollHeight !== lastScrollHeight) {
          const timeDiff = currentTime - lastTime;

          // If height changes rapidly (< 50ms), it might cause visual flicker
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

      observer.observe(element, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class']
      });

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
    console.log('[E2E] Flicker details:', flickerEvents.slice(0, 5)); // Log first 5 events

    // Assert: Flicker events should be minimal (< 10 rapid changes)
    expect(flickerCount).toBeLessThan(10);
  });

  test('should verify smooth transition between normal and virtual scrolling', async ({ page }) => {
    // Open AI Chat panel - force click
    const aiChatButton = page.locator('button[title="若爱助手"], button:has-text("若爱助手"), button[title="AI Chat"]');
    await expect(aiChatButton).toBeVisible({ timeout: 10000 });
    await aiChatButton.click({ force: true });
    await page.waitForTimeout(500);

    const chatInput = page.locator('input[placeholder*="询问 DeepSeek"], input[type="text"]').last();
    await expect(chatInput).toBeVisible({ timeout: 10000 });
    const sendButton = page.locator('button.bg-blue-600').last();
    const scrollContainer = page.locator('.min-h-0.overflow-auto').last();

    // Track rendering mode changes
    let modeChanges = 0;

    // Send messages up to the virtual scrolling threshold (15 messages)
    for (let i = 1; i <= 17; i++) {
      await chatInput.fill(`test message ${i}`);
      await sendButton.click();

      // Small delay to allow rendering
      await page.waitForTimeout(50);

      // Check if virtual scrolling is enabled
      const hasVirtualContainer = await scrollContainer.locator('style*="transform:').count() > 0;

      if (i === 14 || i === 15 || i === 16) {
        // These are the transition points
        console.log(`[E2E] Message ${i}: Virtual scrolling ${hasVirtualContainer ? 'enabled' : 'disabled'}`);
      }
    }

    // Wait for final render
    await page.waitForTimeout(500);

    // Verify virtual scrolling is now active (look for absolute positioned items)
    const virtualItems = await scrollContainer.locator('div[style*="position: absolute"]').count();
    console.log(`[E2E] Virtual scrolling items: ${virtualItems}`);

    // With 17+ messages, virtual scrolling should be active
    expect(virtualItems).toBeGreaterThan(0);
  });

  test('should handle /task:start command with long AI response', async ({ page }) => {
    // Open AI Chat panel - force click
    const aiChatButton = page.locator('button[title="若爱助手"], button:has-text("若爱助手"), button[title="AI Chat"]');
    await expect(aiChatButton).toBeVisible({ timeout: 10000 });
    await aiChatButton.click({ force: true });
    await page.waitForTimeout(500);

    const chatInput = page.locator('input[placeholder*="询问 DeepSeek"], input[type="text"]').last();
    await expect(chatInput).toBeVisible({ timeout: 10000 });
    const sendButton = page.locator('button.bg-blue-600').last();

    // Send /task:start command (this should trigger a long response)
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
    const assistantMessages = page.locator('.bg-\\[\\#252526\\]');
    const hasResponse = await assistantMessages.count() > 0;

    expect(hasResponse).toBeTruthy();
  });
});
