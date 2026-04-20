import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useChatStore } from '../../src/stores/useChatStore';
import { useSettingsStore } from '../../src/stores/settingsStore';
import { useThreadStore } from '../../src/stores/threadStore';

// Polyfill crypto.randomUUID for test environment
if (typeof window !== 'undefined' && !window.crypto?.randomUUID) {
  Object.defineProperty(window, 'crypto', {
    value: { randomUUID: () => 'test-uuid-' + Math.random().toString(36).substring(7) },
    writable: true
  });
}

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
    t: (key: string, options?: any) => key
  }
}));

// Mock other stores dependencies
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
    getState: () => ({
      launchAgent: vi.fn()
    })
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
      // Simulate adding user message and assistant placeholder to store
      const { useChatStore } = await import('../../src/stores/useChatStore');
      const state = useChatStore.getState();
      state.addMessage({
        id: 'user-msg-test',
        role: 'user',
        content: content,
        timestamp: Date.now()
      });
      state.addMessage({
        id: 'assistant-msg-test',
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

// Mock StreamingResponseController to bypass event listening setup
vi.mock('../../src/stores/chat/generateResponse/StreamingResponseController', () => ({
  streamingResponseController: {
    startListening: vi.fn().mockResolvedValue(undefined)
  }
}));

// Mock ensureTauriInitialized
vi.mock('../../src/utils/tauriBridge', () => ({
  ensureTauriInitialized: vi.fn().mockResolvedValue(undefined)
}));

describe('Chat Flow Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useChatStore.setState({ messages: [], isLoading: false });
    useThreadStore.getState().activeThreadId = 'test-thread';
    
    // Setup Settings Store with a valid provider
    useSettingsStore.setState({
      providers: [{
        id: 'test-provider',
        name: 'Test Provider',
        enabled: true,
        apiKey: 'test-key',
        baseUrl: 'https://api.test.com',
        models: ['test-model'],
        protocol: 'openai'
      }],
      currentProviderId: 'test-provider',
      currentModel: 'test-model',
      enableNaturalLanguageAgentTrigger: false // Disable NLP for this test
    });

    // Mock listen to return a cleanup function
    listenMock.mockResolvedValue(() => {});
  });

  it('should send message and invoke ai_chat with correct args', async () => {
    const messageContent = '你好';
    const providerId = 'test-provider';
    const modelId = 'test-model';

    // Mock successful invoke
    invokeMock.mockResolvedValue(undefined);

    // 1. Send Message
    await useChatStore.getState().sendMessage(messageContent, providerId, modelId);

    // Verify invoke called with correct args
    expect(invokeMock).toHaveBeenCalledWith('ai_chat', expect.objectContaining({
      providerConfig: expect.objectContaining({
        id: 'test-provider',
        apiKey: 'test-key'
      }),
      projectRoot: '/test/project'
    }));

    // Verify loading state
    expect(useChatStore.getState().isLoading).toBe(true);

    // Verify messages in store (User msg + Assistant placeholder)
    const messages = useChatStore.getState().messages;
    expect(messages).toHaveLength(2);
    expect(messages[0].content).toBe('你好');
    expect(messages[1].role).toBe('assistant');
  });

  it('should handle invoke error', async () => {
    invokeMock.mockRejectedValue(new Error('Network Error'));

    // sendMessage will throw because generateResponse re-throws after setting isLoading: false
    try {
      await useChatStore.getState().sendMessage('你好', 'test-provider', 'test-model');
    } catch (e) {
      // Expected: invoke fails and error is propagated
    }

    // isLoading should be reset after error
    expect(useChatStore.getState().isLoading).toBe(false);
  });

  it('should fallback to cloud on local model timeout', async () => {
    // Mock local_model_preprocess to hang forever (or longer than timeout)
    invokeMock.mockImplementation((cmd) => {
      if (cmd === 'local_model_preprocess') {
        return new Promise(resolve => setTimeout(resolve, 5000));
      }
      return Promise.resolve(undefined);
    });

    // Use fake timers to fast-forward timeout
    vi.useFakeTimers();

    const sendPromise = useChatStore.getState().sendMessage('超时测试', 'test-provider', 'test-model');
    
    // Fast-forward 2.1 seconds
    vi.advanceTimersByTime(2100);
    
    await sendPromise;

    // Verify fallback to ai_chat
    expect(invokeMock).toHaveBeenCalledWith('ai_chat', expect.anything());
    
    vi.useRealTimers();
  });
});
