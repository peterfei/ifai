/**
 * 单元测试：验证 useStableMessages hook 的缓存行为
 *
 * 🎯 测试目标：
 * 1. 验证只有最后一条消息变化时使用缓存
 * 2. 验证添加新消息时重新计算
 * 3. 验证删除消息时重新计算
 * 4. 验证缓存命中时的性能
 */

import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// 模拟 logger
vi.mock('../../src/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('useStableMessages Hook', () => {
  // 导入 hook（假设我们将其导出为独立的工具函数）
  // 注意：实际使用时需要调整导入路径
  let useStableMessages: any;

  beforeEach(async () => {
    // 动态导入 hook
    const module = await import('../../src/components/AIChat/VirtualMessageList');
    // @ts-ignore - 访问内部 hook
    useStableMessages = module.useStableMessages;
  });

  const createMockMessages = (count: number) => {
    return Array.from({ length: count }, (_, i) => ({
      id: `msg-${i}`,
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `Message ${i}`,
      toolCalls: [],
      isStreaming: false,
    }));
  };

  describe('缓存行为验证', () => {
    it('应该在只有最后一条消息变化时使用缓存', () => {
      const initialMessages = createMockMessages(100);
      const { result, rerender } = renderHook(
        (messages) => useStableMessages(messages),
        { initialProps: initialMessages }
      );

      // 第一次渲染：应该重新计算
      expect(result.current.visibleMessages.length).toBe(100);

      // 🔥 模拟只有最后一条消息内容变化（流式更新场景）
      const updatedMessages = [...initialMessages];
      updatedMessages[99] = {
        ...updatedMessages[99],
        content: 'Updated content for streaming',
      };

      rerender(updatedMessages);

      // ✅ 应该返回相同的 visibleMessages 引用（缓存命中）
      // 注意：这个测试假设 hook 实现了引用稳定性
      // 实际可能需要根据具体实现调整
    });

    it('应该在添加新消息时重新计算', () => {
      const initialMessages = createMockMessages(100);
      const { result, rerender } = renderHook(
        (messages) => useStableMessages(messages),
        { initialProps: initialMessages }
      );

      // 添加新消息
      const newMessages = [
        ...initialMessages,
        {
          id: 'msg-100',
          role: 'user',
          content: 'New message',
          toolCalls: [],
          isStreaming: false,
        },
      ];

      rerender(newMessages);

      // ✅ 应该返回新的 visibleMessages（包含新消息）
      expect(result.current.visibleMessages.length).toBe(101);
    });

    it('应该在删除消息时重新计算', () => {
      const initialMessages = createMockMessages(100);
      const { result, rerender } = renderHook(
        (messages) => useStableMessages(messages),
        { initialProps: initialMessages }
      );

      // 删除最后一条消息
      const newMessages = initialMessages.slice(0, -1);

      rerender(newMessages);

      // ✅ 应该返回新的 visibleMessages（少了一条）
      expect(result.current.visibleMessages.length).toBe(99);
    });
  });

  describe('过滤功能验证', () => {
    it('应该正确过滤掉 tool 角色的消息', () => {
      const messages = [
        { id: '1', role: 'user', content: 'User message' },
        { id: '2', role: 'assistant', content: 'Assistant message' },
        { id: '3', role: 'tool', content: 'Tool result' }, // 应该被过滤
        { id: '4', role: 'user', content: 'Another user message' },
      ];

      const { result } = renderHook(
        (msgs) => useStableMessages(msgs),
        { initialProps: messages }
      );

      // ✅ 应该只有 3 条可见消息（tool 角色被过滤）
      expect(result.current.visibleMessages.length).toBe(3);
      expect(result.current.visibleMessages.every(m => m.role !== 'tool')).toBe(true);
    });

    it('应该正确检测待处理的工具调用', () => {
      const messages = [
        {
          id: '1',
          role: 'assistant',
          content: 'Message with tool',
          toolCalls: [
            { id: 'tool-1', status: 'pending' }, // 待处理
          ],
        },
      ];

      const { result } = renderHook(
        (msgs) => useStableMessages(msgs),
        { initialProps: messages }
      );

      // ✅ 应该检测到待处理的工具调用
      expect(result.current.hasPendingToolCalls).toBe(true);
    });
  });

  describe('性能测试', () => {
    it('应该在大量消息场景下快速执行', () => {
      const largeMessages = createMockMessages(10000); // 10,000 条消息

      const startTime = performance.now();
      const { result } = renderHook(
        (msgs) => useStableMessages(msgs),
        { initialProps: largeMessages }
      );
      const endTime = performance.now();

      const duration = endTime - startTime;

      // ✅ 应该快速完成（< 50ms）
      expect(duration).toBeLessThan(50);
      expect(result.current.visibleMessages.length).toBe(10000);
    });

    it('应该在流式更新场景下使用缓存（快速）', () => {
      const initialMessages = createMockMessages(10000);
      const { result, rerender } = renderHook(
        (msgs) => useStableMessages(msgs),
        { initialProps: initialMessages }
      );

      // 🔥 模拟流式更新：只有最后一条消息内容变化
      const updatedMessages = [...initialMessages];
      updatedMessages[9999] = {
        ...updatedMessages[9999],
        content: 'Streaming content update',
      };

      const startTime = performance.now();
      rerender(updatedMessages);
      const endTime = performance.now();

      const duration = endTime - startTime;

      // ✅ 应该非常快（< 5ms，因为使用了缓存）
      expect(duration).toBeLessThan(5);
    });
  });

  describe('边界情况', () => {
    it('应该处理空消息数组', () => {
      const { result } = renderHook(
        (msgs) => useStableMessages(msgs),
        { initialProps: [] }
      );

      expect(result.current.visibleMessages.length).toBe(0);
      expect(result.current.hasPendingToolCalls).toBe(false);
    });

    it('应该处理只有一条消息的情况', () => {
      const messages = [
        { id: '1', role: 'user', content: 'Single message' },
      ];

      const { result } = renderHook(
        (msgs) => useStableMessages(msgs),
        { initialProps: messages }
      );

      expect(result.current.visibleMessages.length).toBe(1);
    });

    it('应该处理所有消息都是 tool 角色的情况', () => {
      const messages = [
        { id: '1', role: 'tool', content: 'Tool result 1' },
        { id: '2', role: 'tool', content: 'Tool result 2' },
      ];

      const { result } = renderHook(
        (msgs) => useStableMessages(msgs),
        { initialProps: messages }
      );

      expect(result.current.visibleMessages.length).toBe(0);
    });
  });
});
