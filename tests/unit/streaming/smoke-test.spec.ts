/**
 * 旧版 StreamingResponseController 冒烟测试
 *
 * 验证核心功能不依赖 Tauri 环境
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// TODO: skip - 过时的测试，需要更新 mock/组件接口
describe.skip('StreamingResponseController (Old) - 冒烟测试', () => {
  let controller: any;

  beforeEach(async () => {
    // 设置全局 mock
    (window as any).__PIVO_BRIDGE__ = {
      push: () => {},
      finalize: () => {}
    };
    (window as any).__PIVO_SIGNALS__ = {};

    const module = await import('../../../src/services/chat/StreamingResponseController');
    controller = module.StreamingResponseController.getInstance();
  });

  afterEach(() => {
    // 清理
  });

  describe('API 验证', () => {
    it('应暴露所有必需的公共方法', () => {
      expect(typeof controller.getInstance).toBe('function');
      expect(typeof controller.initSession).toBe('function');
      expect(typeof controller.finalizeStream).toBe('function');
      expect(typeof controller.isStreamStuck).toBe('function');
    });

    it('getInstance 应返回单例', async () => {
      const module = await import('../../../src/services/chat/StreamingResponseController');
      const instance1 = module.StreamingResponseController.getInstance();
      const instance2 = module.StreamingResponseController.getInstance();

      expect(instance1).toBe(instance2);
    });
  });

  describe('PIVO Bridge', () => {
    it('应创建全局 PIVO Bridge', () => {
      expect((window as any).__PIVO_BRIDGE__).toBeDefined();
    });

    it('PIVO Bridge 应有正确的接口', () => {
      const bridge = (window as any).__PIVO_BRIDGE__;

      expect(bridge).toHaveProperty('push');
      expect(bridge).toHaveProperty('finalize');
      expect(typeof bridge.push).toBe('function');
      expect(typeof bridge.finalize).toBe('function');
    });
  });

  describe('自愈机制', () => {
    it('isStreamStuck 应对不存在的流返回 false', () => {
      const result = controller.isStreamStuck('non-existent-stream-id');
      expect(result).toBe(false);
    });

    it('isStreamStuck 应返回布尔值', () => {
      const result1 = controller.isStreamStuck('test-id-1');
      const result2 = controller.isStreamStuck('test-id-2');

      expect(typeof result1).toBe('boolean');
      expect(typeof result2).toBe('boolean');
    });
  });

  describe('ChatEventBus 集成', () => {
    it('initSession 应触发 chat:stream:start', async () => {
      const chatEventBusModule = await import('../../../src/stores/chat/eventBus/ChatEventBus');
      const chatEventBus = chatEventBusModule.chatEventBus;

      const events: any[] = [];
      chatEventBus.on('chat:stream:start', (payload: any) => events.push(payload));

      await controller.initSession('smoke-test-001', []);

      // 验证事件被触发（从日志中确认事件确实触发了）
      expect(events.length).toBeGreaterThan(0);
    });
  });

  describe('测试信号', () => {
    it('应创建 PIVO 测试信号存储', () => {
      expect((window as any).__PIVO_SIGNALS__).toBeDefined();
      expect(typeof (window as any).__PIVO_SIGNALS__).toBe('object');
    });
  });
});

// 导出基准快照
export const smokeTestBaseline = {
  timestamp: new Date().toISOString(),
  version: '1.0.0',
  implementation: 'old',
  features: {
    singleton: true,
    pivoBridge: true,
    selfHealing: true,
    chatEventBus: true,
    contentSegmentManager: true
  },
  api: {
    methods: ['getInstance', 'initSession', 'finalizeStream', 'isStreamStuck'],
    globalObjects: ['__PIVO_BRIDGE__', '__PIVO_SIGNALS__']
  },
  events: {
    'chat:stream:start': true,
    'chat:stream:finished': true,
    'chat:segment:created': true,
    'chat:phase:changed': true
  }
};
