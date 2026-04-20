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
    getState: () => ({
      rootPath: '/test/project',
      getActiveRoot: () => ({ path: '/test/project' })
    })
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

// Mock SendMessageOrchestrator to bypass the complex send flow
vi.mock('../../src/stores/chat/sendMessage/SendMessageOrchestrator', () => ({
  sendMessageOrchestrator: {
    send: vi.fn().mockImplementation(async (content: string) => {
      const { useChatStore } = await import('../../src/stores/useChatStore');
      const state = useChatStore.getState();
      state.addMessage({
        id: 'user-msg-loading-test',
        role: 'user',
        content: content,
        timestamp: Date.now()
      });
      state.addMessage({
        id: 'assistant-msg-loading-test',
        role: 'assistant',
        content: '',
        timestamp: Date.now()
      });
      return { skipped: false, correlationId: 'test-correlation-id' };
    })
  }
}));

// Mock threadStore helper
vi.mock('../../src/stores/chat/helpers', () => ({
  getThreadMessages: vi.fn().mockResolvedValue([])
}));

// Mock StreamingResponseController
vi.mock('../../src/stores/chat/generateResponse/StreamingResponseController', () => ({
  streamingResponseController: {
    startListening: vi.fn().mockResolvedValue(undefined)
  }
}));

// Mock ensureTauriInitialized
vi.mock('../../src/utils/tauriBridge', () => ({
  ensureTauriInitialized: vi.fn().mockResolvedValue(undefined)
}));

// Polyfill crypto.randomUUID
if (typeof window !== 'undefined' && !window.crypto?.randomUUID) {
  Object.defineProperty(window, 'crypto', {
    value: { randomUUID: () => 'test-uuid-' + Math.random().toString(36).substring(7) },
    writable: true
  });
}

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
    invokeMock.mockResolvedValue(undefined);
  });

  it('should set isLoading to true during sendMessage', async () => {
    // Send message - isLoading is set after dynamic imports resolve
    const sendPromise = useChatStore.getState().sendMessage('你好', 'test-provider', 'test-model');

    // Wait for isLoading to become true (dynamic imports may take a moment)
    for (let i = 0; i < 50; i++) {
      if (useChatStore.getState().isLoading) break;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    expect(useChatStore.getState().isLoading).toBe(true);

    await sendPromise;

    // Verify messages were added
    const messages = useChatStore.getState().messages;
    expect(messages.length).toBeGreaterThanOrEqual(1);
  });

  it('should reset isLoading to false after invoke error', async () => {
    invokeMock.mockRejectedValue(new Error('Some Error'));

    try {
      await useChatStore.getState().sendMessage('你好', 'test-provider', 'test-model');
    } catch (e) {
      // Expected
    }

    expect(useChatStore.getState().isLoading).toBe(false);
  });
});
