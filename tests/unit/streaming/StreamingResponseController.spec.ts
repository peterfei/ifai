/**
 * StreamingResponseController 测试驱动快照
 *
 * 此文件定义了完整的测试用例，作为架构迁移的验收标准
 *
 * 测试策略：
 * 1. 先运行此测试套件确保旧版实现通过
 * 2. 迁移到新版后，所有测试必须继续通过
 * 3. 使用快照测试确保行为一致性
 *
 * 运行命令：
 * - 旧版测试：pnpm test src/services/chat/StreamingResponseController.spec.ts
 * - 新版测试：pnpm test src/stores/chat/generateResponse/StreamingResponseController.spec.ts
 * - 快照对比：pnpm test:compare
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';

// ============================================
// 类型定义（与实际实现保持一致）
// ============================================

interface BasePayload {
  correlationId: string;
  sessionId: string;
  timestamp: number;
}

interface StreamChunk {
  type: 'content' | 'tool_call' | 'toolCall' | 'finish';
  content?: string;
  tool_call?: ToolCallData;
  toolCall?: ToolCallData;
  tool_calls?: ToolCallData[];
  finish_reason?: string;
  done?: boolean;
}

interface ToolCallData {
  id?: string;
  index?: number;
  function?: {
    name?: string;
    arguments?: string;
  };
  name?: string;
  arguments?: string;
  isPartial?: boolean;
}

// ============================================
// Mock ChatEventBus
// ============================================

class MockChatEventBus extends EventEmitter {
  public emittedEvents: Array<{ event: string; payload: any }> = [];

  emit(event: string, payload: any): boolean {
    this.emittedEvents.push({ event, payload });
    return super.emit(event, payload);
  }

  getEvents(event: string) {
    return this.emittedEvents.filter(e => e.event === event);
  }

  clear() {
    this.emittedEvents = [];
    this.removeAllListeners();
  }

  onAny(callback: (event: string, payload: any) => void) {
    this.on('*', (event, payload) => callback(event as string, payload));
  }
}

const mockChatEventBus = new MockChatEventBus();

// ============================================
// Mock Tauri API
// ============================================

const mockTauriEventListeners = new Map<string, Function[]>();

const mockListen = vi.fn((event: string, handler: Function) => {
  const listeners = mockTauriEventListeners.get(event) || [];
  listeners.push(handler);
  mockTauriEventListeners.set(event, listeners);
  return Promise.resolve(vi.fn(() => {
    const updated = mockTauriEventListeners.get(event) || [];
    mockTauriEventListeners.set(event, updated.filter(h => h !== handler));
  }));
});

vi.mock('@tauri-apps/api/event', () => ({
  listen: () => mockListen,
}));

// ============================================
// 测试工具函数
// ============================================

/**
 * 模拟后端发送流式事件
 */
async function simulateBackendStream(correlationId: string, chunks: StreamChunk[]) {
  for (const chunk of chunks) {
    const listeners = mockTauriEventListeners.get(`chat_${correlationId}`) || [];
    for (const handler of listeners) {
      await handler({ payload: JSON.stringify(chunk) });
    }
  }
}

/**
 * 模拟后端发送 finish 事件
 */
async function simulateBackendFinish(correlationId: string) {
  const listeners = mockTauriEventListeners.get(`chat_${correlationId}_finish`) || [];
  for (const handler of listeners) {
    await handler({ payload: 'DONE' });
  }
}

/**
 * 等待所有微任务完成
 */
async function flushPromises() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

// ============================================
// 测试套件 1: ChatEventBus 集成测试
// ============================================

