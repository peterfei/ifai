/**
 * PersistStreamingStatus — 流式完成元数据持久化测试
 *
 * 问题描述（1.9.x）:
 * 用户打开历史对话时，内容呈现打字机式逐字输出。
 *
 * 根因分析：
 * 1. StoreMapper 在 stream:finished 中更新 in-memory 消息的 isStreaming=false, status='completed'
 * 2. useChatStore.subscribe 仅比较 {id, role, timestamp, contentLen}，不包含 isStreaming/status
 *     → contentLen 在最后 chunk 后不再变化，所以 subscriber 不检测到"变化" → 不持久化到 IndexedDB
 * 3. IndexedDB 中该消息始终是 isStreaming=true, status='streaming'
 * 4. 用户重新打开对话时，switchThread 从 IndexedDB 加载 → normalize 只重置 isStreaming=false
 *    但 status 保留为 'streaming' → UI 层检查到不完整的 metadata 导致打字机效果
 *
 * 修复方案：
 * A. 在 subscriber 比较键中加入 status 和 isStreaming，使 metadata 变化触发持久化
 * B. 在 switchThread normalize 中同时重置 status='completed'
 *
 * v2 — 新增 toolCalls 残留状态问题 (2025-05):
 * 问题分析：
 * 即使 isStreaming=false, status='completed' 都被正常重置，UI 层 MessageItem.tsx:248-250
 * 还有一个第三层检测 hasActiveToolCalls，检查 toolCalls 中的 stale 状态：
 *   tc.isPartial === true
 *   tc.status === 'pending' | 'executing' | 'running'
 * normalize 代码通过 {...msg} 传播了 toolCalls 数组，但没有重置内部的 stale 状态。
 * 导致 IndexedDB 中残留的活跃 toolCalls 触发打字机效果。
 *
 * 修复方案 C: 在 normalize 中同时重置 toolCalls 的 stale 状态
 */
import { describe, test, expect } from 'vitest';

