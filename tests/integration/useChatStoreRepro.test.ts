import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useChatStore } from '../../src/stores/useChatStore';
import { useSettingsStore } from '../../src/stores/settingsStore';
import { invoke } from '@tauri-apps/api/core';

// Mock Tauri invoke
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

// Mock listeners
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

describe('useChatStore Double Bubble Fix', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 重置 store
    useChatStore.setState({ messages: [] });
  });

  it('should only add user message once when local model preprocessing is active', async () => {
    // 1. 设置 Mock
    (invoke as any).mockImplementation((cmd: string) => {
      if (cmd === 'local_model_preprocess') {
        return Promise.resolve({
          should_use_local: true,
          has_tool_calls: false,
          local_response: null,
          route_reason: 'Testing'
        });
      }
      return Promise.resolve({});
    });

    // 2. 配置 Settings (直接使用 setState)
    useSettingsStore.setState({
      providers: [{
        id: 'p1', name: 'P1', enabled: true, apiKey: 'k1', baseUrl: 'b1', models: ['m1'], protocol: 'openai'
      }],
      currentProviderId: 'p1',
      currentModel: 'm1'
    });

    // 3. 执行发送
    const store = useChatStore.getState();
    const testMsg = 'Hello ' + Date.now();
    
    await store.sendMessage(testMsg, 'p1', 'm1');

    // 4. 验证结果
    const messages = useChatStore.getState().messages;
    const userMessages = messages.filter(m => m.role === 'user' && m.content === testMsg);

    console.log(`[Integration Test] Found ${userMessages.length} user messages`);
    console.log(`[Integration Test] All roles: ${messages.map(m => m.role).join(', ')}`);
    
    // 修复后，这里必须是 1
    expect(userMessages.length).toBe(1);
  });
});