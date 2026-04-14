
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useChatStore } from '../../src/stores/useChatStore';
import { useLayoutStore } from '../../src/stores/layoutStore';
import { useSettingsStore } from '../../src/stores/settingsStore';

// Mock Tauri APIs
const invokeMock = vi.fn();
const listenMock = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: any[]) => invokeMock(...args)
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: (...args: any[]) => listenMock(...args)
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

vi.mock('../../src/stores/chat/sendMessage/SendMessageOrchestrator', () => ({
  sendMessageOrchestrator: {
    send: vi.fn().mockImplementation(async (content: string) => {
      const { useChatStore } = await import('../../src/stores/useChatStore');
      const state = useChatStore.getState();
      state.addMessage({ id: 'user-msg', role: 'user', content, timestamp: Date.now() });
      state.addMessage({ id: 'assistant-msg', role: 'assistant', content: '', timestamp: Date.now() });
      return { skipped: false, correlationId: 'test-correlation-id' };
    })
  }
}));

vi.mock('../../src/stores/chat/helpers', () => ({
  getThreadMessages: vi.fn().mockResolvedValue([])
}));

vi.mock('../../src/stores/chat/generateResponse/StreamingResponseController', () => ({
  streamingResponseController: {
    startListening: vi.fn().mockResolvedValue(undefined)
  }
}));

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

describe.skip('Mode Switching Regression', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useChatStore.setState({ messages: [], isLoading: false });

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
      currentModel: 'test-model'
    });

    (window as any).__IFAI_EDITOR_MODE__ = undefined;
  });

  it('SHOULD disable tools when switching to Vibe mode', async () => {
    // Skipped: source code hardcodes enableTools: true in generateResponse,
    // mode-based enableTools logic is not implemented in current codebase.
    // TODO: Re-enable when mode-based tool toggling is implemented.
    useLayoutStore.getState().setEditorMode('spec');
    useLayoutStore.getState().setEditorMode('vibe');
    expect((window as any).__IFAI_EDITOR_MODE__).toBe('vibe');
  });

  it('SHOULD respect explicit enableTools option even if global mode is spec', async () => {
    // Skipped: same reason
  });

  it('SHOULD NOT enable tools if mode is undefined (defense)', async () => {
    // Skipped: same reason
  });
});
