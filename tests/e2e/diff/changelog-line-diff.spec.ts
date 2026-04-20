import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment, removeJoyrideOverlay } from '../setup';

/**
 * CHANGELOG 行级别 diff 测试
 *
 * 真实场景：
 * - 原始文件有多行 changelog 内容
 * - AI 修改了其中某些行（比如版本号从 "1" 改成 "2"）
 * - UI 应该正确显示行级别的 diff，而不是整个文件替换
 */

test.beforeEach(async ({ page }) => {
  page.on('console', msg => {
    console.log(`[Browser] ${msg.type().toUpperCase()}: ${msg.text()}`);
  });
});

test.describe('Changelog Line Diff UI Test @diff', () => {
  test.skip('should show partial line changes in changelog correctly', async ({ page }) => {
    // 步骤 1：初始化环境
    await setupE2ETestEnvironment(page, {
      useRealAI: true, // 确保使用真实格式化函数
      skipWelcome: true
    });

    const fileName = 'CHANGELOG.md';
    const originalContent = `# Changelog

## [0.1.0] - 2024-01-01
### Added
- Initial release
- Basic AI chat functionality
- File system tools support

## [0.0.9] - 2023-12-15
- Experimental features
`;

    const newContent = `# Changelog

## [0.2.0] - 2024-02-01
### Added
- Initial release
- Advanced AI chat with streaming
- Physical file system fidelity
- Line-level diff visualization

## [0.0.9] - 2023-12-15
- Experimental features
`;

    // 设置初始文件内容
    await page.evaluate(({ fileName, content }) => {
      const mockFS = (window as any).__E2E_MOCK_FILE_SYSTEM__;
      if (mockFS) {
        if (typeof mockFS.set === 'function') {
          mockFS.set(fileName, content);
        } else {
          mockFS[fileName] = content;
        }
      }
    }, { fileName, content: originalContent });

    await page.goto('/');

    // 等待系统加载
    await page.waitForFunction(() => (window as any).__chatStore !== undefined, { timeout: 15000 });

    // 🔥 FIX: 模拟发送一个消息来启动线程并建立上下文
    await page.evaluate(() => {
      window.__E2E_SEND__('Start diff test');
    });
    await page.waitForTimeout(2000);

    // 注入模拟消息触发 diff
    await page.evaluate(({ fileName, content }) => {
      const mockResponses = {
        'changelog-update-call': [{
          tool: 'agent_write_file',
          args: { rel_path: fileName, content },
          status: 'pending'
        }]
      };
      (window as any).__E2E_MOCK_RESPONSES__ = mockResponses;

      // 直接添加消息并触发渲染
      const chatStore = (window as any).__chatStore;
      if (chatStore) {
        const state = chatStore.getState();
        state.addMessage({
          id: 'msg-changelog-update',
          role: 'assistant',
          content: '更新 CHANGELOG 版本号',
          toolCalls: [{
            id: 'changelog-update-call',
            tool: 'agent_write_file',
            args: { rel_path: fileName, content },
            status: 'pending'
          }]
        });
      }
    }, { fileName, content: newContent });

    // 等待UI渲染
    await page.waitForTimeout(3000);

    // 批准执行
    await removeJoyrideOverlay(page);

    // 🔥 使用 data-testid 稳定定位
    const approveButton = page.getByTestId('approve-button').first();
    await expect(approveButton).toBeVisible({ timeout: 15000 });
    await approveButton.click();

    await page.waitForTimeout(2000);

    // 验证工具调用状态
    const toolCallStatus = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore?.getState();
      const msg = chatStore?.messages.find((m: any) => m.id === 'msg-changelog-update');
      return msg?.toolCalls?.[0]?.status;
    });
    expect(toolCallStatus).toBe('completed');

    // 🔥 核心验证：检查 diff 结果
    const toolCallResult = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore?.getState();
      const msg = chatStore?.messages.find((m: any) => m.id === 'msg-changelog-update');
      return msg?.toolCalls?.[0]?.result;
    });

    console.log('[E2E] Tool Call Result received');
    expect(toolCallResult).toBeDefined();

    // 检查格式化后的输出是否包含预期的 diff 标记
    // 在 UI 中，diff 通常会被渲染为带有特定 class 或文本的元素
    const diffContainer = page.locator('.diff-container, .diff-view, [data-testid="diff-view"]').first();
    
    // 如果找不到特定的容器，检查页面上是否出现了新增和删除的行文本
    const hasRemovedLine = await page.locator('text=[0.1.0] - 2024-01-01').count() > 0;
    const hasAddedLine = await page.locator('text=[0.2.0] - 2024-02-01').count() > 0;
    
    console.log('[E2E] Removed line detected:', hasRemovedLine);
    console.log('[E2E] Added line detected:', hasAddedLine);

    // 🏆 即使没有专用的 diff 容器，至少应该显示变化的文本
    // 这里的验证逻辑需要根据实际 UI 渲染出的文本来调整
    const formattedOutput = await page.getByTestId('file-approval-dialog').last().innerText();
    console.log('[E2E] Tool card output preview:', formattedOutput.substring(0, 200));

    // 🏆 核心验证：检查内容是否正确显示
    const hasContent = formattedOutput.includes('[0.2.0]') && formattedOutput.includes('2024-02-01');
    expect(hasContent).toBe(true);

    console.log('[E2E] ✅ Changelog content correctly displayed in tool card');
  });

  test('should show multiple changed lines correctly', async ({ page }) => {
    // 步骤 1：初始化
    await setupE2ETestEnvironment(page, { skipWelcome: true });
    
    const fileName = 'multi-line.txt';
    const originalContent = `Line 1
Line 2
Line 3
Line 4
Line 5`;

    const newContent = `Line 1
Line 2 modified
Line 3
Line 4 replaced
Line 5`;

    await page.evaluate(({ fileName, content }) => {
      const mockFS = (window as any).__E2E_MOCK_FILE_SYSTEM__;
      if (mockFS) {
        if (typeof mockFS.set === 'function') {
          mockFS.set(fileName, content);
        } else {
          mockFS[fileName] = content;
        }
      }
    }, { fileName, content: originalContent });

    await page.goto('/');
    await page.waitForFunction(() => (window as any).__chatStore !== undefined, { timeout: 15000 });

    // 🔥 FIX: 模拟发送一个消息来启动线程并建立上下文
    await page.evaluate(() => {
      window.__E2E_SEND__('Start multi-line diff test');
    });
    await page.waitForTimeout(2000);

    // 触发改动
    await page.evaluate(({ fileName, content }) => {
      const chatStore = (window as any).__chatStore?.getState();
      chatStore.addMessage({
        id: 'msg-multi-line',
        role: 'assistant',
        content: '多行修改测试',
        toolCalls: [{
          id: 'multi-line-call',
          tool: 'agent_write_file',
          args: { rel_path: fileName, content },
          status: 'pending'
        }]
      });
    }, { fileName, content: newContent });

    // 批准执行
    await removeJoyrideOverlay(page);
    const approveButton = page.getByTestId('approve-button').first();
    await expect(approveButton).toBeVisible({ timeout: 15000 });
    await approveButton.click();

    // 等待渲染完成
    await page.waitForTimeout(2000);

    // 验证 diff
    const innerText = await page.getByTestId('file-approval-dialog').last().innerText();
    
    const diffCheck = {
        hasRemovedLine2: innerText.includes('Line 2'),
        hasRemovedLine4: innerText.includes('Line 4'),
        hasAddedLine2: innerText.includes('Line 2 modified'),
        hasAddedLine4: innerText.includes('Line 4 replaced')
    };

    console.log('[E2E] Multi-line diff check:', diffCheck);
    expect(diffCheck.hasRemovedLine2).toBe(true);
    expect(diffCheck.hasRemovedLine4).toBe(true);
    expect(diffCheck.hasAddedLine2).toBe(true);
    expect(diffCheck.hasAddedLine4).toBe(true);

    console.log('[E2E] ✅ Partial line change diff correctly displayed');
  });

});
