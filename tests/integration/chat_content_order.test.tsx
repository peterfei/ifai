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
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'zh' } }),
  initReactI18next: { init: vi.fn(), type: '3rdParty' },
  Trans: ({ children }: any) => children,
}));

describe.skip('MessageItem Content Ordering (v0.4.0 Fix)', () => {
  it('should prioritize tools over long summary but keep short intro text at the top', () => {
    // 模拟场景：
    // 1. Text: "I will do X" (order 0, short intro)
    // 2. Tool: write_file (order 1)
    // 3. Text: "Finished X" (order 2, long summary)
    
    const message = {
      id: 'msg-order-refined-test',
      role: 'assistant' as const,
      content: 'I will do X. All tasks have been completed successfully. Here is a long summary of what was changed in the project.',
      toolCalls: [{ id: 'tc-weight', tool: 'agent_write_file', status: 'completed', result: '{}', timestamp: 150 }],
      contentSegments: [
        { type: 'text', order: 0, content: 'I will do X. ', timestamp: 100 },
        { type: 'tool', order: 1, toolCallId: 'tc-weight', timestamp: 200 },
        { type: 'text', order: 2, content: 'All tasks have been completed successfully. Here is a long summary of what was changed in the project.', timestamp: 300 }
      ]
    };

    const { container } = render(
      <MessageItem 
        message={message as any} 
        onApprove={() => {}} 
        onReject={() => {}}
        isStreaming={false}
      />
    );

    const textContent = container.textContent || '';
    const introPos = textContent.indexOf('I will do X');
    const toolPos = textContent.indexOf('agent_write_file');
    const summaryPos = textContent.indexOf('All tasks have been completed');
    
    console.log(`[Test] Intro: ${introPos}, Tool: ${toolPos}, Summary: ${summaryPos}`);
    
    // 我们期望：短简介保留在顶端，工具卡片紧随其后，长总结排在工具之后
    expect(introPos).toBeLessThan(toolPos);
    expect(toolPos).toBeLessThan(summaryPos);
  });
});
