import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatInputArea } from '../../src/components/AIChat/ChatInputArea';

// 1. Mock 物理环境
if (typeof window === 'undefined') {
  (global as any).window = {};
}

// 2. Mock 核心依赖
vi.mock('../../src/stores/useChatStore', () => ({
  useChatStore: () => ({ sendMessage: vi.fn(), messages: [] }),
}));

vi.mock('../../src/stores/settingsStore', () => ({
  useSettingsStore: () => ({ 
    providers: [
      { id: 'e2e', name: 'E2E', protocol: 'openai', baseUrl: '', apiKey: '', models: ['m'], enabled: true }
    ],
    currentProviderId: 'e2e', 
    currentModel: 'm' 
  }),
}));

vi.mock('../../src/stores/fileStore', () => ({
  useFileStore: Object.assign(() => ({
    allFilePaths: [], 
    activeFileId: '',
    refreshFileTree: vi.fn() 
  }), {
    getState: () => ({ allFilePaths: [], activeFileId: '' }),
    subscribe: vi.fn(),
  })
}));

// Mock SlashCommandList 组件 (因为它可能有复杂的外部依赖)
vi.mock('../../src/components/AIChat/SlashCommandList', () => ({
  SlashCommandList: () => <div data-testid="slash-list">Slash Command List</div>
}));

describe('v0.3.5 Regression Proof: Slash Commands & TCS', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('SHOULD trigger SlashCommandList when user types /', async () => {
    render(<ChatInputArea isLoading={false} />);
    const textarea = screen.getByPlaceholderText(/Ask DeepSeek/i) as HTMLTextAreaElement;
    
    // 模拟输入 /
    fireEvent.change(textarea, { target: { value: '/' } });
    
    // ⚠️ 预期：弹出指令面板
    // 在目前损坏的状态下，这里肯定找不到这个面板
    const panel = await screen.findByTestId('slash-list');
    expect(panel).toBeDefined();
  });
});
