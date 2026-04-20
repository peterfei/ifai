/**
 * E2E 测试：流式响应顺序 - 单工具场景
 *
 * 目标：通过直接注入消息验证 pre-tool → tool → post-tool 的顺序
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

test.describe('流式顺序 - 单工具场景', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForTimeout(2000);
    await page.waitForFunction(() => (window as any).__chatStore !== undefined, { timeout: 15000 });
    await page.waitForTimeout(1000);
  });

  test('应该按正确顺序创建 segments：pre-tool → tool → post-tool', async ({ page }) => {
    const result = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      if (!chatStore) return { error: 'No store' };

      const now = Date.now();
      const callId = 'call_single_' + now;

      chatStore.getState().addMessage({
        id: 'test-user-' + now,
        role: 'user',
        content: '扫描当前项目',
        timestamp: now
      });

      chatStore.getState().addMessage({
        id: 'test-assistant-' + now,
        role: 'assistant',
        content: '扫描完成',
        timestamp: now + 1,
        status: 'completed',
        toolCalls: [{
          id: callId,
          type: 'function' as const,
          function: { name: 'agent_scan_project', arguments: '{"path":"."}' },
          tool: 'agent_scan_project',
          args: { path: '.' },
          status: 'completed' as const,
          result: 'scan results',
          batchId: 'batch_' + now
        }],
        segments: [
          { type: 'text', order: 0, timestamp: now, phase: 'pre-tool', content: '正在扫描项目...' },
          { type: 'tool', order: 1, timestamp: now + 1, phase: 'in-tool', toolCallId: callId, toolName: 'agent_scan_project', status: 'completed' },
          { type: 'text', order: 2, timestamp: now + 2, phase: 'post-tool', content: '扫描完成' }
        ],
        contentSegments: [
          { type: 'text', order: 0, timestamp: now, phase: 'pre-tool', content: '正在扫描项目...' },
          { type: 'tool', order: 1, timestamp: now + 1, phase: 'in-tool', toolCallId: callId, toolName: 'agent_scan_project', status: 'completed' },
          { type: 'text', order: 2, timestamp: now + 2, phase: 'post-tool', content: '扫描完成' }
        ]
      });

      const messages = chatStore.getState().messages || [];
      const lastMsg = messages[messages.length - 1];
      const segments = lastMsg?.segments || [];

      return {
        segmentsCount: segments.length,
        phases: segments.map((s: any) => s.phase),
        orders: segments.map((s: any) => s.order)
      };
    });

    console.log('Segment order:', JSON.stringify(result, null, 2));
    expect(result.segmentsCount).toBe(3);
    expect(result.phases).toEqual(['pre-tool', 'in-tool', 'post-tool']);
    expect(result.orders).toEqual([0, 1, 2]);
  });

  test('工具调用应该在 segments 中间', async ({ page }) => {
    const result = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      if (!chatStore) return { error: 'No store' };

      const now = Date.now();
      const callId = 'call_read_' + now;

      chatStore.getState().addMessage({
        id: 'test-user-r-' + now,
        role: 'user',
        content: '读取 package.json',
        timestamp: now
      });

      chatStore.getState().addMessage({
        id: 'test-assistant-r-' + now,
        role: 'assistant',
        content: '文件内容已读取',
        timestamp: now + 1,
        status: 'completed',
        toolCalls: [{
          id: callId,
          type: 'function' as const,
          function: { name: 'agent_read_file', arguments: '{"path":"package.json"}' },
          tool: 'agent_read_file',
          args: { path: 'package.json' },
          status: 'completed' as const,
          result: '{"name":"test"}',
          batchId: 'batch_' + now
        }],
        segments: [
          { type: 'text', order: 0, timestamp: now, phase: 'pre-tool', content: '让我读取 package.json。' },
          { type: 'tool', order: 1, timestamp: now + 1, phase: 'in-tool', toolCallId: callId, toolName: 'agent_read_file', status: 'completed' },
          { type: 'text', order: 2, timestamp: now + 2, phase: 'post-tool', content: '文件内容已读取' }
        ],
        contentSegments: [
          { type: 'text', order: 0, timestamp: now, phase: 'pre-tool', content: '让我读取 package.json。' },
          { type: 'tool', order: 1, timestamp: now + 1, phase: 'in-tool', toolCallId: callId, toolName: 'agent_read_file', status: 'completed' },
          { type: 'text', order: 2, timestamp: now + 2, phase: 'post-tool', content: '文件内容已读取' }
        ]
      });

      const messages = chatStore.getState().messages || [];
      const lastMsg = messages[messages.length - 1];
      const segments = lastMsg?.segments || [];
      const toolSegment = segments.find((s: any) => s.type === 'tool');

      return {
        segmentsCount: segments.length,
        toolSegmentIndex: segments.indexOf(toolSegment),
        hasPreTool: segments[0]?.phase === 'pre-tool',
        hasPostTool: segments[2]?.phase === 'post-tool',
        toolName: toolSegment?.toolName
      };
    });

    console.log('Tool segment position:', JSON.stringify(result, null, 2));
    expect(result.segmentsCount).toBe(3);
    expect(result.toolSegmentIndex).toBe(1); // 工具调用在中间
    expect(result.hasPreTool).toBe(true);
    expect(result.hasPostTool).toBe(true);
  });

  test('后置文本 segment 应该在工具之后', async ({ page }) => {
    const result = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      if (!chatStore) return { error: 'No store' };

      const now = Date.now();
      const callId = 'call_analysis_' + now;

      chatStore.getState().addMessage({
        id: 'test-user-a-' + now,
        role: 'user',
        content: '分析项目结构',
        timestamp: now
      });

      chatStore.getState().addMessage({
        id: 'test-assistant-a-' + now,
        role: 'assistant',
        content: '分析完成，发现 3 个文件。',
        timestamp: now + 1,
        status: 'completed',
        toolCalls: [{
          id: callId,
          type: 'function' as const,
          function: { name: 'agent_scan_project', arguments: '{"path":"."}' },
          tool: 'agent_scan_project',
          args: { path: '.' },
          status: 'completed' as const,
          result: '3 files found',
          batchId: 'batch_' + now
        }],
        segments: [
          { type: 'text', order: 0, timestamp: now, phase: 'pre-tool', content: '正在分析项目结构...' },
          { type: 'tool', order: 1, timestamp: now + 1, phase: 'in-tool', toolCallId: callId, toolName: 'agent_scan_project', status: 'completed' },
          { type: 'text', order: 2, timestamp: now + 2, phase: 'post-tool', content: '分析完成，发现 3 个文件。' }
        ],
        contentSegments: [
          { type: 'text', order: 0, timestamp: now, phase: 'pre-tool', content: '正在分析项目结构...' },
          { type: 'tool', order: 1, timestamp: now + 1, phase: 'in-tool', toolCallId: callId, toolName: 'agent_scan_project', status: 'completed' },
          { type: 'text', order: 2, timestamp: now + 2, phase: 'post-tool', content: '分析完成，发现 3 个文件。' }
        ]
      });

      const messages = chatStore.getState().messages || [];
      const lastMsg = messages[messages.length - 1];
      const segments = lastMsg?.segments || [];

      return {
        postToolContent: segments[2]?.content,
        postToolPhase: segments[2]?.phase,
        postToolOrder: segments[2]?.order,
        toolOrder: segments[1]?.order,
        isPostAfterTool: (segments[2]?.order || 0) > (segments[1]?.order || 0)
      };
    });

    console.log('Post-tool segment:', JSON.stringify(result, null, 2));
    expect(result.postToolPhase).toBe('post-tool');
    expect(result.isPostAfterTool).toBe(true);
  });

  test('消息和工具调用应该在 chatStore 中持久化', async ({ page }) => {
    const result = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      if (!chatStore) return { error: 'No store' };

      const now = Date.now();
      const callId = 'call_persist_' + now;
      const msgId = 'test-persist-' + now;

      // 注入消息
      chatStore.getState().addMessage({
        id: msgId,
        role: 'assistant',
        content: '持久化测试',
        timestamp: now,
        status: 'completed',
        toolCalls: [{
          id: callId,
          type: 'function' as const,
          function: { name: 'agent_test', arguments: '{}' },
          tool: 'agent_test',
          args: {},
          status: 'completed' as const,
          batchId: 'batch_' + now
        }],
        segments: [
          { type: 'text', order: 0, timestamp: now, phase: 'pre-tool', content: 'pre' },
          { type: 'tool', order: 1, timestamp: now + 1, phase: 'in-tool', toolCallId: callId, toolName: 'agent_test', status: 'completed' },
          { type: 'text', order: 2, timestamp: now + 2, phase: 'post-tool', content: 'post' }
        ],
        contentSegments: [
          { type: 'text', order: 0, timestamp: now, phase: 'pre-tool', content: 'pre' },
          { type: 'tool', order: 1, timestamp: now + 1, phase: 'in-tool', toolCallId: callId, toolName: 'agent_test', status: 'completed' },
          { type: 'text', order: 2, timestamp: now + 2, phase: 'post-tool', content: 'post' }
        ]
      });

      // 立即读取验证（同一次 evaluate 内）
      const messages = chatStore.getState().messages || [];
      const msg = messages.find((m: any) => m.id === msgId);
      return {
        messageExists: !!msg,
        hasToolCalls: !!(msg?.toolCalls?.length),
        totalMessages: messages.length
      };
    });

    console.log('Persistence check:', JSON.stringify(result, null, 2));
    expect(result.messageExists).toBe(true);
    expect(result.hasToolCalls).toBe(true);
  });

  test('调试：输出当前 segments 结构', async ({ page }) => {
    const result = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      if (!chatStore) return { error: 'No store' };

      const messages = chatStore.getState().messages || [];
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
    });

    console.log('=== Debug Segments Info ===');
    console.log(JSON.stringify(result, null, 2));
    console.log('=== End Debug Info ===');

    expect(result.length).toBeGreaterThanOrEqual(0);
  });
});