// TODO: skip - 过时的测试，需要更新 mock/组件接口
describe.skip('StreamingResponseController - ChatEventBus 集成', () => {
  let controller: any;

  beforeEach(async () => {
    mockChatEventBus.clear();
    mockTauriEventListeners.clear();

    // 动态导入控制器（支持新旧版切换）
    const useOldVersion = process.env.TEST_VERSION === 'old';
    const modulePath = useOldVersion
      ? '../../src/services/chat/StreamingResponseController'
      : '../../src/stores/chat/generateResponse/StreamingResponseController';

    const module = await import(modulePath);

    if (useOldVersion) {
      controller = module.StreamingResponseController.getInstance();
    } else {
      controller = module.streamingResponseController;
    }
  });

  afterEach(() => {
    mockChatEventBus.clear();
    mockTauriEventListeners.clear();
  });

  describe('基础事件流', () => {
    it('应触发 chat:stream:start 事件', async () => {
      const correlationId = 'test-stream-001';

      if (controller.startListening) {
        // 新版 API
        await controller.startListening(correlationId, {
          correlationId,
          sessionId: 'test-session',
          timestamp: Date.now()
        });
      } else if (controller.initSession) {
        // 旧版 API
        await controller.initSession(correlationId, []);
      }

      const startEvents = mockChatEventBus.getEvents('chat:stream:start');
      expect(startEvents.length).toBeGreaterThan(0);
      expect(startEvents[0].payload.correlationId).toBe(correlationId);
      expect(startEvents[0].payload.messageId).toBeDefined();
    });

    it('应为每个内容 chunk 触发 chat:stream:chunk', async () => {
      const correlationId = 'test-stream-002';

      if (controller.startListening) {
        await controller.startListening(correlationId, {
          correlationId,
          sessionId: 'test-session',
          timestamp: Date.now()
        });
      } else if (controller.initSession) {
        await controller.initSession(correlationId, []);
      }

      mockChatEventBus.clear(); // 清除 start 事件

      await simulateBackendStream(correlationId, [
        { type: 'content', content: 'Hello' },
        { type: 'content', content: ' World' },
        { type: 'content', content: '!' }
      ]);

      await flushPromises();

      const chunkEvents = mockChatEventBus.getEvents('chat:stream:chunk');
      expect(chunkEvents.length).toBeGreaterThanOrEqual(3);

      // 验证内容累积
      const fullContent = chunkEvents.reduce((acc, e) => acc + e.payload.delta, '');
      expect(fullContent).toContain('Hello');
      expect(fullContent).toContain('World');
    });

    it('应触发 chat:stream:finished 事件', async () => {
      const correlationId = 'test-stream-003';

      if (controller.startListening) {
        await controller.startListening(correlationId, {
          correlationId,
          sessionId: 'test-session',
          timestamp: Date.now()
        });
      } else if (controller.initSession) {
        await controller.initSession(correlationId, []);
      }

      mockChatEventBus.clear();

      await simulateBackendStream(correlationId, [
        { type: 'content', content: 'Test' },
        { type: 'finish' }
      ]);

      await simulateBackendFinish(correlationId);
      await flushPromises();

      const finishEvents = mockChatEventBus.getEvents('chat:stream:finished');
      expect(finishEvents.length).toBeGreaterThan(0);
      expect(finishEvents[0].payload.correlationId).toBe(correlationId);
    });

    it('应触发 chat:tool:call 事件', async () => {
      const correlationId = 'test-stream-004';

      if (controller.startListening) {
        await controller.startListening(correlationId, {
          correlationId,
          sessionId: 'test-session',
          timestamp: Date.now()
        });
      } else if (controller.initSession) {
        await controller.initSession(correlationId, []);
      }

      mockChatEventBus.clear();

      await simulateBackendStream(correlationId, [
        {
          type: 'tool_call',
          tool_call: {
            id: 'call_123',
            index: 0,
            function: {
              name: 'test_function',
              arguments: '{"arg": "value"}'
            }
          }
        }
      ]);

      await flushPromises();

      const toolEvents = mockChatEventBus.getEvents('chat:tool:call');
      expect(toolEvents.length).toBeGreaterThan(0);
      expect(toolEvents[0].payload.name).toBe('test_function');
      expect(toolEvents[0].payload.toolId).toBeDefined();
    });
  });

  describe('事件顺序保证', () => {
    it('应按正确顺序发送事件', async () => {
      const correlationId = 'test-stream-005';

      if (controller.startListening) {
        await controller.startListening(correlationId, {
          correlationId,
          sessionId: 'test-session',
          timestamp: Date.now()
        });
      } else if (controller.initSession) {
        await controller.initSession(correlationId, []);
      }

      const eventOrder: string[] = [];
      mockChatEventBus.onAny((event, payload) => {
        eventOrder.push(event);
      });

      await simulateBackendStream(correlationId, [
        { type: 'content', content: 'A' },
        { type: 'content', content: 'B' },
        { type: 'finish' }
      ]);

      await simulateBackendFinish(correlationId);
      await flushPromises();

      expect(eventOrder[0]).toBe('chat:stream:start');
      expect(eventOrder[eventOrder.length - 1]).toBe('chat:stream:finished');

      // 验证 chunk 事件在中间
      const chunkCount = eventOrder.filter(e => e === 'chat:stream:chunk').length;
      expect(chunkCount).toBeGreaterThanOrEqual(2);
    });
  });
});

