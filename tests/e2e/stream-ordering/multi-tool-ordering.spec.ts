/**
 * E2E 测试：流式响应顺序 - 多工具场景
 *
 * 目标：通过直接注入消息验证多个工具调用的渲染顺序
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

test.describe('流式顺序 - 多工具场景', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForTimeout(2000);
    await page.waitForFunction(() => (window as any).__chatStore !== undefined, { timeout: 15000 });
    await page.waitForTimeout(1000);
  });

  test('应该正确创建多个工具调用并保持顺序', async ({ page }) => {
    const result = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      if (!chatStore) return { error: 'No store' };

      const now = Date.now();
      const callId1 = 'call_multi_1_' + now;
      const callId2 = 'call_multi_2_' + now;
      const batchId = 'batch_' + now;

      chatStore.getState().addMessage({
        id: 'test-user-multi-' + now,
        role: 'user',
        content: '扫描项目并读取 package.json',
        timestamp: now
      });

      chatStore.getState().addMessage({
        id: 'test-assistant-multi-' + now,
        role: 'assistant',
        content: '完成',
        timestamp: now + 1,
        status: 'completed',
        toolCalls: [
          {
            id: callId1,
            type: 'function' as const,
            function: { name: 'agent_scan_project', arguments: '{"path":"."}' },
            tool: 'agent_scan_project',
            args: { path: '.' },
            status: 'completed' as const,
            result: 'scan results',
            batchId
          },
          {
            id: callId2,
            type: 'function' as const,
            function: { name: 'agent_read_file', arguments: '{"path":"package.json"}' },
            tool: 'agent_read_file',
            args: { path: 'package.json' },
            status: 'completed' as const,
            result: '{"name":"test"}',
            batchId
          }
        ],
        segments: [
          { type: 'text', order: 0, timestamp: now, phase: 'pre-tool', content: '正在扫描项目...' },
          { type: 'tool', order: 1, timestamp: now + 1, phase: 'in-tool', toolCallId: callId1, toolName: 'agent_scan_project', status: 'completed' },
          { type: 'tool', order: 2, timestamp: now + 2, phase: 'in-tool', toolCallId: callId2, toolName: 'agent_read_file', status: 'completed' },
          { type: 'text', order: 3, timestamp: now + 3, phase: 'post-tool', content: '完成' }
        ],
        contentSegments: [
          { type: 'text', order: 0, timestamp: now, phase: 'pre-tool', content: '正在扫描项目...' },
          { type: 'tool', order: 1, timestamp: now + 1, phase: 'in-tool', toolCallId: callId1, toolName: 'agent_scan_project', status: 'completed' },
          { type: 'tool', order: 2, timestamp: now + 2, phase: 'in-tool', toolCallId: callId2, toolName: 'agent_read_file', status: 'completed' },
          { type: 'text', order: 3, timestamp: now + 3, phase: 'post-tool', content: '完成' }
        ]
      });

      const messages = chatStore.getState().messages || [];
      const lastMsg = messages[messages.length - 1];
      return {
        toolCallCount: lastMsg?.toolCalls?.length || 0,
        toolNames: lastMsg?.toolCalls?.map((t: any) => t.function.name) || [],
        segmentsCount: lastMsg?.segments?.length || 0,
        segmentPhases: lastMsg?.segments?.map((s: any) => s.phase) || []
      };
    });

    console.log('Multi-tool result:', JSON.stringify(result, null, 2));
    expect(result.toolCallCount).toBe(2);
    expect(result.toolNames).toContain('agent_scan_project');
    expect(result.toolNames).toContain('agent_read_file');
    expect(result.segmentsCount).toBe(4); // pre-tool + 2 tools + post-tool
  });

  test('多个工具调用应该按时间顺序排列', async ({ page }) => {
    const result = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      if (!chatStore) return { error: 'No store' };

      const now = Date.now();
      const callId1 = 'call_order_1_' + now;
      const callId2 = 'call_order_2_' + now;
      const batchId = 'batch_' + now;

      chatStore.getState().addMessage({
        id: 'test-user-order-' + now,
        role: 'user',
        content: '创建 test1.txt 和 test2.txt',
        timestamp: now
      });

      chatStore.getState().addMessage({
        id: 'test-assistant-order-' + now,
        role: 'assistant',
        content: '已创建文件',
        timestamp: now + 1,
        status: 'completed',
        toolCalls: [
          {
            id: callId1,
            type: 'function' as const,
            function: { name: 'agent_write_file', arguments: '{"path":"test1.txt"}' },
            tool: 'agent_write_file',
            args: { path: 'test1.txt' },
            status: 'completed' as const,
            result: 'created',
            batchId
          },
          {
            id: callId2,
            type: 'function' as const,
            function: { name: 'agent_write_file', arguments: '{"path":"test2.txt"}' },
            tool: 'agent_write_file',
            args: { path: 'test2.txt' },
            status: 'completed' as const,
            result: 'created',
            batchId
          }
        ],
        segments: [
          { type: 'text', order: 0, timestamp: now, phase: 'pre-tool', content: '创建文件...' },
          { type: 'tool', order: 1, timestamp: now + 1, phase: 'in-tool', toolCallId: callId1, toolName: 'agent_write_file', status: 'completed' },
          { type: 'tool', order: 2, timestamp: now + 2, phase: 'in-tool', toolCallId: callId2, toolName: 'agent_write_file', status: 'completed' },
          { type: 'text', order: 3, timestamp: now + 3, phase: 'post-tool', content: '已创建文件' }
        ],
        contentSegments: [
          { type: 'text', order: 0, timestamp: now, phase: 'pre-tool', content: '创建文件...' },
          { type: 'tool', order: 1, timestamp: now + 1, phase: 'in-tool', toolCallId: callId1, toolName: 'agent_write_file', status: 'completed' },
          { type: 'tool', order: 2, timestamp: now + 2, phase: 'in-tool', toolCallId: callId2, toolName: 'agent_write_file', status: 'completed' },
          { type: 'text', order: 3, timestamp: now + 3, phase: 'post-tool', content: '已创建文件' }
        ]
      });

      const messages = chatStore.getState().messages || [];
      const lastMsg = messages[messages.length - 1];
      const toolCalls = lastMsg?.toolCalls || [];

      // 验证每个工具调用的唯一性
      const ids = toolCalls.map((t: any) => t.id);
      const uniqueIds = new Set(ids);

      return {
        toolCallCount: toolCalls.length,
        uniqueIdsCount: uniqueIds.size,
        isOrderCorrect: toolCalls[0]?.id === callId1 && toolCalls[1]?.id === callId2
      };
    });

    console.log('Order verification:', JSON.stringify(result, null, 2));
    expect(result.toolCallCount).toBe(2);
    expect(result.uniqueIdsCount).toBe(2); // 所有 ID 唯一
    expect(result.isOrderCorrect).toBe(true);
  });

  test('前置文本应该在第一个工具之前', async ({ page }) => {
    const result = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      if (!chatStore) return { error: 'No store' };

      const now = Date.now();
      const callId1 = 'call_pre_1_' + now;
      const batchId = 'batch_' + now;

      chatStore.getState().addMessage({
        id: 'test-user-pre-' + now,
        role: 'user',
        content: '让我创建两个文件',
        timestamp: now
      });

      chatStore.getState().addMessage({
        id: 'test-assistant-pre-' + now,
        role: 'assistant',
        content: '文件已创建',
        timestamp: now + 1,
        status: 'completed',
        toolCalls: [{
          id: callId1,
          type: 'function' as const,
          function: { name: 'agent_write_file', arguments: '{"path":"test.txt"}' },
          tool: 'agent_write_file',
          args: { path: 'test.txt' },
          status: 'completed' as const,
          result: 'created',
          batchId
        }],
        segments: [
          { type: 'text', order: 0, timestamp: now, phase: 'pre-tool', content: '让我创建两个文件。' },
          { type: 'tool', order: 1, timestamp: now + 1, phase: 'in-tool', toolCallId: callId1, toolName: 'agent_write_file', status: 'completed' },
          { type: 'text', order: 2, timestamp: now + 2, phase: 'post-tool', content: '文件已创建' }
        ],
        contentSegments: [
          { type: 'text', order: 0, timestamp: now, phase: 'pre-tool', content: '让我创建两个文件。' },
          { type: 'tool', order: 1, timestamp: now + 1, phase: 'in-tool', toolCallId: callId1, toolName: 'agent_write_file', status: 'completed' },
          { type: 'text', order: 2, timestamp: now + 2, phase: 'post-tool', content: '文件已创建' }
        ]
      });

      const messages = chatStore.getState().messages || [];
      const lastMsg = messages[messages.length - 1];
      const segments = lastMsg?.segments || [];

      return {
        firstSegmentPhase: segments[0]?.phase,
        firstSegmentContent: segments[0]?.content,
        firstSegmentOrder: segments[0]?.order
      };
    });

    console.log('Pre-tool check:', JSON.stringify(result, null, 2));
    expect(result.firstSegmentPhase).toBe('pre-tool');
    expect(result.firstSegmentOrder).toBe(0);
  });

  test('后置文本应该在最后一个工具之后', async ({ page }) => {
    const result = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      if (!chatStore) return { error: 'No store' };

      const now = Date.now();
      const callId1 = 'call_post_1_' + now;
      const callId2 = 'call_post_2_' + now;
      const batchId = 'batch_' + now;

      chatStore.getState().addMessage({
        id: 'test-user-post-' + now,
        role: 'user',
        content: '创建文件后总结结果',
        timestamp: now
      });

      chatStore.getState().addMessage({
        id: 'test-assistant-post-' + now,
        role: 'assistant',
        content: '总结：已成功创建了 2 个文件。',
        timestamp: now + 1,
        status: 'completed',
        toolCalls: [
          {
            id: callId1,
            type: 'function' as const,
            function: { name: 'agent_write_file', arguments: '{"path":"a.txt"}' },
            tool: 'agent_write_file',
            args: { path: 'a.txt' },
            status: 'completed' as const,
            result: 'created',
            batchId
          },
          {
            id: callId2,
            type: 'function' as const,
            function: { name: 'agent_write_file', arguments: '{"path":"b.txt"}' },
            tool: 'agent_write_file',
            args: { path: 'b.txt' },
            status: 'completed' as const,
            result: 'created',
            batchId
          }
        ],
        segments: [
          { type: 'text', order: 0, timestamp: now, phase: 'pre-tool', content: '正在创建文件...' },
          { type: 'tool', order: 1, timestamp: now + 1, phase: 'in-tool', toolCallId: callId1, toolName: 'agent_write_file', status: 'completed' },
          { type: 'tool', order: 2, timestamp: now + 2, phase: 'in-tool', toolCallId: callId2, toolName: 'agent_write_file', status: 'completed' },
          { type: 'text', order: 3, timestamp: now + 3, phase: 'post-tool', content: '总结：已成功创建了 2 个文件。' }
        ],
        contentSegments: [
          { type: 'text', order: 0, timestamp: now, phase: 'pre-tool', content: '正在创建文件...' },
          { type: 'tool', order: 1, timestamp: now + 1, phase: 'in-tool', toolCallId: callId1, toolName: 'agent_write_file', status: 'completed' },
          { type: 'tool', order: 2, timestamp: now + 2, phase: 'in-tool', toolCallId: callId2, toolName: 'agent_write_file', status: 'completed' },
          { type: 'text', order: 3, timestamp: now + 3, phase: 'post-tool', content: '总结：已成功创建了 2 个文件。' }
        ]
      });

      const messages = chatStore.getState().messages || [];
      const lastMsg = messages[messages.length - 1];
      const segments = lastMsg?.segments || [];
      const lastSegment = segments[segments.length - 1];

      return {
        lastSegmentPhase: lastSegment?.phase,
        lastSegmentOrder: lastSegment?.order,
        lastSegmentContent: lastSegment?.content,
        isPostTool: lastSegment?.phase === 'post-tool',
        toolSegmentCount: segments.filter((s: any) => s.type === 'tool').length
      };
    });

    console.log('Post-tool check:', JSON.stringify(result, null, 2));
    expect(result.isPostTool).toBe(true);
    expect(result.lastSegmentOrder).toBe(3);
    expect(result.toolSegmentCount).toBe(2);
  });
});

test.describe('流式顺序 - 并发工具场景', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForTimeout(2000);
    await page.waitForFunction(() => (window as any).__chatStore !== undefined, { timeout: 15000 });
    await page.waitForTimeout(1000);
  });

  test('并发工具调用应该保持注入顺序', async ({ page }) => {
    const result = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      if (!chatStore) return { error: 'No store' };

      const now = Date.now();
      const callId1 = 'call_conc_1_' + now;
      const callId2 = 'call_conc_2_' + now;
      const batchId = 'batch_' + now;

      chatStore.getState().addMessage({
        id: 'test-user-conc-' + now,
        role: 'user',
        content: '同时扫描 src 和 dist 目录',
        timestamp: now
      });

      chatStore.getState().addMessage({
        id: 'test-assistant-conc-' + now,
        role: 'assistant',
        content: '扫描完成',
        timestamp: now + 1,
        status: 'completed',
        toolCalls: [
          {
            id: callId1,
            type: 'function' as const,
            function: { name: 'agent_list_dir', arguments: '{"path":"src"}' },
            tool: 'agent_list_dir',
            args: { path: 'src' },
            status: 'completed' as const,
            result: 'src files',
            batchId
          },
          {
            id: callId2,
            type: 'function' as const,
            function: { name: 'agent_list_dir', arguments: '{"path":"dist"}' },
            tool: 'agent_list_dir',
            args: { path: 'dist' },
            status: 'completed' as const,
            result: 'dist files',
            batchId
          }
        ],
        segments: [
          { type: 'text', order: 0, timestamp: now, phase: 'pre-tool', content: '正在扫描...' },
          { type: 'tool', order: 1, timestamp: now + 1, phase: 'in-tool', toolCallId: callId1, toolName: 'agent_list_dir', status: 'completed' },
          { type: 'tool', order: 2, timestamp: now + 2, phase: 'in-tool', toolCallId: callId2, toolName: 'agent_list_dir', status: 'completed' },
          { type: 'text', order: 3, timestamp: now + 3, phase: 'post-tool', content: '扫描完成' }
        ],
        contentSegments: [
          { type: 'text', order: 0, timestamp: now, phase: 'pre-tool', content: '正在扫描...' },
          { type: 'tool', order: 1, timestamp: now + 1, phase: 'in-tool', toolCallId: callId1, toolName: 'agent_list_dir', status: 'completed' },
          { type: 'tool', order: 2, timestamp: now + 2, phase: 'in-tool', toolCallId: callId2, toolName: 'agent_list_dir', status: 'completed' },
          { type: 'text', order: 3, timestamp: now + 3, phase: 'post-tool', content: '扫描完成' }
        ]
      });

      const messages = chatStore.getState().messages || [];
      const lastMsg = messages[messages.length - 1];
      const segments = lastMsg?.segments || [];
      const toolSegments = segments.filter((s: any) => s.type === 'tool');

      return {
        totalSegments: segments.length,
        toolSegmentsCount: toolSegments.length,
        // 验证顺序
        tool1Order: toolSegments[0]?.order,
        tool2Order: toolSegments[1]?.order,
        isOrdered: (toolSegments[0]?.order || 0) < (toolSegments[1]?.order || 0)
      };
    });

    console.log('Concurrent tools:', JSON.stringify(result, null, 2));
    expect(result.totalSegments).toBe(4);
    expect(result.toolSegmentsCount).toBe(2);
    expect(result.isOrdered).toBe(true);
  });
});
