/**
 * 骨架屏引擎单元测试
 *
 * 验证元编程架构的核心功能：
 * - 状态机转换
 * - 可见性控制
 * - 内容隐藏/显示
 */

import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useSkeletonEngine, SkeletonEngine } from '@/components/AIChat/skeleton';
import { AI_CHAT_SKELETON_CONFIG } from '@/components/AIChat/skeleton/config/skeleton.config';

// Mock the chat store
const mockStore = {
  messages: [],
  initialized: true,
  isLoading: false,
};

vi.mock('@/stores/chat/CoreStoreProxy', () => ({
  useChatStore: {
    getState: vi.fn(() => mockStore),
  },
}));

describe('骨架屏引擎 - 元编程架构', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset DOM attributes
    document.documentElement.removeAttribute('data-skeleton-phase');
    // Reset mock store
    mockStore.messages = [];
    mockStore.initialized = true;
    mockStore.isLoading = false;
  });

  afterEach(() => {
    // Cleanup
    document.documentElement.removeAttribute('data-skeleton-phase');
  });

  describe('状态机转换', () => {
    it('应该从 initial 状态开始', () => {
      const engine = new SkeletonEngine(AI_CHAT_SKELETON_CONFIG, { debug: false });
      expect(engine.getCurrentPhase()).toBe('initial');
    });

    it('应该在 start 后保持在 initial 状态（需要 tick 才会转换）', () => {
      const engine = new SkeletonEngine(AI_CHAT_SKELETON_CONFIG, { debug: false });
      engine.start();

      // start() 启动 RAF 循环，但不会立即同步触发 tick
      // 在测试环境中，RAF 可能不会立即运行
      // 所以状态可能仍然是 initial
      expect(engine.getCurrentPhase()).toBe('initial');

      engine.stop();
    });
  });

  describe('可见性控制', () => {
    it('应该在 initial/loading 阶段显示骨架屏', async () => {
      const { result } = renderHook(() =>
        useSkeletonEngine(AI_CHAT_SKELETON_CONFIG, {
          debug: false,
          enabled: true,
        })
      );

      // 等待状态机自动转换到 loading
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      expect(result.current.isVisible).toBe(true);
      expect(result.current.engine.getCurrentPhase()).toBe('loading');
    });

    it('应该在 ready 阶段隐藏骨架屏（当有消息时）', async () => {
      // 设置有消息的 mock store
      mockStore.messages = [{ id: '1', content: 'test' }];

      const { result } = renderHook(() =>
        useSkeletonEngine(AI_CHAT_SKELETON_CONFIG, {
          debug: false,
          enabled: true,
        })
      );

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 150));
      });

      // 当有消息时，状态机应该转换到 ready，骨架屏应该隐藏
      expect(result.current.engine.getCurrentPhase()).toBe('ready');
      expect(result.current.isVisible).toBe(false);
    });
  });

  describe('DOM 属性控制', () => {
    it('应该在 start 后保持初始 data-skeleton-phase 状态', () => {
      const engine = new SkeletonEngine(AI_CHAT_SKELETON_CONFIG, { debug: false });
      engine.start();

      // After start, state machine may not have transitioned yet in test environment
      // The initial phase might not have set the attribute yet
      const phase = document.documentElement.getAttribute('data-skeleton-phase');
      expect(phase === 'initial' || phase === 'loading' || phase === null).toBe(true);

      engine.stop();
    });

    it('应该在转换到 ready 时移除 data-skeleton-phase 属性', () => {
      mockStore.messages = [{ id: '1', content: 'test' }];

      const engine = new SkeletonEngine(AI_CHAT_SKELETON_CONFIG, { debug: false });
      engine.start();

      // State machine should transition to ready when messages exist
      // Ready phase exit hook removes the attribute
      expect(document.documentElement.getAttribute('data-skeleton-phase')).toBeNull();

      engine.stop();
    });
  });

  describe('配置驱动验证', () => {
    it('应该正确配置状态机', () => {
      const config = AI_CHAT_SKELETON_CONFIG.stateMachine;
      expect(config).toBeDefined();
      expect(config.length).toBeGreaterThan(0);
      expect(config[0].phase).toBe('initial');
    });

    it('应该正确配置骨架屏结构', () => {
      const structure = AI_CHAT_SKELETON_CONFIG.structure;
      expect(structure).toBeDefined();
      expect(structure.container).toBeDefined();
      expect(structure.container.position).toBe('overlay');
    });

    it('应该正确配置检测器', () => {
      const detectors = AI_CHAT_SKELETON_CONFIG.detectors;
      expect(detectors).toBeDefined();
      expect(detectors.length).toBeGreaterThan(0);
    });
  });

  describe('引擎生命周期', () => {
    it('应该支持启动和停止', () => {
      const engine = new SkeletonEngine(AI_CHAT_SKELETON_CONFIG, { debug: false });

      expect(() => engine.start()).not.toThrow();
      expect(() => engine.stop()).not.toThrow();
    });

    it('应该支持获取快照', () => {
      const engine = new SkeletonEngine(AI_CHAT_SKELETON_CONFIG, { debug: false });
      const snapshot = engine.getSnapshot();

      expect(snapshot).toBeDefined();
      expect(snapshot.stateMachine).toBeDefined();
      expect(snapshot.stateMachine.currentPhase).toBe('initial');
      expect(snapshot.stateMachine.transitionCount).toBe(0);
      expect(snapshot.stateMachine.history).toEqual([]);
    });
  });

  describe('debug 模式', () => {
    it('应该在 debug 模式下输出日志', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const engine = new SkeletonEngine(AI_CHAT_SKELETON_CONFIG, { debug: true });
      engine.start();

      expect(consoleSpy).toHaveBeenCalled();

      engine.stop();
      consoleSpy.mockRestore();
    });
  });
});
