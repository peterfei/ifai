import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatInputArea } from '../../src/components/AIChat/ChatInputArea';

// 1. Mock 物理环境
if (typeof window === 'undefined') {
  (global as any).window = {};
}

// 模拟文件列表
(window as any).__IFAI_ALL_FILES__ = [
  'src/main.tsx',
  'src/App.tsx',
  'src/stores/useChatStore.ts',
  'package.json'
];

// 2. Mock Stores
vi.mock('../../src/stores/useChatStore', () => ({
  useChatStore: () => ({
    sendMessage: vi.fn(),
    messages: [],
  }),
}));

vi.mock('../../src/stores/settingsStore', () => ({
  useSettingsStore: () => ({
    providers: [
      { id: 'openai', name: 'OpenAI', protocol: 'openai', baseUrl: '', apiKey: '', models: ['gpt-4o'], enabled: true }
    ],
    currentProviderId: 'openai',
    currentModel: 'gpt-4o',
  }),
}));

describe('ChatInputArea High-Fidelity Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('SHOULD trigger Agent selector when user types @ (empty filter)', async () => {
    render(<ChatInputArea isLoading={false} />);

    const textarea = screen.getByPlaceholderText(/输入消息|Type a message/i);

    // 模拟用户输入 @
    fireEvent.change(textarea, { target: { value: '@' } });

    // 预期：弹出 Agent 选择器（空 filter 优先展示 Agent）
    const agentSelector = await screen.findByTestId('agent-selector');
    expect(agentSelector).toBeDefined();
  });

  it('SHOULD trigger fuzzy search when @ filter does not match any Agent', async () => {
    render(<ChatInputArea isLoading={false} />);

    const textarea = screen.getByPlaceholderText(/输入消息|Type a message/i);

    // 模拟用户输入 @ma（不匹配任何 Agent，回退到文件搜索）
    fireEvent.change(textarea, { target: { value: '@ma' } });

    // 预期：弹出文件搜索面板
    const searchPanel = await screen.findByTestId('file-mention-panel');
    expect(searchPanel).toBeDefined();
  });

  it('SHOULD insert file reference when a result is selected', async () => {
    render(<ChatInputArea isLoading={false} />);
    const textarea = screen.getByPlaceholderText(/输入消息|Type a message/i) as HTMLTextAreaElement;
    
    fireEvent.change(textarea, { target: { value: '请帮我解释下 @ma' } });
    
    const resultItem = await screen.findByText('main.tsx');
    fireEvent.click(resultItem);
    
    // 预期：文本框内容被替换为带引用的格式
    expect(textarea.value).toContain('[#main.tsx](src/main.tsx)');
    
    // 预期：搜索面板关闭
    expect(screen.queryByTestId('file-mention-panel')).toBeNull();
  });

  it('SHOULD maintain high-tech button states (Send Button Glow)', async () => {
    render(<ChatInputArea isLoading={false} />);
    const sendButton = screen.getByTestId('chat-send-button');
    const textarea = screen.getByPlaceholderText(/输入消息|Type a message/i);
    
    // 初始状态：按钮应该是禁用样式
    expect(sendButton.className).toContain('theme-button-secondary');

    // 输入内容
    fireEvent.change(textarea, { target: { value: 'Hello' } });

    // 预期：按钮变为激活样式并带有辉光
    expect(sendButton.className).toContain('theme-button-primary');
    expect(sendButton.className).toContain('theme-glow-accent');
  });
});
