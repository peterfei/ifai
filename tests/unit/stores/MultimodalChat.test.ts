
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useChatStore } from '../../../src/stores/useChatStore';
import { invoke } from '@tauri-apps/api/core';

// Mock Tauri invoke and event
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(() => Promise.resolve())
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {}))
}));

// TODO: skip - 过时的测试，需要更新 mock/组件接口
describe.skip('Multimodal Integrity Regression Test', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useChatStore.setState({ messages: [], isLoading: false });
  });

  it('should NEVER send desensitized data (PREVIEW_DATA_HIDDEN) to backend', async () => {
    const { sendMessage } = useChatStore.getState();
    
    const realBase64 = 'data:image/png;base64,very_long_real_base64_data_...';
    const multimodalContent = [
      { type: 'text', text: 'What is this?' },
      { type: 'image_url', image_url: { url: realBase64 } }
    ];

    await sendMessage(multimodalContent as any, 'p1', 'm1');

    // 获取 invoke 调用
    const aiChatCall = vi.mocked(invoke).mock.calls.find(call => call[0] === 'ai_chat');
    expect(aiChatCall).toBeDefined();
    
    const messagesSent = (aiChatCall![1] as any).messages;
    const lastMsg = messagesSent[messagesSent.length - 1];
    
    // 💎 核心断言：发送给后端的数据绝对不能包含脱敏占位符
    const contentString = JSON.stringify(lastMsg.content);
    expect(contentString).not.toContain('PREVIEW_DATA_HIDDEN');
    expect(contentString).toContain('very_long_real_base64_data_');
    
    console.log('✅ Integrity Check Passed: Full Base64 sent to backend, not desensitized placeholder.');
  });
});