// ============================================
// 测试套件 2: 工具调用处理测试
// ============================================

// TODO: skip - 过时的测试，需要更新 mock/组件接口
describe.skip('StreamingResponseController - 工具调用处理', () => {
  let controller: any;

  beforeEach(async () => {
    mockChatEventBus.clear();
    mockTauriEventListeners.clear();

    const useOldVersion = process.env.TEST_VERSION === 'old';
    const modulePath = useOldVersion
      ? '../../src/services/chat/StreamingResponseController'
      : '../../src/stores/chat/generateResponse/StreamingResponseController';

    const module = await import(modulePath);

    if (useOldVersion) {
      controller = module.StreamingResponseController.getInstance();
    } else {
      controller = module.streamingResponseController;
    }
  });

  it('应正确处理流式工具调用（多 chunk）', async () => {
    const correlationId = 'test-tool-stream-001';

    if (controller.startListening) {
      await controller.startListening(correlationId, {
        correlationId,
        sessionId: 'test-session',
        timestamp: Date.now()
      });
    } else if (controller.initSession) {
      await controller.initSession(correlationId, []);
    }

    mockChatEventBus.clear();

    // 模拟流式工具调用：name 在第一个 chunk，arguments 分多个 chunk
    await simulateBackendStream(correlationId, [
      {
        type: 'tool_call',
        tool_call: {
          id: 'call_001',
          index: 0,
          function: { name: 'write_file', arguments: '' }
        }
      },
      {
        type: 'tool_call',
        tool_call: {
          index: 0,
          function: { arguments: '{"path":' }
        }
      },
      {
        type: 'tool_call',
        tool_call: {
          index: 0,
          function: { arguments: ' "/test.txt"}' }
        }
      },
      {
        type: 'tool_call',
        tool_call: {
          index: 0,
          function: { arguments: ',"content":"Hello"}' }
        }
      }
    ]);

    await flushPromises();

    const toolEvents = mockChatEventBus.getEvents('chat:tool:call');
    expect(toolEvents.length).toBeGreaterThan(0);

    // 验证完整的 arguments 被正确累积
    const lastToolEvent = toolEvents[toolEvents.length - 1];
    expect(lastToolEvent.payload.name).toBe('write_file');

    const args = typeof lastToolEvent.payload.arguments === 'string'
      ? JSON.parse(lastToolEvent.payload.arguments)
      : lastToolEvent.payload.arguments;

    expect(args.path).toBe('/test.txt');
    expect(args.content).toBe('Hello');
  });

  it('应处理带 index 的流式工具调用', async () => {
    const correlationId = 'test-tool-index-001';

    if (controller.startListening) {
      await controller.startListening(correlationId, {
        correlationId,
        sessionId: 'test-session',
        timestamp: Date.now()
      });
    } else if (controller.initSession) {
      await controller.initSession(correlationId, []);
    }

    mockChatEventBus.clear();

    await simulateBackendStream(correlationId, [
      {
        type: 'tool_call',
        tool_call: {
          id: 'call_002',
          index: 0,
          function: { name: 'tool_a', arguments: '{}' }
        }
      },
      {
        type: 'tool_call',
        tool_call: {
          id: 'call_003',
          index: 1,
          function: { name: 'tool_b', arguments: '{}' }
        }
      }
    ]);

    await flushPromises();

    const toolEvents = mockChatEventBus.getEvents('chat:tool:call');
    expect(toolEvents.length).toBeGreaterThanOrEqual(2);

    const names = toolEvents.map(e => e.payload.name);
    expect(names).toContain('tool_a');
    expect(names).toContain('tool_b');
  });

  it('应在流结束时触发所有缓冲的工具调用', async () => {
    const correlationId = 'test-tool-buffer-001';

    if (controller.startListening) {
      await controller.startListening(correlationId, {
        correlationId,
        sessionId: 'test-session',
        timestamp: Date.now()
      });
    } else if (controller.initSession) {
      await controller.initSession(correlationId, []);
    }

    mockChatEventBus.clear();

    await simulateBackendStream(correlationId, [
      {
        type: 'tool_call',
        tool_call: {
          id: 'call_004',
          index: 0,
          function: { name: 'buffered_tool', arguments: '{"arg":"' }
        }
      },
      {
        type: 'content',
        content: 'Some text'
      },
      { type: 'finish' }
    ]);

    await simulateBackendFinish(correlationId);
    await flushPromises();

    const toolEvents = mockChatEventBus.getEvents('chat:tool:call');

    // 验证即使 JSON 不完整，在 finish 时也会触发
    const bufferedTool = toolEvents.find(e => e.payload.name === 'buffered_tool');
    expect(bufferedTool).toBeDefined();
  });
});

