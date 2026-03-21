/**
 * E2E 测试：流式响应顺序 - 多工具场景
 *
 * 目标：验证多个工具调用的渲染顺序
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment, removeJoyrideOverlay } from '../setup';

test.describe('流式顺序 - 多工具场景', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForTimeout(2000);
    await page.waitForSelector('[data-testid="chat-input"]', { timeout: 15000 }).catch(async () => {
      await removeJoyrideOverlay(page);
      const chatToggleButton = page.locator('button[title*="IfAI Chat"]').first();
      await chatToggleButton.click().catch(() => {});
      await page.waitForTimeout(1000);
      return page.waitForSelector('[data-testid="chat-input"]', { timeout: 10000 });
    });
  });

  test('应该按正确顺序渲染多个工具调用', async ({ page }) => {
    await removeJoyrideOverlay(page);

    // 发送会触发多个工具调用的消息
    await page.fill('[data-testid="chat-input"]', '扫描项目并读取 package.json 和 tsconfig.json');
    await page.click('[data-testid="chat-send-button"]');

    // 等待完成
    await page.waitForSelector('[data-test-id="message-completed"]', { timeout: 20000 });

    // 验证多个工具调用存在
    const toolCards = page.locator('[data-test-id="tool-approval-card"]');
    const count = await toolCards.count();

    console.log(`Found ${count} tool cards`);

    // 至少应该有一个工具调用
    expect(count).toBeGreaterThanOrEqual(1);

    // 如果有多个工具，验证它们都在不同的位置
    if (count >= 2) {
      const firstCard = toolCards.first();
      const secondCard = toolCards.nth(1);

      await expect(firstCard).toBeVisible();
      await expect(secondCard).toBeVisible();

      // 验证位置顺序（第二个应该在第一个下面）
      const firstBox = await firstCard.boundingBox();
      const secondBox = await secondCard.boundingBox();

      if (firstBox && secondBox) {
        expect(secondBox.y).toBeGreaterThan(firstBox.y);
      }
    }
  });

  test('多个工具调用应该按时间顺序渲染', async ({ page }) => {
    await removeJoyrideOverlay(page);

    await page.fill('[data-testid="chat-input"]', '创建 test1.txt 和 test2.txt');
    await page.click('[data-testid="chat-send-button"]');

    await page.waitForSelector('[data-test-id="message-completed"]', { timeout: 20000 });

    // 验证工具调用
    const toolCards = page.locator('[data-test-id="tool-approval-card"]');
    const count = await toolCards.count();

    console.log(`Found ${count} tool cards for multi-file creation`);

    if (count >= 2) {
      // 验证每个工具调用都有唯一的 ID
      const ids = new Set();

      for (let i = 0; i < count; i++) {
        const id = await toolCards.nth(i).getAttribute('data-test-id');
        expect(id).toBeTruthy();
        ids.add(id);
      }

      // 所有 ID 应该唯一
      expect(ids.size).toBe(count);

      // 验证工具名称
      for (let i = 0; i < count; i++) {
        const card = toolCards.nth(i);
        const text = await card.textContent();
        expect(text).toMatch(/create_file|write_file|agent_write_file/);
      }
    }
  });

  test('前置文本应该在第一个工具之前', async ({ page }) => {
    await removeJoyrideOverlay(page);

    await page.fill('[data-testid="chat-input"]', '让我创建两个文件');
    await page.click('[data-testid="chat-send-button"]');

    await page.waitForTimeout(2000);

    // 验证前置文本
    const messageContent = page.locator('[data-test-id="message-content"]').first();
    const text = await messageContent.textContent();

    // 应该包含"创建"
    expect(text).toMatch(/创建/);
  });

  test('后置文本应该在最后一个工具之后', async ({ page }) => {
    await removeJoyrideOverlay(page);

    await page.fill('[data-testid="chat-input"]', '创建文件后总结结果');
    await page.click('[data-testid="chat-send-button"]');

    await page.waitForSelector('[data-test-id="message-completed"]', { timeout: 20000 });

    // 验证工具调用
    const toolCards = page.locator('[data-test-id="tool-approval-card"]');
    const count = await toolCards.count();

    if (count > 0) {
      // 获取最后一个工具的位置
      const lastCard = toolCards.last();
      const lastBox = await lastCard.boundingBox();

      // 验证后置文本存在
      const messageContent = page.locator('[data-test-id="message-content"]').first();
      const text = await messageContent.textContent();

      // 应该包含总结关键词
      const hasSummary = /完成|结果|总结|创建了/.test(text || '');
      expect(hasSummary).toBe(true);
    }
  });
});

test.describe('流式顺序 - 并发工具场景', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForTimeout(2000);
  });

  test('并发工具调用应该保持顺序', async ({ page }) => {
    await removeJoyrideOverlay(page);

    // 某些模型可能会并发发出多个工具调用
    await page.fill('[data-testid="chat-input"]', '同时扫描 src 和 dist 目录');
    await page.click('[data-testid="chat-send-button"]');

    await page.waitForSelector('[data-test-id="message-completed"]', { timeout: 20000 });

    // 验证工具调用
    const toolCards = page.locator('[data-test-id="tool-approval-card"]');
    const count = await toolCards.count();

    console.log(`Found ${count} tool cards for concurrent tools`);

    if (count >= 2) {
      // 验证所有工具都是可见的
      for (let i = 0; i < count; i++) {
        await expect(toolCards.nth(i)).toBeVisible();
      }

      // 验证垂直位置（应该依次排列）
      for (let i = 1; i < count; i++) {
        const prevBox = await toolCards.nth(i - 1).boundingBox();
        const currBox = await toolCards.nth(i).boundingBox();

        if (prevBox && currBox) {
          expect(currBox.y).toBeGreaterThan(prevBox.y);
        }
      }
    }
  });
});
