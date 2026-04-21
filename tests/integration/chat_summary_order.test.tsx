import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MessageItem } from '../../src/components/AIChat/MessageItem';
import React from 'react';

// Mock ToolApproval to prevent MonacoDiffView/monaco-editor import chain
vi.mock('../../src/components/AIChat/ToolApproval', () => ({
  ToolApproval: () => null
}));

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
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'zh' } }),
  initReactI18next: { init: vi.fn(), type: '3rdParty' },
  Trans: ({ children }: any) => children,
}));

// Mock TaskSummary to check its position
vi.mock('../../src/components/AIChat/TaskSummary', () => ({
  TaskSummary: () => <div data-testid="task-summary">Changes Applied Summary</div>
}));

describe('MessageItem TaskSummary Elevation (v0.4.1)', () => {
  it('should render TaskSummary ABOVE the body text in completed messages', () => {
    const message = {
      id: 'msg-summary-pos-test',
      role: 'assistant' as const,
      content: 'Refactoring completed successfully. I have updated README.md with better descriptions.',
      toolCalls: [{ 
        id: 'tc-write', 
        tool: 'agent_write_file', 
        status: 'completed', 
        result: JSON.stringify({ path: 'README.md' }), 
        timestamp: 150 
      }],
      contentSegments: [
        { type: 'text', order: 0, content: 'Refactoring completed successfully. I have updated README.md with better descriptions.', timestamp: 200 }
      ]
    };

    const { container, getByTestId } = render(
      <MessageItem 
        message={message as any} 
        onApprove={() => {}} 
        onReject={() => {}}
        isStreaming={false}
      />
    );

    const textContent = container.textContent || '';
    const summaryPos = textContent.indexOf('Changes Applied Summary');
    const bodyTextPos = textContent.indexOf('Refactoring completed successfully');
    
    console.log(`[Test] Summary at: ${summaryPos}, Body Text at: ${bodyTextPos}`);
    
    // 断言：任务总结出现在正文之前
    expect(summaryPos).toBeLessThan(bodyTextPos);
    expect(summaryPos).toBeGreaterThan(-1);
  });
});
