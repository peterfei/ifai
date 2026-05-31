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

export interface StreamSummary {
  inputTokens: number;
  outputTokens: number;
}

export interface PerThreadSession {
  isLoading: boolean;
  activeStreamCount: number;
  streamingIds: Set<string>;
  hasUnreadUpdate: boolean;
  scrollPosition: number;
  inputContent: string;
  lastEventSeq: number;
  /** 流结束后保留的摘要数据，供 StreamingPulseBanner 跨线程显示 */
  streamSummary: StreamSummary | null;
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
    streamSummary: null,
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

  // ─── streamSummary ─────────────────────────────────────

  /**
   * 设置线程的流摘要数据（流完成时调用）。
   * 供 StreamingPulseBanner 跨线程恢复显示。
   */
  setStreamSummary(threadId: string, summary: StreamSummary): void {
    const session = this.getOrCreateSession(threadId);
    session.streamSummary = summary;
  }

  /**
   * 清除线程的流摘要数据（新流开始时调用）。
   */
  clearStreamSummary(threadId: string): void {
    const session = this.sessions.get(threadId);
    if (session) {
      session.streamSummary = null;
    }
  }

  /**
   * 获取线程的流摘要数据。
   */
  getStreamSummary(threadId: string): StreamSummary | null {
    return this.sessions.get(threadId)?.streamSummary ?? null;
  }

  // ─── streamingIds ─────────────────────────────────────

  /**
   * 添加 streaming ID 到线程的活跃流集合中。
   */
  addStreamingId(threadId: string, correlationId: string): void {
    const session = this.getOrCreateSession(threadId);
    session.streamingIds.add(correlationId);
  }

  /**
   * 从线程的活跃流集合中移除 streaming ID。
   */
  removeStreamingId(threadId: string, correlationId: string): void {
    const session = this.sessions.get(threadId);
    if (session) {
      session.streamingIds.delete(correlationId);
    }
  }

  /**
   * 检查线程是否正在 streaming 指定的 correlationId。
   */
  hasStreamingId(threadId: string, correlationId: string): boolean {
    const session = this.sessions.get(threadId);
    return session ? session.streamingIds.has(correlationId) : false;
  }

  /**
   * 获取线程的所有活跃 streaming ID 列表。
   */
  getStreamingIds(threadId: string): string[] {
    const session = this.sessions.get(threadId);
    return session ? Array.from(session.streamingIds) : [];
  }

  // ─── scrollPosition ─────────────────────────────────────

  /**
   * 设置线程的滚动位置。
   */
  setScrollPosition(threadId: string, pos: number): void {
    const session = this.getOrCreateSession(threadId);
    session.scrollPosition = pos;
  }

  /**
   * 获取线程的滚动位置，默认 0。
   */
  getScrollPosition(threadId: string): number {
    return this.sessions.get(threadId)?.scrollPosition ?? 0;
  }

  // ─── inputContent ──────────────────────────────────────

  /**
   * 设置线程的输入框内容。
   */
  setInputContent(threadId: string, content: string): void {
    const session = this.getOrCreateSession(threadId);
    session.inputContent = content;
  }

  /**
   * 获取线程的输入框内容，默认 ''。
   */
  getInputContent(threadId: string): string {
    return this.sessions.get(threadId)?.inputContent ?? '';
  }
}
