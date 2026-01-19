import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createAgentListeners } from 'ifainew-core';
import { listen } from '@tauri-apps/api/event';

vi.mock('@tauri-apps/api/event');

describe('AgentListeners', () => {
  it('应该初始化事件监听器', async () => {
    const mockUnlisten = vi.fn();
    (listen as any).mockResolvedValue(mockUnlisten);

    const listeners = createAgentListeners();
    const unlisten = await listeners.init('agent-123');

    expect(listen).toHaveBeenCalledWith('agent_agent-123', expect.any(Function));
    expect(unlisten).toBe(mockUnlisten);
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
    const mockUnlisten = vi.fn();
    (listen as any).mockResolvedValue(mockUnlisten);

    const listeners = createAgentListeners();
    await listeners.init('agent-123');

    listeners.cleanup('agent-123');
    expect(mockUnlisten).toHaveBeenCalled();
  });

  it('应该清理所有监听器', async () => {
    const mockUnlisten1 = vi.fn();
    const mockUnlisten2 = vi.fn();
    (listen as any)
      .mockResolvedValueOnce(mockUnlisten1)
      .mockResolvedValueOnce(mockUnlisten2);

    const listeners = createAgentListeners();
    await listeners.init('agent-1');
    await listeners.init('agent-2');

    listeners.cleanupAll();
    expect(mockUnlisten1).toHaveBeenCalled();
    expect(mockUnlisten2).toHaveBeenCalled();
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