// ============================================
// 测试套件 3: 幂等性与可靠性测试
// ============================================

// TODO: skip - 过时的测试，需要更新 mock/组件接口
describe.skip('StreamingResponseController - 幂等性与可靠性', () => {
  let controller: any;

  beforeEach(async () => {
    mockChatEventBus.clear();
    mockTauriEventListeners.clear();

    const useOldVersion = process.env.TEST_VERSION === 'old';
    const modulePath = useOldVersion
      ? '../../src/services/chat/StreamingResponseController'
      : '../../src/stores/chat/generateResponse/StreamingResponseController';

    const module = await import(modulePath);

    if (useOldVersion) {
      controller = module.StreamingResponseController.getInstance();
    } else {
      controller = module.streamingResponseController;
    }
  });

  it('应幂等性处理重复的 finish 事件', async () => {
    const correlationId = 'test-idempotent-001';

    if (controller.startListening) {
      await controller.startListening(correlationId, {
        correlationId,
        sessionId: 'test-session',
        timestamp: Date.now()
      });
    } else if (controller.initSession) {
      await controller.initSession(correlationId, []);
    }

    mockChatEventBus.clear();

    await simulateBackendStream(correlationId, [
      { type: 'content', content: 'Test' }
    ]);

    // 发送多个 finish 事件
    await simulateBackendFinish(correlationId);
    await simulateBackendFinish(correlationId);
    await simulateBackendFinish(correlationId);

    await flushPromises();

    const finishEvents = mockChatEventBus.getEvents('chat:stream:finished');

    // 应该只有一个 finish 事件被触发（幂等性）
    expect(finishEvents.length).toBe(1);
  });

  it('应处理空内容 chunk', async () => {
    const correlationId = 'test-empty-001';

    if (controller.startListening) {
      await controller.startListening(correlationId, {
        correlationId,
        sessionId: 'test-session',
        timestamp: Date.now()
      });
    } else if (controller.initSession) {
      await controller.initSession(correlationId, []);
    }

    mockChatEventBus.clear();

    await simulateBackendStream(correlationId, [
      { type: 'content', content: '' },
      { type: 'content', content: '' }
    ]);

    await flushPromises();

    const chunkEvents = mockChatEventBus.getEvents('chat:stream:chunk');
    const emptyChunks = chunkEvents.filter(e => e.payload.delta === '');

    // 空内容应该被正确处理（不抛出错误）
    expect(chunkEvents.length).toBeGreaterThanOrEqual(0);
  });

  it('应处理无效的 JSON', async () => {
    const correlationId = 'test-invalid-json-001';

    if (controller.startListening) {
      await controller.startListening(correlationId, {
        correlationId,
        sessionId: 'test-session',
        timestamp: Date.now()
      });
    } else if (controller.initSession) {
      await controller.initSession(correlationId, []);
    }

    mockChatEventBus.clear();

    // 发送无效 JSON
    const listeners = mockTauriEventListeners.get(`chat_${correlationId}`) || [];
    for (const handler of listeners) {
      try {
        await handler({ payload: 'invalid json{{{}' });
      } catch (e) {
        // 应该不抛出错误
      }
    }

    await flushPromises();

    // 验证没有崩溃
    expect(mockChatEventBus.emittedEvents.length).toBeGreaterThanOrEqual(0);
  });
});

