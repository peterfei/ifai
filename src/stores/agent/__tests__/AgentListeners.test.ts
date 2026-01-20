import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createAgentListeners } from 'ifainew-core';

describe('AgentListeners - 社区版 Mock 实现', () => {
  it('应该初始化事件监听器并返回 unlisten 函数', async () => {
    const listeners = createAgentListeners();
    const unlisten = await listeners.init('agent-123');

    expect(unlisten).toBeDefined();
    expect(typeof unlisten).toBe('function');
  });

  it('应该注册外部 unlisten 函数', () => {
    const listeners = createAgentListeners();
    const mockUnlisten = vi.fn();

    listeners.register('agent-456', mockUnlisten);
    listeners.cleanup('agent-456');

    expect(mockUnlisten).toHaveBeenCalled();
  });

  it('register 应该覆盖已存在的 unlisten', () => {
    const listeners = createAgentListeners();
    const mockUnlisten1 = vi.fn();
    const mockUnlisten2 = vi.fn();

    listeners.register('agent-789', mockUnlisten1);
    listeners.register('agent-789', mockUnlisten2);
    listeners.cleanup('agent-789');

    // 第二个注册的函数应该被调用
    expect(mockUnlisten1).not.toHaveBeenCalled();
    expect(mockUnlisten2).toHaveBeenCalled();
  });

  it('应该清理特定监听器', async () => {
    const listeners = createAgentListeners();
    const unlisten = await listeners.init('agent-123');

    // 验证 unlisten 是一个函数
    expect(typeof unlisten).toBe('function');

    // 清理应该不抛出错误
    expect(() => listeners.cleanup('agent-123')).not.toThrow();
  });

  it('应该清理所有监听器', async () => {
    const listeners = createAgentListeners();
    await listeners.init('agent-1');
    await listeners.init('agent-2');

    // 清理所有应该不抛出错误
    expect(() => listeners.cleanupAll()).not.toThrow();
  });

  it('清理不存在的监听器不应报错', () => {
    const listeners = createAgentListeners();

    expect(() => listeners.cleanup('nonexistent')).not.toThrow();
  });

  it('cleanupAll 在空状态时不应报错', () => {
    const listeners = createAgentListeners();

    expect(() => listeners.cleanupAll()).not.toThrow();
  });
});
