import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
    t: (key: string, options?: any) => key
  }
}));

// Mock other stores dependencies
vi.mock('../../src/stores/fileStore', () => ({
  useFileStore: {
    getState: () => ({
      rootPath: '/test/project'
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

  it('should send message and handle stream response', async () => {
    const messageContent = '你好';
    const providerId = 'test-provider';
    const modelId = 'test-model';

    // Mock successful invoke
    invokeMock.mockImplementation((cmd) => {
      if (cmd === 'local_model_preprocess') {
        return Promise.resolve({ should_use_local: false });
      }
      return Promise.resolve(undefined);
    });

    // Capture event listeners
    const eventListeners: Record<string, (event: any) => void> = {};
    listenMock.mockImplementation((event, callback) => {
      eventListeners[event] = callback;
      return Promise.resolve(() => {});
    });

    // 1. Send Message
    await useChatStore.getState().sendMessage(messageContent, providerId, modelId);

    // Verify invoke called with correct args
    expect(invokeMock).toHaveBeenCalledWith('ai_chat', expect.objectContaining({
      providerConfig: expect.objectContaining({
        id: 'test-provider',
        apiKey: 'test-key'
      }),
      messages: expect.arrayContaining([
        expect.objectContaining({ role: 'user', content: '你好' })
      ]),
      projectRoot: '/test/project'
    }));

    // Verify loading state
    expect(useChatStore.getState().isLoading).toBe(true);

    // Verify messages in store (User msg + Assistant placeholder)
    const messages = useChatStore.getState().messages;
    expect(messages).toHaveLength(2);
    expect(messages[0].content).toBe('你好');
    expect(messages[1].role).toBe('assistant');
    expect(messages[1].content).toBe('');

    const assistantMsgId = messages[1].id;

    // 2. Simulate Stream Content
    const streamEventName = assistantMsgId;
    const streamCallback = eventListeners[streamEventName];
    expect(streamCallback).toBeDefined();

    // Simulate chunk 1
    streamCallback({ payload: JSON.stringify({ type: 'content', content: 'Hello' }) });
    expect(useChatStore.getState().messages[1].content).toBe('Hello');

    // Simulate chunk 2
    streamCallback({ payload: JSON.stringify({ type: 'content', content: ' World' }) });
    expect(useChatStore.getState().messages[1].content).toBe('Hello World');

    // 3. Simulate Finish
    const finishEventName = `${assistantMsgId}_finish`;
    const finishCallback = eventListeners[finishEventName];
    expect(finishCallback).toBeDefined();

    await finishCallback({ payload: 'done' });

    // Verify final state (Note: isLoading is not automatically set to false in store by default flow, 
    // it usually depends on UI or further logic, but let's check content mainly)
    expect(useChatStore.getState().messages[1].content).toBe('Hello World');
  });

  it('should handle invoke error', async () => {
    invokeMock.mockRejectedValue(new Error('Network Error'));

    await useChatStore.getState().sendMessage('你好', 'test-provider', 'test-model');

    const messages = useChatStore.getState().messages;
    expect(messages).toHaveLength(2);
    expect(messages[1].content).toContain('❌ 发送失败');
    expect(messages[1].content).toContain('Network Error');
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
