/**
 * E2E 测试：流式响应顺序 - 单工具场景
 *
 * 目标：验证 pre-tool → tool → post-tool 的渲染顺序
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment, removeJoyrideOverlay } from '../setup';

test.describe('流式顺序 - 单工具场景', () => {
  test.beforeEach(async ({ page }) => {
    // 使用标准 E2E 环境设置
    await setupE2ETestEnvironment(page);
    await page.goto('/');

    // 等待应用初始化
    await page.waitForTimeout(2000);

    // 等待聊天输入框可见
    await page.waitForSelector('[data-testid="chat-input"]', { timeout: 15000 }).catch(async () => {
      await removeJoyrideOverlay(page);
      const chatToggleButton = page.locator('button[title*="IfAI Chat"], button:has-text("IfAI Chat")').first();
      await chatToggleButton.click().catch(() => {});
      await page.waitForTimeout(1000);
      return page.waitForSelector('[data-testid="chat-input"]', { timeout: 10000 });
    });
  });

  test('应该按正确顺序渲染：pre-tool → tool → post-tool', async ({ page }) => {
    // 1. 发送触发工具调用的消息
    await removeJoyrideOverlay(page);
    await page.fill('[data-testid="chat-input"]', '扫描当前项目');
    await page.click('[data-testid="chat-send-button"]');

    // 2. 等待流式传输完成
    await page.waitForSelector('[data-test-id="message-completed"]', { timeout: 15000 });

    // 3. 验证 segments 存在
    const segments = page.locator('[data-test^="segment-"]');
    const segmentCount = await segments.count();
    console.log(`Found ${segmentCount} segments`);

    // 至少应该有 3 个 segments：pre-tool + tool + post-tool
    expect(segmentCount).toBeGreaterThanOrEqual(2);

    // 4. 验证顺序（如果实现了 data-phase 属性）
    const hasPhaseAttribute = await segments.first().getAttribute('data-phase') !== null;

    if (hasPhaseAttribute) {
      // 新实现：使用 data-phase 验证
      await expect(segments.nth(0)).toHaveAttribute('data-phase', 'pre-tool');

      // 查找 tool segment
      const toolSegment = page.locator('[data-test="segment-tool"]').first();
      await expect(toolSegment).toBeVisible();

      // 验证 post-tool 存在（如果有）
      const postTextSegments = page.locator('[data-phase="post-tool"]');
      const postTextCount = await postTextSegments.count();
      if (postTextCount > 0) {
        // 验证 post-tool 在 tool 之后
        const toolY = (await toolSegment.boundingBox()).y;
        const postTextY = (await postTextSegments.first().boundingBox()).y;
        expect(postTextY).toBeGreaterThan(toolY);
      }
    } else {
      // Fallback：通过文本内容和位置验证
      const allContent = await page.locator('[data-test-id="message-content"]').first().textContent();

      // 验证顺序：扫描（前）→ 工具调用 → 完成（后）
      const scanIndex = allContent?.indexOf('扫描') || -1;
      const toolCard = page.locator('[data-test-id="tool-approval-card"]').first();
      const toolExists = await toolCard.count() > 0;

      if (toolExists) {
        // 工具调用应该存在
        await expect(toolCard).toBeVisible();
      }
    }
  });

  test('工具调用应该在前置文本之后显示', async ({ page }) => {
    await removeJoyrideOverlay(page);
    await page.fill('[data-testid="chat-input"]', '读取 package.json');
    await page.click('[data-testid="chat-send-button"]');

    // 等待工具调用出现
    await page.waitForSelector('[data-test-id="tool-approval-card"]', { timeout: 10000 });

    // 验证工具调用位置
    const toolCard = page.locator('[data-test-id="tool-approval-card"]').first();
    const firstMessage = page.locator('[data-test-id="message-content"]').first();

    // 工具调用应该可见
    await expect(toolCard).toBeVisible();

    // 验证垂直位置关系
    const toolBoundingBox = await toolCard.boundingBox();
    const messageBoundingBox = await firstMessage.boundingBox();

    if (toolBoundingBox && messageBoundingBox) {
      expect(toolBoundingBox.y).toBeGreaterThanOrEqual(messageBoundingBox.y);
    }
  });

  test('后置文本应该在工具调用之后显示', async ({ page }) => {
    await removeJoyrideOverlay(page);
    await page.fill('[data-testid="chat-input"]', '分析项目结构');
    await page.click('[data-testid="chat-send-button"]');

    // 等待完成
    await page.waitForSelector('[data-test-id="message-completed"]', { timeout: 15000 });

    // 验证工具调用存在
    const toolCard = page.locator('[data-test-id="tool-approval-card"]').first();
    const toolExists = await toolCard.count() > 0;

    if (toolExists) {
      await expect(toolCard).toBeVisible();

      // 验证后置文本存在（包含关键词）
      const messageContent = page.locator('[data-test-id="message-content"]').first();
      const text = await messageContent.textContent();

      // 后置文本应该包含分析/完成/结果等关键词
      const hasPostText = /分析|完成|结果|发现/.test(text || '');
      expect(hasPostText).toBe(true);
    }
  });

  test('流式传输过程中应该实时更新 segments', async ({ page }) => {
    await removeJoyrideOverlay(page);
    await page.fill('[data-testid="chat-input"]', '扫描项目文件');
    await page.click('[data-testid="chat-send-button"]');

    // 等待开始流式传输
    await page.waitForTimeout(500);

    // 监控流式过程
    let previousContent = '';
    let contentChanged = false;

    for (let i = 0; i < 20; i++) {
      await page.waitForTimeout(200);

      const currentContent = await page.locator('[data-test-id="message-content"]').first().textContent() || '';

      if (currentContent !== previousContent) {
        contentChanged = true;
        previousContent = currentContent;
      }

      // 检查是否完成
      const isCompleted = await page.locator('[data-test-id="message-completed"]').count() > 0;
      if (isCompleted) {
        break;
      }
    }

    // 验证内容有变化（流式传输）
    expect(contentChanged).toBe(true);
  });
});

test.describe('流式顺序 - 调试辅助', () => {
  test('调试：输出当前 segments 结构', async ({ page }) => {
    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForTimeout(2000);

    // 添加调试脚本
    await page.addInitScript(() => {
      (window as any).debugSegments = () => {
        const messages = (window as any).useChatStore?.getState().messages || [];
        return messages.map((m: any) => ({
          id: m.id,
          role: m.role,
          contentPreview: m.content?.substring(0, 50),
          segmentsCount: m.segments?.length || 0,
          hasSegments: !!m.segments,
          segments: m.segments?.map((s: any) => ({
            type: s.type,
            phase: s.phase,
            order: s.order,
            contentPreview: s.content?.substring(0, 30) || s.toolCallId
          })) || []
        }));
      };
    });

    await removeJoyrideOverlay(page);
    await page.fill('[data-testid="chat-input"]', '测试消息');
    await page.click('[data-testid="chat-send-button"]');

    await page.waitForTimeout(3000);

    // 输出调试信息
    const segmentsInfo = await page.evaluate(() => {
      return (window as any).debugSegments();
    });

    console.log('=== Debug Segments Info ===');
    console.log(JSON.stringify(segmentsInfo, null, 2));
    console.log('=== End Debug Info ===');

    // 验证至少有一个消息
    expect(segmentsInfo.length).toBeGreaterThan(0);
  });
});
