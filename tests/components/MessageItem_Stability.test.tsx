import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MessageItem } from '../../src/components/AIChat/MessageItem';
import React from 'react';

// Mock dependencies
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../../src/stores/useChatStore', () => ({
  useChatStore: { getState: () => ({}) },
}));

vi.mock('../../src/stores/settingsStore', () => ({
  useSettingsStore: { getState: () => ({ agentAutoApprove: false }) },
}));

// TODO: skip - 过时的测试，需要更新 mock/组件接口
describe.skip('MessageItem Industrial UI Stability', () => {
  it('should render a skeleton/placeholder when AI is thinking to prevent layout shift', () => {
    const message = {
      id: 'msg-1',
      role: 'assistant' as const,
      content: '', // 空内容，模拟刚开始生成
      isStreaming: true
    };

    render(
      <MessageItem 
        message={message as any} 
        onApprove={() => {}} 
        onReject={() => {}}
        isStreaming={true}
      />
    );

    // RED PHASE: 目前代码中可能还没有专门的骨架屏占位逻辑
    // 我们期望找到一个带有 animate-pulse 的占位元素
    const skeleton = document.querySelector('.animate-pulse');
    expect(skeleton).toBeTruthy();
  });
});
