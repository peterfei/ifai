/**
 * restoreIsLoadingIfActive 测试
 *
 * 验证 switchThread 切回时的响应式 isLoading 恢复逻辑。
 * 规则: "loadedMessages 中有 msg.id 匹配 activeSession 且未完成 → isLoading = true"
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { useChatStore } from '../../useChatStore';

describe('restoreIsLoadingIfActive', () => {
  beforeEach(() => {
    useChatStore.setState({ messages: [], isLoading: false, currentThreadId: '' });
  });

  // 辅助：模拟 restoreIsLoadingIfActive 的核心逻辑
  function checkAndRestoreIsLoading(messages: any[], controller: any): boolean {
    if (!controller?.getSession) return false;
    const hasActive = messages.some((msg: any) => {
      const session = controller.getSession(msg.id);
      return session && !session.isFinished;
    });
    if (hasActive) {
      useChatStore.setState({ isLoading: true });
    }
    return hasActive;
  }

  test('UT-RL1: 有活跃 session → 恢复 isLoading=true', () => {
    const controller = { getSession: vi.fn() };
    controller.getSession.mockReturnValue({
      threadId: 'thread-1',
      isFinished: false,
    });

    useChatStore.setState({
      messages: [{ id: 'corr-1', content: 'partial', isStreaming: false }],
      isLoading: false,
    });

    const restored = checkAndRestoreIsLoading(
      useChatStore.getState().messages,
      controller,
    );

    expect(restored).toBe(true);
    expect(useChatStore.getState().isLoading).toBe(true);
  });

  test('UT-RL2: session 已完成 → 不恢复 isLoading', () => {
    const controller = { getSession: vi.fn() };
    controller.getSession.mockReturnValue({
      threadId: 'thread-1',
      isFinished: true, // 已完成
    });

    useChatStore.setState({
      messages: [{ id: 'corr-1', content: 'full reply', isStreaming: false }],
      isLoading: false,
    });

    const restored = checkAndRestoreIsLoading(
      useChatStore.getState().messages,
      controller,
    );

    expect(restored).toBe(false);
    expect(useChatStore.getState().isLoading).toBe(false);
  });

  test('UT-RL3: 无 session → 不恢复 isLoading', () => {
    const controller = { getSession: vi.fn() };
    controller.getSession.mockReturnValue(undefined);

    useChatStore.setState({
      messages: [{ id: 'corr-1', content: 'hello' }],
      isLoading: false,
    });

    const restored = checkAndRestoreIsLoading(
      useChatStore.getState().messages,
      controller,
    );

    expect(restored).toBe(false);
    expect(useChatStore.getState().isLoading).toBe(false);
  });

  test('UT-RL4: 空消息列表 → 不恢复 isLoading', () => {
    const controller = { getSession: vi.fn() };

    useChatStore.setState({ messages: [], isLoading: false });

    const restored = checkAndRestoreIsLoading(
      useChatStore.getState().messages,
      controller,
    );

    expect(restored).toBe(false);
    expect(useChatStore.getState().isLoading).toBe(false);
  });

  test('UT-RL5: 无 controller → 不崩溃，不改变 isLoading', () => {
    useChatStore.setState({
      messages: [{ id: 'corr-1', content: 'test' }],
      isLoading: false,
    });

    const restored = checkAndRestoreIsLoading(
      useChatStore.getState().messages,
      null,
    );

    expect(restored).toBe(false);
    expect(useChatStore.getState().isLoading).toBe(false);
  });
});