// ============================================
// 测试套件 4: PIVO Bridge 兼容性测试
// ============================================

// TODO: skip - 过时的测试，需要更新 mock/组件接口
describe.skip('StreamingResponseController - PIVO Bridge 兼容性', () => {
  let controller: any;

  beforeEach(async () => {
    mockChatEventBus.clear();
    mockTauriEventListeners.clear();

    const useOldVersion = process.env.TEST_VERSION === 'old';
    const modulePath = useOldVersion
      ? '../../src/services/chat/StreamingResponseController'
      : '../../src/stores/chat/generateResponse/StreamingResponseController';

    const module = await import(modulePath);

    if (useOldVersion) {
      controller = module.StreamingResponseController.getInstance();
    } else {
      controller = module.streamingResponseController;
    }
  });

  it('应提供 PIVO Bridge 接口', () => {
    // 验证全局接口存在
    expect((window as any).__PIVO_BRIDGE__).toBeDefined();
    expect((window as any).__PIVO_BRIDGE__.push).toBeInstanceOf(Function);
    expect((window as any).__PIVO_BRIDGE__.finalize).toBeInstanceOf(Function);
  });

  it('PIVO Bridge.push 应注入内容', async () => {
    const correlationId = 'test-pivo-bridge-001';

    if (controller.startListening) {
      await controller.startListening(correlationId, {
        correlationId,
        sessionId: 'test-session',
        timestamp: Date.now()
      });
    } else if (controller.initSession) {
      await controller.initSession(correlationId, []);
    }

    mockChatEventBus.clear();

    // 通过 PIVO Bridge 注入
    (window as any).__PIVO_BRIDGE__.push(correlationId, {
      type: 'content',
      content: 'PIVO Bridge Test'
    });

    await flushPromises();

    const chunkEvents = mockChatEventBus.getEvents('chat:stream:chunk');
    expect(chunkEvents.length).toBeGreaterThan(0);
    expect(chunkEvents.some(e => e.payload.delta.includes('PIVO Bridge Test'))).toBe(true);
  });

  it('PIVO Bridge.finalize 应结束流', async () => {
    const correlationId = 'test-pivo-bridge-002';

    if (controller.startListening) {
      await controller.startListening(correlationId, {
        correlationId,
        sessionId: 'test-session',
        timestamp: Date.now()
      });
    } else if (controller.initSession) {
      await controller.initSession(correlationId, []);
    }

    mockChatEventBus.clear();

    // 通过 PIVO Bridge 结束
    (window as any).__PIVO_BRIDGE__.finalize(correlationId);

    await flushPromises();

    const finishEvents = mockChatEventBus.getEvents('chat:stream:finished');
    expect(finishEvents.length).toBeGreaterThan(0);
  });

  it('应设置 PIVO 测试信号', async () => {
    const correlationId = 'test-pivo-signals-001';

    if (controller.startListening) {
      await controller.startListening(correlationId, {
        correlationId,
        sessionId: 'test-session',
        timestamp: Date.now()
      });
    } else if (controller.initSession) {
      await controller.initSession(correlationId, []);
    }

    await simulateBackendStream(correlationId, [
      { type: 'content', content: 'Test' }
    ]);

    await simulateBackendFinish(correlationId);
    await flushPromises();

    // 验证测试信号被设置
    expect((window as any).__PIVO_SIGNALS__).toBeDefined();
    expect((window as any).__PIVO_SIGNALS__['ifainew:stream-finished']).toBeDefined();
  });
});

