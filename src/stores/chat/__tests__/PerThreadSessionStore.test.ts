/**
 * PerThreadSessionStore 测试
 *
 * 验证每个线程独立的 session 状态管理，包括 isLoading、activeStreamCount、
 * streamingIds、hasUnreadUpdate 的隔离性和全局 isLoading 的联动逻辑。
 *
 * 参考 Spec: gui-chat 1.1 Per-Thread Session State Isolation
 * 参考 Spec: gui-thread 4.1 Per-Thread Loading State
 * 参考 Spec: gui-thread 3.2 Unread Update Marker
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { PerThreadSessionStore } from '../PerThreadSessionStore';
import { useChatStore } from '../../useChatStore';

describe('PerThreadSessionStore', () => {
  let store: PerThreadSessionStore;

  beforeEach(() => {
    // 全新实例，独立测试
    store = new PerThreadSessionStore();
    // 重置 useChatStore 到已知状态
    useChatStore.setState({
      messages: [],
      isLoading: false,
      currentThreadId: 'thread-a',
      _messagesByThread: {},
    } as any);
  });

  // ─── PS-1/2: getOrCreateSession ───

  it('PS-1: getOrCreateSession returns existing session for same threadId', () => {
    const s1 = store.getOrCreateSession('thread-a');
    const s2 = store.getOrCreateSession('thread-a');
    expect(s1).toBe(s2); // 同一引用
  });

  it('PS-2: getOrCreateSession creates new default session for new threadId', () => {
    const session = store.getOrCreateSession('new-thread');
    expect(session).toBeDefined();
    expect(session.isLoading).toBe(false);
    expect(session.activeStreamCount).toBe(0);
    expect(session.streamingIds.size).toBe(0);
    expect(session.hasUnreadUpdate).toBe(false);
    expect(session.scrollPosition).toBe(0);
    expect(session.inputContent).toBe('');
    expect(session.lastEventSeq).toBe(0);
  });

  // ─── PS-3/4/5: increment/decrementStreamCount ───

  it('PS-3: incrementStreamCount isolates per thread', () => {
    store.incrementStreamCount('thread-a');
    store.incrementStreamCount('thread-a');
    store.incrementStreamCount('thread-b');

    expect(store.getSession('thread-a')!.activeStreamCount).toBe(2);
    expect(store.getSession('thread-b')!.activeStreamCount).toBe(1);
    // thread-c 从未访问，应为 undefined
    expect(store.getSession('thread-c')).toBeUndefined();
  });

  it('PS-4: decrementStreamCount decreases count per thread', () => {
    store.incrementStreamCount('thread-a');
    store.incrementStreamCount('thread-a');
    store.incrementStreamCount('thread-b');

    store.decrementStreamCount('thread-a');

    expect(store.getSession('thread-a')!.activeStreamCount).toBe(1);
    expect(store.getSession('thread-b')!.activeStreamCount).toBe(1);
  });

  it('PS-5: decrementStreamCount does not go below 0', () => {
    // 先递增创建 session
    store.incrementStreamCount('thread-a');
    expect(store.getSession('thread-a')!.activeStreamCount).toBe(1);

    // 递减到 0
    store.decrementStreamCount('thread-a');
    expect(store.getSession('thread-a')!.activeStreamCount).toBe(0);

    // 再递减应保持 0
    store.decrementStreamCount('thread-a');
    expect(store.getSession('thread-a')!.activeStreamCount).toBe(0);
  });

  // ─── PS-6: isStreamActiveForThread ───

  it('PS-6: isStreamActiveForThread returns correct value', () => {
    expect(store.isStreamActiveForThread('thread-a')).toBe(false);

    store.incrementStreamCount('thread-a');
    expect(store.isStreamActiveForThread('thread-a')).toBe(true);

    store.decrementStreamCount('thread-a');
    expect(store.isStreamActiveForThread('thread-a')).toBe(false);

    // 未访问的线程
    expect(store.isStreamActiveForThread('unknown')).toBe(false);
  });

  // ─── PS-7/8: setLoading ───

  it('PS-7: setLoading updates global isLoading only if thread is current', () => {
    useChatStore.setState({ currentThreadId: 'thread-a', isLoading: false });

    // thread-a 是当前线程 → 更新全局 isLoading
    store.setLoading('thread-a', true);
    expect(useChatStore.getState().isLoading).toBe(true);
    expect(store.getSession('thread-a')!.isLoading).toBe(true);

    // thread-b 非当前线程 → 不更新全局 isLoading
    store.setLoading('thread-b', true);
    // 全局 isLoading 不受 B 影响（保持为 true 是 A 设的，但 B 不应改变它）
    // 注意：这里 isLoading 是 true 是因为 A 设的，B 不应覆盖
    expect(store.getSession('thread-b')!.isLoading).toBe(true);

    // 将 thread-b 设为当前线程
    useChatStore.setState({ currentThreadId: 'thread-b' });

    // 现在 thread-b 是当前线程 → 设为 false 应影响全局
    store.setLoading('thread-b', false);
    expect(useChatStore.getState().isLoading).toBe(false);
    expect(store.getSession('thread-b')!.isLoading).toBe(false);
  });

  it('PS-8: setLoading preserves non-current thread state after switch and return', () => {
    useChatStore.setState({ currentThreadId: 'thread-a', isLoading: false });

    // A 设置为 loading
    store.setLoading('thread-a', true);
    expect(store.getSession('thread-a')!.isLoading).toBe(true);

    // 切到 B，全局 isLoading 为 false（B 没有 loading）
    useChatStore.setState({ currentThreadId: 'thread-b', isLoading: false });

    // A 的 per-thread loading 应该保持 true
    expect(store.getSession('thread-a')!.isLoading).toBe(true);

    // 切回 A
    useChatStore.setState({ currentThreadId: 'thread-a' });

    // A 的 per-thread loading 仍为 true（没有被切换清除）
    expect(store.getSession('thread-a')!.isLoading).toBe(true);
  });

  // ─── PS-9/10: hasUnreadUpdate ───

  it('PS-9: setHasUnreadUpdate tags non-visible thread', () => {
    store.setHasUnreadUpdate('thread-a', true);
    expect(store.getSession('thread-a')!.hasUnreadUpdate).toBe(true);

    store.setHasUnreadUpdate('thread-b', true);
    expect(store.getSession('thread-b')!.hasUnreadUpdate).toBe(true);
  });

  it('PS-10: clearUnreadUpdate resets tag', () => {
    store.setHasUnreadUpdate('thread-a', true);
    expect(store.getSession('thread-a')!.hasUnreadUpdate).toBe(true);

    store.clearUnreadUpdate('thread-a');
    expect(store.getSession('thread-a')!.hasUnreadUpdate).toBe(false);
  });

  // ─── PS-11: deleteSession ───

  it('PS-11: deleteSession removes session data', () => {
    store.getOrCreateSession('thread-a');
    expect(store.getSession('thread-a')).toBeDefined();

    store.deleteSession('thread-a');
    expect(store.getSession('thread-a')).toBeUndefined();

    // 删除不存在的线程不报错
    store.deleteSession('non-existent');
  });

  // ─── 补充: getSession 返回 undefined ───

  it('getSession returns undefined for unknown thread', () => {
    expect(store.getSession('never-created')).toBeUndefined();
  });

  // ─── 补充: decrementStreamCount for unknown thread ───
  it('decrementStreamCount on unknown thread does nothing', () => {
    // 对从未访问的线程调用 decrement，不应 crash，不应创建 session
    store.decrementStreamCount('unknown');
    expect(store.getSession('unknown')).toBeUndefined();
  });
});
