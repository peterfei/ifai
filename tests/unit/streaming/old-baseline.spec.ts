/**
 * 旧版 StreamingResponseController 基准测试
 *
 * 用于建立旧版实现的行为基准
 * 运行方式: npm test tests/unit/streaming/old-baseline.spec.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ============================================
// 基准测试 - 旧版实现
// ============================================

describe('StreamingResponseController (Old) - 基准测试', () => {

  beforeEach(() => {
    // 设置全局 mock
    (window as any).__PIVO_BRIDGE__ = {
      push: vi.fn(),
      finalize: vi.fn()
    };
    (window as any).__PIVO_SIGNALS__ = {};
  });

  afterEach(() => {
    delete (window as any).__PIVO_BRIDGE__;
    delete (window as any).__PIVO_SIGNALS__;
  });

  describe('基础功能', () => {
    it('应存在 StreamingResponseController 类', async () => {
      const module = await import('../../../src/services/chat/StreamingResponseController');
      expect(module.StreamingResponseController).toBeDefined();
    });

    it('应提供 getInstance 方法', async () => {
      const module = await import('../../../src/services/chat/StreamingResponseController');
      expect(module.StreamingResponseController.getInstance).toBeDefined();
    });

    it('应提供 initSession 方法', async () => {
      const module = await import('../../../src/services/chat/StreamingResponseController');
      const controller = module.StreamingResponseController.getInstance();
      expect(controller.initSession).toBeDefined();
    });

    it('应提供 finalizeStream 方法', async () => {
      const module = await import('../../../src/services/chat/StreamingResponseController');
      const controller = module.StreamingResponseController.getInstance();
      expect(controller.finalizeStream).toBeDefined();
    });
  });

  describe('PIVO Bridge', () => {
    it('初始化时应创建 PIVO Bridge', async () => {
      const module = await import('../../../src/services/chat/StreamingResponseController');
      const controller = module.StreamingResponseController.getInstance();

      expect((window as any).__PIVO_BRIDGE__).toBeDefined();
      expect((window as any).__PIVO_BRIDGE__.push).toBeDefined();
      expect((window as any).__PIVO_BRIDGE__.finalize).toBeDefined();
    });

    it('PIVO Bridge.push 应该是函数', async () => {
      const module = await import('../../../src/services/chat/StreamingResponseController');
      module.StreamingResponseController.getInstance();

      expect(typeof (window as any).__PIVO_BRIDGE__.push).toBe('function');
    });

    it('PIVO Bridge.finalize 应该是函数', async () => {
      const module = await import('../../../src/services/chat/StreamingResponseController');
      module.StreamingResponseController.getInstance();

      expect(typeof (window as any).__PIVO_BRIDGE__.finalize).toBe('function');
    });
  });

  describe('自愈机制', () => {
    it('应提供 isStreamStuck 方法', async () => {
      const module = await import('../../../src/services/chat/StreamingResponseController');
      const controller = module.StreamingResponseController.getInstance();
      expect(controller.isStreamStuck).toBeDefined();
    });

    it('isStreamStuck 应返回布尔值', async () => {
      const module = await import('../../../src/services/chat/StreamingResponseController');
      const controller = module.StreamingResponseController.getInstance();

      const result = controller.isStreamStuck('non-existent-id');
      expect(typeof result).toBe('boolean');
    });
  });

  describe('事件发送', () => {
    it('应触发 chat:stream:start 事件', async () => {
      // 监听 chatEventBus
      const chatEventBusModule = await import('../../../src/stores/chat/eventBus/ChatEventBus');
      const chatEventBus = chatEventBusModule.chatEventBus;

      const startSpy = vi.fn();
      chatEventBus.on('chat:stream:start', startSpy);

      // 初始化 session
      const module = await import('../../../src/services/chat/StreamingResponseController');
      const controller = module.StreamingResponseController.getInstance();
      await controller.initSession('test-id-001', []);

      // 验证事件被触发
      expect(startSpy).toHaveBeenCalled();
      const callArgs = startSpy.mock.calls[0][0];
      expect(callArgs.messageId).toBe('test-id-001');
      expect(callArgs.correlationId).toBe('test-id-001');
    });

    it('应触发 chat:stream:finished 事件', async () => {
      const chatEventBusModule = await import('../../../src/stores/chat/eventBus/ChatEventBus');
      const chatEventBus = chatEventBusModule.chatEventBus;

      const finishSpy = vi.fn();
      chatEventBus.on('chat:stream:finished', finishSpy);

      // 初始化并完成 session
      const module = await import('../../../src/services/chat/StreamingResponseController');
      const controller = module.StreamingResponseController.getInstance();
      await controller.initSession('test-id-002', []);
      await controller.finalizeStream('test-id-002');

      // 验证事件被触发
      expect(finishSpy).toHaveBeenCalled();
      const callArgs = finishSpy.mock.calls[0][0];
      expect(callArgs.correlationId).toBe('test-id-002');
    });
  });

  describe('PIVO 测试信号', () => {
    it('finalizeStream 应设置 ifainew:stream-finished 信号', async () => {
      const module = await import('../../../src/services/chat/StreamingResponseController');
      const controller = module.StreamingResponseController.getInstance();

      await controller.initSession('test-id-signal-001', []);
      await controller.finalizeStream('test-id-signal-001');

      expect((window as any).__PIVO_SIGNALS__).toBeDefined();
      expect((window as any).__PIVO_SIGNALS__['ifainew:stream-finished']).toBeDefined();
      expect((window as any).__PIVO_SIGNALS__['ifainew:stream-finished'].id).toBe('test-id-signal-001');
    });
  });
});

// ============================================
// 导出基准快照
// ============================================

export const oldBaselineSnapshot = {
  version: '1.0.0',
  timestamp: new Date().toISOString(),
  implementation: 'old',
  features: {
    chatEventBusIntegration: true,
    pivoBridge: true,
    selfHealing: true,
    autoApproval: true,
    contentSegmentManager: false
  },
  methods: {
    getInstance: true,
    initSession: true,
    finalizeStream: true,
    isStreamStuck: true
  },
  events: {
    'chat:stream:start': true,
    'chat:stream:chunk': false,
    'chat:tool:call': false,
    'chat:stream:finished': true
  }
};