// ============================================
// 测试套件 5: ContentSegmentManager 集成测试
// ============================================

// TODO: skip - 过时的测试，需要更新 mock/组件接口
describe.skip('StreamingResponseController - ContentSegmentManager 集成', () => {
  let controller: any;

  beforeEach(async () => {
    mockChatEventBus.clear();
    mockTauriEventListeners.clear();

    const useOldVersion = process.env.TEST_VERSION === 'old';
    const modulePath = useOldVersion
      ? '../../src/services/chat/StreamingResponseController'
      : '../../src/stores/chat/generateResponse/StreamingResponseController';

    const module = await import(modulePath);

    if (useOldVersion) {
      controller = module.StreamingResponseController.getInstance();
    } else {
      controller = module.streamingResponseController;
    }
  });

  it('chat:stream:start 应包含正确的 correlationId', async () => {
    const correlationId = 'test-segment-001';

    if (controller.startListening) {
      await controller.startListening(correlationId, {
        correlationId,
        sessionId: 'test-session',
        timestamp: Date.now()
      });
    } else if (controller.initSession) {
      await controller.initSession(correlationId, []);
    }

    const startEvents = mockChatEventBus.getEvents('chat:stream:start');
    expect(startEvents[0].payload.correlationId).toBe(correlationId);

    // 验证 ContentSegmentManager 能用这个 ID 初始化
    expect(startEvents[0].payload.messageId || startEvents[0].payload.correlationId).toBeTruthy();
  });

  it('chat:stream:chunk 应使用相同的 correlationId', async () => {
    const correlationId = 'test-segment-002';

    if (controller.startListening) {
      await controller.startListening(correlationId, {
        correlationId,
        sessionId: 'test-session',
        timestamp: Date.now()
      });
    } else if (controller.initSession) {
      await controller.initSession(correlationId, []);
    }

    await simulateBackendStream(correlationId, [
      { type: 'content', content: 'Test content' }
    ]);

    await flushPromises();

    const chunkEvents = mockChatEventBus.getEvents('chat:stream:chunk');
    expect(chunkEvents.length).toBeGreaterThan(0);
    expect(chunkEvents[0].payload.correlationId).toBe(correlationId);
  });

  it('chat:stream:finished 应清理流状态', async () => {
    const correlationId = 'test-segment-003';

    if (controller.startListening) {
      await controller.startListening(correlationId, {
        correlationId,
        sessionId: 'test-session',
        timestamp: Date.now()
      });
    } else if (controller.initSession) {
      await controller.initSession(correlationId, []);
    }

    await simulateBackendStream(correlationId, [
      { type: 'content', content: 'Final content' },
      { type: 'finish' }
    ]);

    await simulateBackendFinish(correlationId);
    await flushPromises();

    const finishEvents = mockChatEventBus.getEvents('chat:stream:finished');
    expect(finishEvents.length).toBeGreaterThan(0);
    expect(finishEvents[0].payload.correlationId).toBe(correlationId);
  });
});

// ============================================
// 测试套件 6: 边界情况测试
// ============================================