describe('PersistStreamingStatus', () => {

  // ─── 子scriber 比较逻辑 ─────────────────────────────

  function subscriberMessagesJson(messages: any[]): string {
    // 当前代码（有 bug）：只比较 id/role/timestamp/contentLen
    return JSON.stringify(messages.map((m: any) => ({
      id: m.id,
      role: m.role,
      timestamp: m.timestamp,
      contentLen: m.content?.length || 0,
    })));
  }

  function subscriberMessagesJsonFixed(messages: any[]): string {
    // 🐛 FIX: 加入 isStreaming 和 status
    return JSON.stringify(messages.map((m: any) => ({
      id: m.id,
      role: m.role,
      timestamp: m.timestamp,
      contentLen: m.content?.length || 0,
      isStreaming: m.isStreaming,
      status: m.status,
    })));
  }

  // ─── switchThread normalize 逻辑 ─────────────────────

  function simulateNormalize(messages: any[]): any[] {
    // 现有 normalize 代码：只重置 isStreaming=false，保留 status
    return messages.map((msg: any, idx: number) => {
      if (msg.segments && msg.segments.length > 0) {
        return { ...msg, isStreaming: false, _loadOrder: idx };
      }
      const segments: any[] = [];
      if (msg.content) {
        segments.push({
          id: `seg-recovered-${msg.id}`,
          type: 'text',
          phase: 'pre-tool',
          content: msg.content,
          order: 1,
        });
      }
      return { ...msg, isStreaming: false, segments, _loadOrder: idx };
    });
  }

  function simulateNormalizeFixed(messages: any[]): any[] {
    // 🐛 FIX: 同时重置 status='completed'
    return messages.map((msg: any, idx: number) => {
      if (msg.segments && msg.segments.length > 0) {
        return { ...msg, isStreaming: false, status: 'completed', _loadOrder: idx };
      }
      const segments: any[] = [];
      if (msg.content) {
        segments.push({
          id: `seg-recovered-${msg.id}`,
          type: 'text',
          phase: 'pre-tool',
          content: msg.content,
          order: 1,
        });
      }
      return {
        ...msg,
        isStreaming: false,
        status: 'completed',
        segments,
        _loadOrder: idx,
      };
    });
  }

  // ─── normalize toolCalls 逻辑 ────────────────────────

  /**
   * 规范化 toolCalls：重置 stale 状态以防止触发打字机效果。
   * hasActiveToolCalls 检查的条件：
   *   tc.isPartial === true
   *   tc.status === 'pending' | 'executing' | 'running'
   */
  function normalizeToolCalls(toolCalls: any[] | undefined): any[] | undefined {
    if (!toolCalls || toolCalls.length === 0) return toolCalls;
    return toolCalls.map((tc: any) => {
      const status = tc.status;
      // 只有"活跃中"的状态才需要重置为 completed
      if (status === 'pending' || status === 'executing' || status === 'running') {
        return { ...tc, status: 'completed', isPartial: false };
      }
      if (tc.isPartial) {
        return { ...tc, isPartial: false };
      }
      return tc;
    });
  }

  function simulateNormalizeWithToolCallsFix(messages: any[]): any[] {
    return messages.map((msg: any, idx: number) => {
      if (msg.segments && msg.segments.length > 0) {
        return {
          ...msg,
          isStreaming: false,
          status: 'completed',
          toolCalls: normalizeToolCalls(msg.toolCalls),
          _loadOrder: idx,
        };
      }
      const segments: any[] = [];
      if (msg.content) {
        segments.push({
          id: `seg-recovered-${msg.id}`,
          type: 'text',
          phase: 'pre-tool',
          content: msg.content,
          order: 1,
        });
      }
      return {
        ...msg,
        isStreaming: false,
        status: 'completed',
        toolCalls: normalizeToolCalls(msg.toolCalls),
        segments,
        _loadOrder: idx,
      };
    });
  }

  /**
   * hasActiveToolCalls — 模拟 MessageItem.tsx:248-250 的检测逻辑
   */
  function hasActiveToolCalls(toolCalls: any[] | undefined): boolean {
    return !!(toolCalls?.some((tc: any) =>
      tc.status === 'pending' || tc.status === 'executing' || tc.status === 'running' || tc.isPartial
    ));
  }

  // ─── 测试用例 ────────────────────────────────────────

  const makeStreamingMsg = () => ({
    id: 'corr-1',
    role: 'assistant',
    content: '你好，这是一个流式回复的内容。',
    isStreaming: true,
    status: 'streaming',
    timestamp: 1000,
  });

  const makeCompletedMsg = () => ({
    id: 'corr-1',
    role: 'assistant',
    content: '你好，这是一个流式回复的内容。',
    isStreaming: false,
    status: 'completed',
    timestamp: 1000,
  });

  test('UT-PS1: 当前 subscriber 比较不检测 isStreaming/status 变化（BUG 确认）', () => {
    // 模拟 StoreMapper 完成流式：contentLen 不变，但 isStreaming/status 变化
    const beforeMsg = makeStreamingMsg();
    const afterMsg = makeCompletedMsg();

    const jsonBefore = subscriberMessagesJson([beforeMsg]);
    const jsonAfter = subscriberMessagesJson([afterMsg]);

    // 🐛 BUG: 比较字符串相同 → subscriber 不触发持久化
    expect(jsonBefore).toBe(jsonAfter);
  });

  test('UT-PS2: 修复后 subscriber 比较检测 isStreaming/status 变化', () => {
    const beforeMsg = makeStreamingMsg();
    const afterMsg = makeCompletedMsg();

    const jsonBefore = subscriberMessagesJsonFixed([beforeMsg]);
    const jsonAfter = subscriberMessagesJsonFixed([afterMsg]);

    // ✅ FIX: 比较字符串不同 → subscriber 触发持久化
    expect(jsonBefore).not.toBe(jsonAfter);
  });

  test('UT-PS3: 当前 normalize 只重置 isStreaming=false 不重置 status（BUG 确认）', () => {
    const loaded = [{
      id: 'corr-1',
      role: 'assistant',
      content: '你好，这是历史回复。',
      isStreaming: true,    // IndexedDB 中的过期值
      status: 'streaming',   // IndexedDB 中的过期值
      timestamp: 1000,
    }];

    const normalized = simulateNormalize(loaded);
    const msg = normalized[0];

    expect(msg.isStreaming).toBe(false);   // ✅ normalize 正确重置
    expect(msg.status).toBe('streaming');   // 🐛 BUG: status 未被重置
  });

  test('UT-PS4: 修复后 normalize 同时重置 status=completed', () => {
    const loaded = [{
      id: 'corr-1',
      role: 'assistant',
      content: '你好，这是历史回复。',
      isStreaming: true,
      status: 'streaming',
      timestamp: 1000,
    }];

    const normalized = simulateNormalizeFixed(loaded);
    const msg = normalized[0];

    expect(msg.isStreaming).toBe(false);
    expect(msg.status).toBe('completed');
  });

  test('UT-PS5: segments 路径也需重置 status', () => {
    const loaded = [{
      id: 'corr-1',
      role: 'assistant',
      content: '你好',
      segments: [{ id: 'seg-1', type: 'text', phase: 'pre-tool', content: '你好', order: 1 }],
      isStreaming: true,
      status: 'streaming',
      timestamp: 1000,
    }];

    const normalized = simulateNormalizeFixed(loaded);
    expect(normalized[0].isStreaming).toBe(false);
    expect(normalized[0].status).toBe('completed');
  });

  test('UT-PS6: 无 segments 无 content 的消息不报错', () => {
    const loaded = [{
      id: 'corr-1',
      role: 'assistant',
      content: '',
      isStreaming: true,
      status: 'streaming',
      timestamp: 1000,
    }];

    const normalized = simulateNormalizeFixed(loaded);
    expect(normalized[0].isStreaming).toBe(false);
    expect(normalized[0].status).toBe('completed');
    expect(normalized[0].segments).toEqual([]);
  });

  // ─── toolCalls stale status 测试 ─────────────────────

  const makeToolCallsMsg = (toolCallsOverrides?: any) => ({
    id: 'corr-1',
    role: 'assistant',
    content: '这是带工具调用的回复。',
    isStreaming: true,
    status: 'streaming',
    timestamp: 1000,
    toolCalls: [{
      id: 'tc-1',
      function: { name: 'agent_write_file', arguments: '{}' },
      status: 'executing',
      isPartial: true,
      ...toolCallsOverrides,
    }],
  });

  test('UT-PS7: 当前 normalize 不重置 toolCalls stale status — hasActiveToolCalls 仍为 true（BUG 确认）', () => {
    // 从 IndexedDB 加载的消息，toolCalls 残留 stale 状态
    const loaded = [makeToolCallsMsg()];
    const normalized = simulateNormalizeFixed(loaded);
    const msg = normalized[0];

    // isStreaming 和 status 已被重置
    expect(msg.isStreaming).toBe(false);
    expect(msg.status).toBe('completed');

    // 🐛 BUG: toolCalls 未被 normalize → hasActiveToolCalls 仍为 true
    expect(msg.toolCalls).toBeDefined();
    expect(msg.toolCalls![0].status).toBe('executing');
    expect(msg.toolCalls![0].isPartial).toBe(true);
    expect(hasActiveToolCalls(msg.toolCalls)).toBe(true);
  });

  test('UT-PS8: 修复后 normalize 重置 toolCalls isPartial 和活跃 status', () => {
    const loaded = [makeToolCallsMsg()];
    const normalized = simulateNormalizeWithToolCallsFix(loaded);
    const msg = normalized[0];

    expect(msg.isStreaming).toBe(false);
    expect(msg.status).toBe('completed');
    expect(msg.toolCalls![0].status).toBe('completed');
    expect(msg.toolCalls![0].isPartial).toBe(false);
    expect(hasActiveToolCalls(msg.toolCalls)).toBe(false);
  });

  test('UT-PS9: toolCalls pending 状态也被重置', () => {
    const loaded = [makeToolCallsMsg({ status: 'pending' })];
    const normalized = simulateNormalizeWithToolCallsFix(loaded);
    expect(normalized[0].toolCalls![0].status).toBe('completed');
    expect(hasActiveToolCalls(normalized[0].toolCalls)).toBe(false);
  });

  test('UT-PS10: toolCalls running 状态也被重置', () => {
    const loaded = [makeToolCallsMsg({ status: 'running' })];
    const normalized = simulateNormalizeWithToolCallsFix(loaded);
    expect(normalized[0].toolCalls![0].status).toBe('completed');
    expect(hasActiveToolCalls(normalized[0].toolCalls)).toBe(false);
  });

  test('UT-PS11: toolCalls completed 状态保持不变', () => {
    const loaded = [makeToolCallsMsg({ status: 'completed', isPartial: false })];
    const normalized = simulateNormalizeWithToolCallsFix(loaded);
    expect(normalized[0].toolCalls![0].status).toBe('completed');
    expect(normalized[0].toolCalls![0].isPartial).toBe(false);
    expect(hasActiveToolCalls(normalized[0].toolCalls)).toBe(false);
  });

  test('UT-PS12: 无 toolCalls 的消息不报错', () => {
    const loaded = [{
      id: 'corr-1',
      role: 'assistant',
      content: '无工具调用。',
      isStreaming: true,
      status: 'streaming',
      timestamp: 1000,
    }];
    const normalized = simulateNormalizeWithToolCallsFix(loaded);
    expect(normalized[0].toolCalls).toBeUndefined();
    expect(hasActiveToolCalls(normalized[0].toolCalls)).toBe(false);
  });
});
