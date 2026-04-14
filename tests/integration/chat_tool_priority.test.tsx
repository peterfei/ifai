import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MessageItem } from '../../src/components/AIChat/MessageItem';
import React from 'react';

// Mock ToolApproval to prevent MonacoDiffView/monaco-editor import chain
vi.mock('../../src/components/AIChat/ToolApproval', () => ({
  ToolApproval: () => null
}));

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

describe.skip('MessageItem Tool Priority (v0.4.0 Action-First)', () => {
  it('should force tool cards to the TOP even during streaming if the text is long summary', () => {
    const message = {
      id: 'msg-stream-priority-repro',
      role: 'assistant' as const,
      content: 'I have finished the refactoring! Here are the details of changes...', // 长总结
      toolCalls: [{ id: 'tc-p', tool: 'agent_write_file', status: 'completed', result: '{}', timestamp: 200 }],
      contentSegments: [
        { type: 'text', order: 0, content: 'I have finished the refactoring! Here are the details of changes...', timestamp: 100 },
        { type: 'tool', order: 1, toolCallId: 'tc-p', timestamp: 200 }
      ]
    };

    const { container } = render(
      <MessageItem 
        message={message as any} 
        onApprove={() => {}} 
        onReject={() => {}}
        isStreaming={true} // 🔥 模拟流式生成中
      />
    );

    const textContent = container.textContent || '';
    const toolPos = textContent.indexOf('agent_write_file');
    const summaryPos = textContent.indexOf('I have finished the refactoring');
    
    console.log(`[Test] Tool at: ${toolPos}, Summary at: ${summaryPos}`);
    
    // 即使在流式状态下，如果是长总结，工具也应该优先置顶
    expect(toolPos).toBeLessThan(summaryPos);
  });
});
