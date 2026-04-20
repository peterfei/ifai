import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useChatStore as wrappedStore } from '../../src/stores/useChatStore';
import { useChatStore as coreStore } from 'ifainew-core';
import { listen } from '@tauri-apps/api/event';

// Mock Tauri
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue({}),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
}));

describe.skip('Chat Rendering Throttling (v0.4.0 Performance)', () => {
  const handlers: Record<string, Function> = {};

  beforeEach(() => {
    vi.clearAllMocks();
    coreStore.setState({ messages: [] });
    
    // 🔥 Mock requestAnimationFrame
    let rafCallback: any = null;
    vi.stubGlobal('requestAnimationFrame', vi.fn((cb) => {
      rafCallback = cb;
      return 1;
    }));
    
    (global as any).runNextFrame = () => {
      if (rafCallback) {
        const cb = rafCallback;
        rafCallback = null;
        cb();
      }
    };

    (listen as any).mockImplementation((event: string, handler: Function) => {
      handlers[event] = handler;
      return Promise.resolve(() => {});
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Object.keys(handlers).forEach(key => delete handlers[key]);
  });

  it('should batch high-frequency stream updates', async () => {
    // 1. 发送消息
    await wrappedStore.getState().sendMessage('test', 'p1', 'm1');
    
    // 找到 assistant 消息 ID
    const assistantMsg = coreStore.getState().messages.find(m => m.role === 'assistant');
    expect(assistantMsg).toBeDefined();
    const assistantMsgId = assistantMsg!.id;

    // 找到流监听器 (事件名就是 assistantMsgId)
    const streamHandler = handlers[assistantMsgId];
    expect(streamHandler).toBeDefined();

    // 2. 监控核心 store 的 setState 调用
    const originalSetState = coreStore.setState;
    let setStateCount = 0;
    coreStore.setState = vi.fn().mockImplementation((...args) => {
      setStateCount++;
      return originalSetState.apply(coreStore, args);
    });

    const initialCount = setStateCount;

    // 3. 模拟极高频事件 (50次)
    for (let i = 0; i < 50; i++) {
      streamHandler({ 
        payload: { type: 'content', content: `a` } 
      });
    }

    // 验证同步状态下是否成功拦截
    console.log(`[Test] setState calls before frame: ${setStateCount - initialCount}`);
    
    // 执行下一帧
    (global as any).runNextFrame();

    console.log(`[Test] setState total calls: ${setStateCount - initialCount}`);
    
    // 应该只有 1 次合并更新
    expect(setStateCount - initialCount).toBeLessThan(5);

    coreStore.setState = originalSetState;
  });
});
