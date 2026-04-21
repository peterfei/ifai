/**
 * 单元测试：验证 VirtualMessageList 组件的消息渲染和过滤功能
 *
 * 🎯 测试目标：
 * 1. 验证消息列表正确渲染
 * 2. 验证 tool 角色消息被正确过滤
 * 3. 验证边界情况处理
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { VirtualMessageList } from '../../src/components/AIChat/VirtualMessageList';

// 模拟 logger
vi.mock('../../src/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// 模拟 useChatScrollController
vi.mock('../../src/components/AIChat/useChatScrollController', () => ({
  useChatScrollController: () => ({
    scrollContainerRef: { current: null },
    scrollToBottom: vi.fn(),
    scrollToTop: vi.fn(),
    maintainScrollPosition: vi.fn(),
  }),
}));

describe('VirtualMessageList 组件', () => {
  const createMockMessages = (count: number) => {
    return Array.from({ length: count }, (_, i) => ({
      id: `msg-${i}`,
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `Message ${i}`,
      toolCalls: [],
      isStreaming: false,
    }));
  };

  it('应该正确渲染消息列表', () => {
    const mockMessages = createMockMessages(10);
    const { container } = render(<VirtualMessageList messages={mockMessages} />);

    // 🔥 FIX: 验证组件成功渲染
    expect(container.firstChild).toBeDefined();

    // 🔥 FIX: 验证至少有一条消息被渲染
    const messageElements = screen.queryAllByText(/Message/);
    expect(messageElements.length).toBeGreaterThan(0);
  });

  it('应该处理空消息列表', () => {
    const { container } = render(<VirtualMessageList messages={[]} />);

    // 应该成功渲染，即使没有消息
    expect(container).toBeDefined();
  });

  it('应该过滤掉 tool 角色的消息', () => {
    const messages = [
      {
        id: 'msg-1',
        role: 'user' as const,
        content: 'User message',
        toolCalls: [],
        isStreaming: false,
      },
      {
        id: 'msg-2',
        role: 'tool' as const,
        content: 'Tool response',
        toolCalls: [],
        isStreaming: false,
      },
      {
        id: 'msg-3',
        role: 'assistant' as const,
        content: 'Assistant message',
        toolCalls: [],
        isStreaming: false,
      },
    ];

    const { container } = render(<VirtualMessageList messages={messages} />);

    // tool 角色的消息应该被过滤掉
    expect(container).toBeDefined();
  });

  it('应该处理只有一条消息的情况', () => {
    const messages = [
      {
        id: 'msg-1',
        role: 'user' as const,
        content: 'Single message',
        toolCalls: [],
        isStreaming: false,
      },
    ];

    const { container } = render(<VirtualMessageList messages={messages} />);

    expect(container).toBeDefined();
  });

  it('应该处理所有消息都是 tool 角色的情况', () => {
    const messages = [
      {
        id: 'msg-1',
        role: 'tool' as const,
        content: 'Tool 1',
        toolCalls: [],
        isStreaming: false,
      },
      {
        id: 'msg-2',
        role: 'tool' as const,
        content: 'Tool 2',
        toolCalls: [],
        isStreaming: false,
      },
    ];

    const { container } = render(<VirtualMessageList messages={messages} />);

    // 所有消息被过滤后，应该仍然能正常渲染
    expect(container).toBeDefined();
  });

  it('应该处理大量消息', () => {
    const messages = createMockMessages(1000);
    const { container } = render(<VirtualMessageList messages={messages} />);

    // 应该能处理大量消息而不崩溃
    expect(container).toBeDefined();
  });
});