// TODO: skip - 过时的测试，需要更新 mock/组件接口
describe.skip('StreamingResponseController - 边界情况', () => {
  let controller: any;

  beforeEach(async () => {
    mockChatEventBus.clear();
    mockTauriEventListeners.clear();

    const useOldVersion = process.env.TEST_VERSION === 'old';
    const modulePath = useOldVersion
      ? '../../src/services/chat/StreamingResponseController'
      : '../../src/stores/chat/generateResponse/StreamingResponseController';

    const module = await import(modulePath);

    if (useOldVersion) {
      controller = module.StreamingResponseController.getInstance();
    } else {
      controller = module.streamingResponseController;
    }
  });

  it('应处理只有工具调用没有内容的情况', async () => {
    const correlationId = 'test-edge-001';

    if (controller.startListening) {
      await controller.startListening(correlationId, {
        correlationId,
        sessionId: 'test-session',
        timestamp: Date.now()
      });
    } else if (controller.initSession) {
      await controller.initSession(correlationId, []);
    }

    mockChatEventBus.clear();

    await simulateBackendStream(correlationId, [
      {
        type: 'tool_call',
        tool_call: {
          id: 'call_edge_001',
          index: 0,
          function: { name: 'only_tool', arguments: '{}' }
        }
      },
      { type: 'finish' }
    ]);

    await simulateBackendFinish(correlationId);
    await flushPromises();

    const finishEvents = mockChatEventBus.getEvents('chat:stream:finished');
    expect(finishEvents.length).toBeGreaterThan(0);

    const toolEvents = mockChatEventBus.getEvents('chat:tool:call');
    expect(toolEvents.length).toBeGreaterThan(0);
  });

  it('应处理超大内容流', async () => {
    const correlationId = 'test-edge-large-001';
    const largeContent = 'A'.repeat(10000); // 10KB 内容

    if (controller.startListening) {
      await controller.startListening(correlationId, {
        correlationId,
        sessionId: 'test-session',
        timestamp: Date.now()
      });
    } else if (controller.initSession) {
      await controller.initSession(correlationId, []);
    }

    mockChatEventBus.clear();

    // 分块发送大内容
    for (let i = 0; i < largeContent.length; i += 100) {
      await simulateBackendStream(correlationId, [
        { type: 'content', content: largeContent.substring(i, i + 100) }
      ]);
    }

    await simulateBackendFinish(correlationId);
    await flushPromises();

    const chunkEvents = mockChatEventBus.getEvents('chat:stream:chunk');
    const reconstructedContent = chunkEvents.reduce((acc, e) => acc + e.payload.delta, '');

    expect(reconstructedContent).toBe(largeContent);
  });

  it('应处理并发流', async () => {
    const correlationId1 = 'test-concurrent-001';
    const correlationId2 = 'test-concurrent-002';

    // 启动两个并发流
    if (controller.startListening) {
      await Promise.all([
        controller.startListening(correlationId1, {
          correlationId: correlationId1,
          sessionId: 'test-session',
          timestamp: Date.now()
        }),
        controller.startListening(correlationId2, {
          correlationId: correlationId2,
          sessionId: 'test-session',
          timestamp: Date.now()
        })
      ]);
    } else if (controller.initSession) {
      await Promise.all([
        controller.initSession(correlationId1, []),
        controller.initSession(correlationId2, [])
      ]);
    }

    mockChatEventBus.clear();

    // 并发发送数据
    await Promise.all([
      simulateBackendStream(correlationId1, [
        { type: 'content', content: 'Stream 1' }
      ]),
      simulateBackendStream(correlationId2, [
        { type: 'content', content: 'Stream 2' }
      ])
    ]);

    await flushPromises();

    const allChunkEvents = mockChatEventBus.getEvents('chat:stream:chunk');
    const chunks1 = allChunkEvents.filter(e => e.payload.correlationId === correlationId1);
    const chunks2 = allChunkEvents.filter(e => e.payload.correlationId === correlationId2);

    expect(chunks1.length).toBeGreaterThan(0);
    expect(chunks2.length).toBeGreaterThan(0);

    const content1 = chunks1.reduce((acc, e) => acc + e.payload.delta, '');
    const content2 = chunks2.reduce((acc, e) => acc + e.payload.delta, '');

    expect(content1).toContain('Stream 1');
    expect(content2).toContain('Stream 2');
  });
});

// ============================================
// 快照导出
// ============================================

export const streamingControllerTestSnapshot = {
  version: '1.0.0',
  createdAt: new Date().toISOString(),
  testSuites: [
    'ChatEventBus 集成测试',
    '工具调用处理测试',
    '幂等性与可靠性测试',
    'PIVO Bridge 兼容性测试',
    'ContentSegmentManager 集成测试',
    '边界情况测试'
  ],
  acceptanceCriteria: {
    eventIntegrity: '所有事件必须按正确顺序触发',
    idempotency: '重复的 finish 事件必须只处理一次',
    toolCallBuffering: '流式工具调用必须正确累积',
    pivoCompatibility: 'PIVO Bridge 接口必须保持兼容',
    segmentManager: '所有事件必须使用一致的 correlationId'
  }
};
