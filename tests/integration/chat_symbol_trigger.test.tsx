import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatInputArea } from '../../src/components/AIChat/ChatInputArea';
import { useFileStore } from '../../src/stores/fileStore';

if (typeof window === 'undefined') { (global as any).window = {}; }

// 模拟核心 store
vi.mock('../../src/stores/useChatStore', () => ({
  useChatStore: Object.assign(() => ({ sendMessage: vi.fn(), messages: [] }), {
    getState: () => ({ sendMessage: vi.fn(), messages: [] })
  })
}));

vi.mock('../../src/stores/settingsStore', () => {
  const mockState = {
    providers: [
      { id: 'e2e', name: 'E2E', protocol: 'openai', baseUrl: '', apiKey: '', models: ['m'], enabled: true }
    ],
    currentProviderId: 'e2e',
    currentModel: 'm'
  };
  return {
    useSettingsStore: Object.assign(() => mockState, {
      getState: () => mockState
    })
  };
});

// 模拟 Tauri
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async () => [{ name: 'calculateTotal', kind: 'Function', line: 10 }]),
}));

describe('ChatInputArea Symbol Trigger (#) High-Fidelity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // 初始化 FileStore 状态，确保 openedFiles 是数组
    useFileStore.setState({
        allFilePaths: ['src/main.ts'],
        activeFileId: 'src/main.ts',
        openedFiles: [{ id: 'src/main.ts', path: '/abs/src/main.ts', name: 'main.ts' }]
    });
  });

  it('SHOULD trigger symbol search panel when user types #', async () => {
    render(<ChatInputArea isLoading={false} />);
    const textarea = screen.getByPlaceholderText(/输入消息|Type a message/i) as HTMLTextAreaElement;
    
    const val = 'help #';
    fireEvent.change(textarea, { target: { value: val, selectionStart: val.length } });
    
    const panel = await screen.findByTestId('symbol-mention-panel');
    expect(panel).toBeDefined();
    // 验证面板标题存在（i18n 可能返回 key 或翻译文本）
    expect(panel.textContent).toBeTruthy();
  });
});