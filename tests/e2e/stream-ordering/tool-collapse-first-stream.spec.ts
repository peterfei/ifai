/**
 * E2E 测试：验证首次流式回复时工具调用的折叠状态
 *
 * 场景：验证首次流式回复时，工具调用结果应该显示为折叠状态
 * 而不是展开状态。刷新后应该保持相同的折叠状态。
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment, removeJoyrideOverlay } from '../setup';

test.describe('Tool Call Collapse on First Stream', () => {

  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForSelector('[data-testid="chat-input"]', { timeout: 15000 }).catch(async () => {
      await removeJoyrideOverlay(page);
      await page.waitForTimeout(1000);
      return page.waitForSelector('[data-testid="chat-input"]', { timeout: 10000 });
    });
  });

  test('should show collapsed tool batch on first stream response', async ({ page }) => {
    console.log('[E2E] 测试：首次流式回复时工具调用应该折叠');

    // 清空现有消息
    await page.evaluate(() => {
      (window as any).__chatStore.setState({ messages: [] });
    });

    // 手动创建一个包含工具调用的消息（模拟流式响应后的状态）
    const testResult = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;

      // 添加用户消息
      const userMsgId = 'test-user-' + Date.now();
      chatStore.getState().addMessage({
        id: userMsgId,
        role: 'user',
        content: '请列出当前目录的文件',
        timestamp: Date.now()
      });

      // 添加助手消息，包含多个工具调用（模拟批量工具）
      const assistantMsgId = 'test-assistant-' + Date.now();

      // 为工具调用生成 batchId（模拟流式响应时的 batchId 分配）
      const batchId = 'batch_' + crypto.randomUUID().slice(0, 8);

      // 创建多个工具调用
      const toolCalls = [
        {
          id: 'call_1_' + Date.now(),
          type: 'function' as const,
          function: { name: 'agent_list_dir', arguments: '{"path":"."}' },
          tool: 'agent_list_dir',
          args: { path: '.' },
          status: 'completed' as const,
          result: 'file1.ts\nfile2.ts\nfile3.ts',
          batchId: batchId
        },
        {
          id: 'call_2_' + Date.now(),
          type: 'function' as const,
          function: { name: 'agent_read_file', arguments: '{"path":"file1.ts"}' },
          tool: 'agent_read_file',
          args: { path: 'file1.ts' },
          status: 'completed' as const,
          result: 'Content of file1.ts',
          batchId: batchId
        }
      ];

      // 添加助手消息
      chatStore.getState().addMessage({
        id: assistantMsgId,
        role: 'assistant',
        content: '我已经列出了当前目录的文件并读取了部分文件内容。',
        toolCalls: toolCalls,
        timestamp: Date.now() + 1
      });

      // 等待 DOM 更新
      await new Promise(resolve => setTimeout(resolve, 500));

      // 检查 DOM
      const toolBatches = document.querySelectorAll('[data-testid="tool-batch-card"]');
      const approveButtons = document.querySelectorAll('[data-testid="approve-button"]');

      return {
        messageCount: chatStore.getState().messages.length,
        toolBatchCount: toolBatches.length,
        approveButtonCount: approveButtons.length,
        toolCalls: toolCalls.map((tc: any) => ({
          id: tc.id,
          tool: tc.tool,
          batchId: tc.batchId
        }))
      };
    });

    console.log('[E2E] 测试结果:', JSON.stringify(testResult, null, 2));

    // 检查工具批次卡片的显示状态
    const toolBatchCheck = await page.evaluate(() => {
      // 查找工具批次卡片
      const toolBatches = document.querySelectorAll('[data-testid="tool-batch-card"]');
      console.log('[E2E] 找到的工具批次卡片数量:', toolBatches.length);

      if (toolBatches.length === 0) {
        return { found: false, reason: 'No tool batch cards found' };
      }

      const firstBatch = toolBatches[0];
      const batchHtml = firstBatch.innerHTML;

      // 检查是否有 "Completed X action groups" 文本（折叠状态）
      const hasCollapsedText = batchHtml.includes('Completed') && batchHtml.includes('action groups');

      // 检查是否显示了分组详情（展开状态）
      const hasGroupDetails = batchHtml.includes('List directories') || batchHtml.includes('Read files');

      // 检查是否有 "Running" 文本（执行中状态）
      const hasRunningText = batchHtml.includes('Running') && batchHtml.includes('action groups');

      return {
        found: true,
        batchCount: toolBatches.length,
        hasCollapsedText,
        hasGroupDetails,
        hasRunningText,
        previewHtml: batchHtml.substring(0, 800)
      };
    });

    console.log('[E2E] 工具批次检查结果:', JSON.stringify(toolBatchCheck, null, 2));

    // 验证：工具批次应该显示为折叠状态
    expect(testResult.toolBatchCount).toBeGreaterThan(0);
    expect(toolBatchCheck.found).toBe(true);
    expect(toolBatchCheck.hasCollapsedText).toBe(true);
    expect(toolBatchCheck.hasGroupDetails).toBe(false);
  });

  test('should maintain collapsed state after page reload', async ({ page }) => {
    console.log('[E2E] 测试：刷新后工具调用应保持折叠状态');

    // 手动创建包含工具调用的消息
    const setupResult = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;

      // 添加用户消息
      chatStore.getState().addMessage({
        id: 'test-user-reload-' + Date.now(),
        role: 'user',
        content: '读取 package.json 文件',
        timestamp: Date.now()
      });

      // 生成 batchId
      const batchId = 'batch_' + crypto.randomUUID().slice(0, 8);

      // 添加助手消息，包含工具调用
      const assistantMsgId = 'test-assistant-reload-' + Date.now();
      chatStore.getState().addMessage({
        id: assistantMsgId,
        role: 'assistant',
        content: '已读取文件内容',
        toolCalls: [{
          id: 'call_reload_' + Date.now(),
          type: 'function' as const,
          function: { name: 'agent_read_file', arguments: '{"path":"package.json"}' },
          tool: 'agent_read_file',
          args: { path: 'package.json' },
          status: 'completed' as const,
          result: '{"name":"test"}',
          batchId: batchId
        }],
        timestamp: Date.now() + 1
      });

      await new Promise(resolve => setTimeout(resolve, 500));

      // 检查刷新前的状态
      const toolBatchesBefore = document.querySelectorAll('[data-testid="tool-batch-card"]').length;

      return { assistantMsgId, toolBatchCountBefore: toolBatchesBefore };
    });

    console.log('[E2E] 刷新前状态:', {
      batchCount: setupResult.toolBatchCountBefore,
      hasCollapsedText: setupResult.toolBatchCountBefore > 0
    });

    expect(setupResult.toolBatchCountBefore).toBeGreaterThan(0);

    // 刷新页面
    await page.reload();
    await page.waitForFunction(() => (window as any).__chatStore !== undefined, {
      timeout: 15000
    });
    await page.waitForTimeout(3000); // 等待持久化恢复

    // 检查刷新后的状态
    const afterReload = await page.evaluate(() => {
      const toolBatches = document.querySelectorAll('[data-testid="tool-batch-card"]');
      if (toolBatches.length === 0) {
        return { batchCount: 0, reason: 'No tool batches after reload' };
      }

      const firstBatch = toolBatches[0];
      const batchHtml = firstBatch.innerHTML;

      return {
        batchCount: toolBatches.length,
        hasCollapsedText: batchHtml.includes('Completed') && batchHtml.includes('action groups'),
        hasGroupDetails: batchHtml.includes('Read files') || batchHtml.includes('List directories'),
        previewHtml: batchHtml.substring(0, 500)
      };
    });

    console.log('[E2E] 刷新后状态:', JSON.stringify(afterReload, null, 2));

    // 验证：刷新后应该仍然显示折叠状态
    expect(afterReload.batchCount).toBeGreaterThan(0);
    expect(afterReload.hasCollapsedText).toBe(true);
    expect(afterReload.hasGroupDetails).toBe(false);
  });

  test('should toggle expand/collapse on click', async ({ page }) => {
    console.log('[E2E] 测试：点击工具批次应该切换展开/折叠状态');

    // 手动创建包含工具调用的消息
    const setupResult = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;

      // 添加用户消息
      chatStore.getState().addMessage({
        id: 'test-user-toggle-' + Date.now(),
        role: 'user',
        content: '请列出文件并搜索内容',
        timestamp: Date.now()
      });

      // 生成 batchId
      const batchId = 'batch_' + crypto.randomUUID().slice(0, 8);

      // 添加助手消息，包含多个工具调用
      const assistantMsgId = 'test-assistant-toggle-' + Date.now();
      chatStore.getState().addMessage({
        id: assistantMsgId,
        role: 'assistant',
        content: '已完成文件操作',
        toolCalls: [
          {
            id: 'call_toggle_list_' + Date.now(),
            type: 'function' as const,
            function: { name: 'agent_list_dir', arguments: '{"path":"."}' },
            tool: 'agent_list_dir',
            args: { path: '.' },
            status: 'completed' as const,
            result: 'file1.ts\nfile2.ts',
            batchId: batchId
          },
          {
            id: 'call_toggle_search_' + Date.now(),
            type: 'function' as const,
            function: { name: 'agent_search', arguments: '{"query":"test"}' },
            tool: 'agent_search',
            args: { query: 'test' },
            status: 'completed' as const,
            result: 'found: test',
            batchId: batchId
          }
        ],
        timestamp: Date.now() + 1
      });

      await new Promise(resolve => setTimeout(resolve, 500));

      // 检查初始状态
      const batch = document.querySelector('[data-testid="tool-batch-card"]');
      if (!batch) return { found: false };

      const html = batch.innerHTML;
      return {
        found: true,
        hasCollapsedText: html.includes('action groups'),
        hasGroupDetails: html.includes('List directories') || html.includes('Search content')
      };
    });

    console.log('[E2E] 初始状态:', setupResult);
    expect(setupResult.found).toBe(true);
    expect(setupResult.hasGroupDetails).toBe(false);

    // 点击工具批次卡片的 header 展开（点击事件绑定在内部 div 上）
    const clickResult = await page.evaluate(() => {
      const batch = document.querySelector('[data-testid="tool-batch-card"]');
      if (!batch) return { success: false };

      // 找到包含 "action groups" 文本的可点击 div
      const clickableDiv = Array.from(batch.querySelectorAll('div')).find(div =>
        div.textContent?.includes('action groups') && div.classList.contains('cursor-pointer')
      );

      if (!clickableDiv) return { success: false, reason: 'No clickable div found' };

      // 触发点击事件
      (clickableDiv as HTMLElement).click();
      return { success: true };
    });

    console.log('[E2E] 点击结果:', clickResult);
    expect(clickResult.success).toBe(true);

    await page.waitForTimeout(1000); // 等待状态更新

    // 等待 DOM 更新完成
    await page.waitForFunction(() => {
      const batch = document.querySelector('[data-testid="tool-batch-card"]');
      if (!batch) return false;
      const html = batch.innerHTML;
      // 检查是否有分组详情（展开状态的标志）
      return html.includes('px-3 py-2 bg-gray-800/50') || html.includes('Showing all details below');
    }, { timeout: 5000 });

    // 检查展开状态
    const expandedState = await page.evaluate(() => {
      const batch = document.querySelector('[data-testid="tool-batch-card"]');
      if (!batch) return { found: false };
      const html = batch.innerHTML;
      return {
        found: true,
        hasAnyGroupLabel: html.includes('List directories') || html.includes('Search content') || html.includes('Read files') || html.includes('Write files'),
        hasShowingDetailsText: html.includes('Showing all details below'),
        hasGroupHeader: html.includes('px-3 py-2 bg-gray-800/50'), // 分组头部的 className
        fullHtml: html.substring(0, 1000)
      };
    });

    console.log('[E2E] 展开后状态:', expandedState);
    // 展开后应该显示分组详情
    expect(expandedState.hasGroupHeader).toBe(true);

    // 再次点击折叠（使用与第一次点击相同的方式）
    const collapseClickResult = await page.evaluate(() => {
      const batch = document.querySelector('[data-testid="tool-batch-card"]');
      if (!batch) return { success: false };

      // 找到包含 "action groups" 文本的可点击 div（与第一次点击相同的方式）
      const clickableDiv = Array.from(batch.querySelectorAll('div')).find(div =>
        div.textContent?.includes('action groups') && div.classList.contains('cursor-pointer')
      );

      if (!clickableDiv) return { success: false, reason: 'No clickable div found for collapse' };

      // 触发点击事件
      (clickableDiv as HTMLElement).click();
      return { success: true };
    });

    console.log('[E2E] 折叠点击结果:', collapseClickResult);
    expect(collapseClickResult.success).toBe(true);

    await page.waitForTimeout(500);

    // 检查折叠状态（折叠后应该显示 "Done" 而不是分组详情）
    const collapsedState = await page.evaluate(() => {
      const batch = document.querySelector('[data-testid="tool-batch-card"]');
      if (!batch) return { found: false };
      const html = batch.innerHTML;
      return {
        found: true,
        hasDoneText: html.includes('Done'),
        hasDoneTextWithGreenClass: html.includes('Done') && html.includes('text-green-500'),
        // 折叠时不应该包含完整的分组详情容器
        hasFullGroupDetails: html.includes('px-3 py-2 bg-gray-800/50 border-b'),
        hasShowingDetails: html.includes('Showing all details below'),
        hasCollapsedText: html.includes('action groups'),
        // 检查是否有 "Running" 状态
        hasRunningText: html.includes('Running') && html.includes('action groups'),
        fullHtmlPreview: html.substring(0, 1500)
      };
    });

    console.log('[E2E] 折叠后状态:', JSON.stringify(collapsedState, null, 2));
    // 验证折叠状态：应该有折叠文本，但没有完整的分组详情
    expect(collapsedState.hasCollapsedText).toBe(true);
    expect(collapsedState.hasFullGroupDetails).toBe(false);
    expect(collapsedState.hasShowingDetails).toBe(false);
  });
});
