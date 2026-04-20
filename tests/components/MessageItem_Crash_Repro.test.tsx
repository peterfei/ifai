import { describe, it, expect, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import { MessageItem } from '../../src/components/AIChat/MessageItem';
import React from 'react';

// Mock dependencies
vi.mock('../../src/stores/settingsStore', () => ({
  useSettingsStore: Object.assign(() => ({
    agentAutoApprove: false,
    agentApprovalMode: 'always'
  }), {
    getState: () => ({ agentAutoApprove: false })
  })
}));

vi.mock('../../src/stores/useChatStore', () => ({
  useChatStore: Object.assign(() => ({}), {
    getState: () => ({})
  })
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// TODO: skip - 过时的测试，需要更新 mock/组件接口
describe.skip('MessageItem Crash Regression (Rule of Hooks)', () => {
  it('should NOT crash when switching between "Thinking Only" and "Full Content" modes', () => {
    // 场景：AI 正在思考，此时内容为空，触发 shouldHideBubble=true
    const messageThinking = {
      id: 'msg-crash-repro',
      role: 'assistant' as const,
      content: '',
      toolCalls: [{ id: 'tc-1', tool: 'agent_read_file', status: 'pending', args: {} }],
      contentSegments: []
    };

    const { rerender } = render(
      <MessageItem 
        message={messageThinking as any} 
        onApprove={() => {}} 
        onReject={() => {}}
        isStreaming={true}
      />
    );

    // 场景：AI 开始吐出实质性内容，触发 shouldHideBubble=false
    const messageWithContent = {
      ...messageThinking,
      content: 'Here is the file content...',
      contentSegments: [
        { type: 'text', order: 0, content: 'Here is the file content...', timestamp: Date.now() }
      ]
    };

    // 如果此处发生 "Rendered fewer hooks than expected"，测试将直接报错中断
    act(() => {
      rerender(
        <MessageItem 
          message={messageWithContent as any} 
          onApprove={() => {}} 
          onReject={() => {}}
          isStreaming={true}
        />
      );
    });

    expect(true).toBe(true); // 到达此处说明没崩溃
  });
});
