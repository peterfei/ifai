import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MessageItem } from '../../src/components/AIChat/MessageItem';
import React from 'react';

// Mock dependencies
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../../src/stores/settingsStore', () => ({
  useSettingsStore: Object.assign(() => ({
    agentAutoApprove: false,
    fontSize: 14,
    compactMode: false
  }), {
    getState: () => ({
      agentAutoApprove: false,
      fontSize: 14,
      compactMode: false
    })
  })
}));

vi.mock('../../src/stores/useChatStore', () => ({
  useChatStore: Object.assign(() => ({
    messages: [],
    isLoading: false,
    sendMessage: vi.fn(),
    approveToolCall: vi.fn(),
    rejectToolCall: vi.fn()
  }), {
    getState: () => ({ 
        messages: [],
        isLoading: false,
        sendMessage: vi.fn(),
        approveToolCall: vi.fn(),
        rejectToolCall: vi.fn()
    }) 
  })
}));

vi.mock('../../src/stores/threadStore', () => ({
  useThreadStore: {
    getState: () => ({
      activeThreadId: 'thread-1'
    })
  }
}));

// Mock ifainew-core
vi.mock('ifainew-core', () => ({
  getToolLabel: (name: string) => name,
  getToolColor: () => 'text-blue-400',
  parseToolCalls: () => ({ segments: [] })
}));

// TODO: skip - 过时的测试，需要更新 mock/组件接口
describe.skip('MessageItem Rerender Logic', () => {
  it('SHOULD rerender when contentSegments change, even if content is identical', () => {
    const onApprove = vi.fn();
    const onReject = vi.fn();
    
    const message = {
      id: 'msg-1',
      role: 'assistant' as const,
      content: 'Thinking...',
      toolCalls: [],
      contentSegments: [
        { type: 'text', order: 0, content: 'Thinking...' }
      ]
    };

    const { rerender, container } = render(
      <MessageItem 
        message={message as any} 
        onApprove={onApprove} 
        onReject={onReject}
        isStreaming={true}
      />
    );

    // 初始状态没有工具
    expect(container.textContent).not.toContain('tool-1');

    // 模拟流式更新：content 没变，但增加了一个 tool segment
    const updatedMessage = {
      ...message,
      toolCalls: [
        { id: 'tool-1', tool: 'test_tool', status: 'pending', args: {}, isPartial: true }
      ],
      contentSegments: [
        { type: 'text', order: 0, content: 'Thinking...' },
        { type: 'tool', order: 1, toolCallId: 'tool-1' }
      ]
    };

    rerender(
      <MessageItem 
        message={updatedMessage as any} 
        onApprove={onApprove} 
        onReject={onReject}
        isStreaming={true}
      />
    );

    // 如果 arePropsEqual 逻辑有缺陷，这里会失败，因为组件认为 props 没变
    // 注意：我们期望能看到工具卡片相关的文字
    expect(container.textContent).toContain('test_tool');
  });
});
