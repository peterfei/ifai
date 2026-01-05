import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useChatStore } from '../../src/stores/useChatStore';
import { useSettingsStore } from '../../src/stores/settingsStore';
import { useThreadStore } from '../../src/stores/threadStore';

// Mock Tauri APIs
const invokeMock = vi.fn();
const listenMock = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: any[]) => invokeMock(...args)
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: (...args: any[]) => listenMock(...args)
}));

// Mock i18n
vi.mock('../../src/i18n/config', () => ({
  default: {
    t: (key: string) => key
  }
}));

// Mock dependencies
vi.mock('../../src/stores/fileStore', () => ({
  useFileStore: {
    getState: () => ({ rootPath: '/test/project' })
  }
}));

vi.mock('../../src/stores/agentStore', () => ({
  useAgentStore: {
    getState: () => ({ launchAgent: vi.fn() })
  }
}));

vi.mock('../../src/utils/intentRecognizer', () => ({
  recognizeIntent: () => ({ type: 'unknown', confidence: 0 }),
  shouldTriggerAgent: () => false,
  formatAgentName: (name: string) => name
}));

describe('Chat Loading State', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useChatStore.setState({ messages: [], isLoading: false });
    useThreadStore.getState().activeThreadId = 'test-thread';
    
    useSettingsStore.setState({
      providers: [{
        id: 'test-provider',
        name: 'Test Provider',
        enabled: true,
        apiKey: 'test-key',
        models: ['test-model'],
        protocol: 'openai'
      }],
      currentProviderId: 'test-provider',
      currentModel: 'test-model',
      enableNaturalLanguageAgentTrigger: false
    });

    listenMock.mockResolvedValue(() => {});
    // Mock successful invoke for local_model_preprocess to avoid TypeError
    invokeMock.mockImplementation((cmd) => {
      if (cmd === 'local_model_preprocess') {
        return Promise.resolve({ should_use_local: false });
      }
      return Promise.resolve(undefined);
    });
  });

  it('should reset isLoading to false after stream finish', async () => {
    // Capture event listeners
    const eventListeners: Record<string, (event: any) => void> = {};
    listenMock.mockImplementation((event, callback) => {
      console.log(`[Test] Registered listener for: ${event}`);
      eventListeners[event] = callback;
      return Promise.resolve(() => {});
    });

    // 1. Start request
    const sendPromise = useChatStore.getState().sendMessage('你好', 'test-provider', 'test-model');
    
    // Check loading state immediately
    expect(useChatStore.getState().isLoading).toBe(true);

    await sendPromise; // Wait for invoke to complete (listeners registered)

    // Find assistant message ID
    const messages = useChatStore.getState().messages;
    const assistantMsg = messages[1];
    expect(assistantMsg).toBeDefined();

    // 2. Simulate Finish Event
    const finishEventName = `${assistantMsg.id}_finish`;
    const finishCallback = eventListeners[finishEventName];
    console.log('[Test] finishCallback type:', typeof finishCallback);
    if (typeof finishCallback === 'function') {
        console.log('[Test] finishCallback source start:', finishCallback.toString().substring(0, 100));
    }
    expect(finishCallback).toBeDefined();

    await finishCallback({ payload: 'done' });

    // 3. Verify loading state is reset
    expect(useChatStore.getState().isLoading).toBe(false);
  });

  it('should reset isLoading to false after stream error', async () => {
    const eventListeners: Record<string, (event: any) => void> = {};
    listenMock.mockImplementation((event, callback) => {
      eventListeners[event] = callback;
      return Promise.resolve(() => {});
    });

    await useChatStore.getState().sendMessage('你好', 'test-provider', 'test-model');
    expect(useChatStore.getState().isLoading).toBe(true);

    const messages = useChatStore.getState().messages;
    const assistantMsg = messages[1];
    
    const errorEventName = `${assistantMsg.id}_error`;
    const errorCallback = eventListeners[errorEventName];
    expect(errorCallback).toBeDefined();

    await errorCallback({ payload: 'Some Error' });

    expect(useChatStore.getState().isLoading).toBe(false);
  });
});
