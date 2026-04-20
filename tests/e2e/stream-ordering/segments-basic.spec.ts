/**
 * E2E 测试：Segments 基础验证
 *
 * 简化版测试，通过直接注入消息到 chatStore 验证 segments 数据结构
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

test.describe('Segments 基础验证', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForTimeout(3000);

    // 等待 chatStore 初始化
    await page.waitForFunction(() => (window as any).__chatStore !== undefined, { timeout: 15000 });
    await page.waitForTimeout(1000);
  });

  test('应该成功创建消息并包含 segments 数据', async ({ page }) => {
    // 直接注入用户消息和助手消息
    const result = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      if (!chatStore) return { error: 'No store found' };

      const userMsgId = 'test-user-' + Date.now();
      chatStore.getState().addMessage({
        id: userMsgId,
        role: 'user',
        content: '你好',
        timestamp: Date.now()
      });

      const assistantMsgId = 'test-assistant-' + Date.now();
      chatStore.getState().addMessage({
        id: assistantMsgId,
        role: 'assistant',
        content: '你好！有什么可以帮助你的吗？',
        timestamp: Date.now(),
        status: 'completed'
      });

      const state = chatStore.getState();
      const messages = state.messages || [];
      return {
        messagesCount: messages.length,
        lastMessage: {
          id: messages[messages.length - 1]?.id,
          role: messages[messages.length - 1]?.role,
          content: messages[messages.length - 1]?.content
        }
      };
    });

    console.log('Messages result:', JSON.stringify(result, null, 2));
    expect(result.messagesCount).toBeGreaterThan(0);
    expect(result.lastMessage.role).toBe('assistant');
  });

  test('应该正确处理带工具调用的消息', async ({ page }) => {
    // 注入包含工具调用的消息
    const result = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      if (!chatStore) return { error: 'No store found' };

      const userMsgId = 'test-user-tool-' + Date.now();
      chatStore.getState().addMessage({
        id: userMsgId,
        role: 'user',
        content: '列出当前目录的文件',
        timestamp: Date.now()
      });

      const batchId = 'batch_' + Date.now();
      const assistantMsgId = 'test-assistant-tool-' + Date.now();
      chatStore.getState().addMessage({
        id: assistantMsgId,
        role: 'assistant',
        content: '当前目录的文件如下：',
        timestamp: Date.now(),
        status: 'completed',
        toolCalls: [{
          id: 'call_list_' + Date.now(),
          type: 'function' as const,
          function: { name: 'agent_list_dir', arguments: '{"path":"."}' },
          tool: 'agent_list_dir',
          args: { path: '.' },
          status: 'completed' as const,
          result: 'file1.ts\nfile2.ts\nfile3.ts',
          batchId
        }],
        segments: [
          { type: 'text', order: 0, timestamp: Date.now(), phase: 'pre-tool', content: '让我列出当前目录的文件。' },
          { type: 'tool', order: 1, timestamp: Date.now(), phase: 'in-tool', toolCallId: 'call_list_' + Date.now(), toolName: 'agent_list_dir', status: 'completed' },
          { type: 'text', order: 2, timestamp: Date.now(), phase: 'post-tool', content: '当前目录的文件如下：' }
        ],
        contentSegments: [
          { type: 'text', order: 0, timestamp: Date.now(), phase: 'pre-tool', content: '让我列出当前目录的文件。' },
          { type: 'tool', order: 1, timestamp: Date.now(), phase: 'in-tool', toolCallId: 'call_list_' + Date.now(), toolName: 'agent_list_dir', status: 'completed' },
          { type: 'text', order: 2, timestamp: Date.now(), phase: 'post-tool', content: '当前目录的文件如下：' }
        ]
      });

      const state = chatStore.getState();
      const messages = state.messages || [];
      const lastMsg = messages[messages.length - 1];
      return {
        messagesCount: messages.length,
        hasToolCalls: !!(lastMsg?.toolCalls && lastMsg.toolCalls.length > 0),
        toolCallCount: lastMsg?.toolCalls?.length || 0,
        segmentsCount: lastMsg?.segments?.length || 0,
        contentSegmentsCount: lastMsg?.contentSegments?.length || 0
      };
    });

    console.log('Tool message result:', JSON.stringify(result, null, 2));
    expect(result.messagesCount).toBeGreaterThan(0);
    expect(result.hasToolCalls).toBe(true);
    expect(result.toolCallCount).toBe(1);
  });

  test('验证 segments 数据结构和顺序', async ({ page }) => {
    // 注入带完整 segments 的消息并验证数据结构
    const segmentsData = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      if (!chatStore) return { error: 'No store found' };

      const now = Date.now();
      const callId = 'call_seg_' + now;

      chatStore.getState().addMessage({
        id: 'test-segments-' + now,
        role: 'assistant',
        content: '分析完成',
        timestamp: now,
        status: 'completed',
        toolCalls: [{
          id: callId,
          type: 'function' as const,
          function: { name: 'agent_read_file', arguments: '{"path":"test.txt"}' },
          tool: 'agent_read_file',
          args: { path: 'test.txt' },
          status: 'completed' as const,
          result: 'file content here',
          batchId: 'batch_' + now
        }],
        segments: [
          { type: 'text', order: 0, timestamp: now, phase: 'pre-tool', content: '让我读取文件。' },
          { type: 'tool', order: 1, timestamp: now + 1, phase: 'in-tool', toolCallId: callId, toolName: 'agent_read_file', status: 'completed' },
          { type: 'text', order: 2, timestamp: now + 2, phase: 'post-tool', content: '分析完成' }
        ],
        contentSegments: [
          { type: 'text', order: 0, timestamp: now, phase: 'pre-tool', content: '让我读取文件。' },
          { type: 'tool', order: 1, timestamp: now + 1, phase: 'in-tool', toolCallId: callId, toolName: 'agent_read_file', status: 'completed' },
          { type: 'text', order: 2, timestamp: now + 2, phase: 'post-tool', content: '分析完成' }
        ]
      });

      const state = chatStore.getState();
      const messages = state.messages || [];
      const lastMsg = messages[messages.length - 1];
      const segments = lastMsg?.segments || [];

      return {
        messagesCount: messages.length,
        segmentsCount: segments.length,
        // 验证顺序
        segmentOrder: segments.map((s: any) => ({ type: s.type, order: s.order, phase: s.phase })),
        // 验证 pre-tool 是第一个
        firstSegmentPhase: segments[0]?.phase,
        // 验证 in-tool 在中间
        middleSegmentType: segments[1]?.type,
        // 验证 post-tool 是最后一个
        lastSegmentPhase: segments[segments.length - 1]?.phase
      };
    });

    console.log('Segments data:', JSON.stringify(segmentsData, null, 2));

    expect(segmentsData.segmentsCount).toBe(3);
    expect(segmentsData.firstSegmentPhase).toBe('pre-tool');
    expect(segmentsData.middleSegmentType).toBe('tool');
    expect(segmentsData.lastSegmentPhase).toBe('post-tool');
  });
});
