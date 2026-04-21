import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatInputArea } from '../../src/components/AIChat/ChatInputArea';
import { useChatStore } from '../../src/stores/useChatStore';

// 模拟核心 store
vi.mock('../../src/stores/useChatStore', () => {
  const mockState = {
    sendMessage: vi.fn(),
    messages: [
        { id: '1', role: 'user', content: 'First message' },
        { id: '2', role: 'assistant', content: 'Response 1' },
        { id: '3', role: 'user', content: 'Second message' }
    ]
  };
  return {
    useChatStore: Object.assign(() => mockState, {
      getState: () => mockState,
      setState: vi.fn()
    })
  };
});

vi.mock('../../src/stores/settingsStore', () => ({
  useSettingsStore: () => ({ 
    providers: [
      { id: 'e2e', name: 'E2E', protocol: 'openai', baseUrl: '', apiKey: '', models: ['m'], enabled: true }
    ],
    currentProviderId: 'e2e', 
    currentModel: 'm' 
  }),
}));

vi.mock('../../src/stores/fileStore', () => {
  const mockFileState = { allFilePaths: [], activeFileId: '', refreshFileTree: vi.fn() };
  return {
    useFileStore: Object.assign(() => mockFileState, {
      getState: () => mockFileState
    }),
  };
});

describe('Chat Input History Regression (v0.3.5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('SHOULD cycle through history using ArrowUp and ArrowDown keys', async () => {
    render(<ChatInputArea isLoading={false} />);
    const textarea = screen.getByPlaceholderText(/Ask DeepSeek/i) as HTMLTextAreaElement;

    // 1. 按向上键
    // 预期：显示最后一条用户消息 "Second message"
    fireEvent.keyDown(textarea, { key: 'ArrowUp', code: 'ArrowUp' });
    expect(textarea.value).toBe('Second message');

    // 2. 再次按向上键
    // 预期：显示倒数第二条用户消息 "First message"
    fireEvent.keyDown(textarea, { key: 'ArrowUp', code: 'ArrowUp' });
    expect(textarea.value).toBe('First message');

    // 3. 按向下键
    // 预期：回到 "Second message"
    fireEvent.keyDown(textarea, { key: 'ArrowDown', code: 'ArrowDown' });
    expect(textarea.value).toBe('Second message');
  });
});