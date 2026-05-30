/**
 * PerThreadSessionStore
 *
 * 每个线程独立的 session 状态管理器。
 * 管理 per-thread isLoading、activeStreamCount、streamingIds、hasUnreadUpdate。
 *
 * 与全局 useChatStore.isLoading 联动：
 * - 仅当前线程的 setLoading 会影响全局 isLoading
 * - 非当前线程的 streaming 计数不影响全局 isLoading
 *
 * 参考 Spec: gui-chat 1.1 Per-Thread Session State Isolation
 * 参考 Spec: gui-thread 4.1 Per-Thread Loading State
 */
import { useChatStore } from '../useChatStore';

export interface PerThreadSession {
  isLoading: boolean;
  activeStreamCount: number;
  streamingIds: Set<string>;
  hasUnreadUpdate: boolean;
  scrollPosition: number;
  inputContent: string;
  lastEventSeq: number;
}

function createDefaultSession(): PerThreadSession {
  return {
    isLoading: false,
    activeStreamCount: 0,
    streamingIds: new Set(),
    hasUnreadUpdate: false,
    scrollPosition: 0,
    inputContent: '',
    lastEventSeq: 0,
  };
}

export class PerThreadSessionStore {
  private sessions = new Map<string, PerThreadSession>();

  /**
   * 获取或创建线程的 session。
   * 第一次访问新线程时自动创建默认 session。
   */
  getOrCreateSession(threadId: string): PerThreadSession {
    let session = this.sessions.get(threadId);
    if (!session) {
      session = createDefaultSession();
      this.sessions.set(threadId, session);
    }
    return session;
  }

  /**
   * 获取线程的 session。如果线程从未访问过，返回 undefined。
   */
  getSession(threadId: string): PerThreadSession | undefined {
    return this.sessions.get(threadId);
  }

  /**
   * 删除线程的 session 数据。
   */
  deleteSession(threadId: string): void {
    this.sessions.delete(threadId);
  }

  /**
   * 递增线程的活跃 stream 计数。
   * 如果该线程是当前线程，同时更新全局 isLoading = true。
   */
  incrementStreamCount(threadId: string): void {
    const session = this.getOrCreateSession(threadId);
    session.activeStreamCount++;
    // 🏆 同步 per-thread isLoading 与 activeStreamCount
    if (session.activeStreamCount > 0) {
      session.isLoading = true;
    }

    if (useChatStore.getState().currentThreadId === threadId) {
      useChatStore.setState({ isLoading: true } as any);
    }
  }

  /**
   * 递减线程的活跃 stream 计数（最小值为 0）。
   * 如果该线程是当前线程且计数归零，更新全局 isLoading = false。
   * 从未访问的线程调用时不做任何操作（不创建 session）。
   */
  decrementStreamCount(threadId: string): void {
    const session = this.sessions.get(threadId);
    if (!session) return;

    session.activeStreamCount = Math.max(0, session.activeStreamCount - 1);
    // 🏆 同步 per-thread isLoading 与 activeStreamCount
    if (session.activeStreamCount === 0) {
      session.isLoading = false;
    }

    const currentTid = useChatStore.getState().currentThreadId;
    if (currentTid === threadId) {
      if (session.activeStreamCount === 0) {
        useChatStore.setState({ isLoading: false } as any);
      }
    }
  }

  /**
   * 检查线程是否有活跃的 stream。
   */
  isStreamActiveForThread(threadId: string): boolean {
    const session = this.sessions.get(threadId);
    return session ? session.activeStreamCount > 0 : false;
  }

  /**
   * 设置线程的 loading 状态。
   * 仅当该线程是当前线程时更新全局 isLoading。
   */
  setLoading(threadId: string, loading: boolean): void {
    const session = this.getOrCreateSession(threadId);
    session.isLoading = loading;

    if (useChatStore.getState().currentThreadId === threadId) {
      useChatStore.setState({ isLoading: loading } as any);
    }
  }

  /**
   * 标记线程有未读更新（后台 streaming 完成时调用）。
   */
  setHasUnreadUpdate(threadId: string, val: boolean): void {
    const session = this.getOrCreateSession(threadId);
    session.hasUnreadUpdate = val;
  }

  /**
   * 清除线程的未读更新标记（用户切回该线程时调用）。
   */
  clearUnreadUpdate(threadId: string): void {
    const session = this.getOrCreateSession(threadId);
    session.hasUnreadUpdate = false;
  }
}
