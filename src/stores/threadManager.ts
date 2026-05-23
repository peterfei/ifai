/**
 * ThreadManager - Thread 生命周期管理器
 *
 * 所有 Thread 状态变化的统一入口：
 * - 用户操作：create, switch, archive, delete
 * - Agent 驱动：agent:started, agent:completed
 */

import { useThreadStore } from './threadStore';
import { useChatStore } from './useChatStore';
import { useAgentStore } from './agentStore';
import { chatEventBus } from './chat/eventBus/ChatEventBus';
import { threadPersistence } from './persistence/threadPersistence';

export const ThreadManager = {
  /**
   * 创建新对话
   *
   * TM-1: 验证点
   * - 返回 threadId
   * - thread.status = 'active'
   * - 清空 chatStore.messages
   * - 设置 currentThreadId
   * - 发射 thread:created 事件
   */
  create: (options: ThreadOptions = {}): string => {
    const threadId = generateThreadId();
    const defaultTitle = generateDefaultTitle();

    const thread: Thread = {
      id: threadId,
      title: defaultTitle,
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      lastActiveAt: Date.now(),
      messageCount: 0,
      agentTasks: [],
      hasUnreadActivity: false,
      tags: [],
      pinned: false,
      ...options,
    };

    // 更新 threadStore
    useThreadStore.setState((state) => ({
      threads: {
        ...state.threads,
        [threadId]: thread,
      },
      activeThreadId: threadId,
      titleCounters: {
        ...state.titleCounters,
        [getGreeting()]: (state.titleCounters[getGreeting()] || 0) + 1,
      },
    }));

    // 清空 chatStore（新对话）
    useChatStore.setState({
      messages: [],
      currentThreadId: threadId,
    });

    // 发射事件
    chatEventBus.emit('thread:created', {
      threadId,
      timestamp: Date.now(),
    } as any);

    return threadId;
  },

  /**
   * 切换对话
   *
   * TM-2: 验证点
   * - 保存当前消息
   * - 加载新消息
   * - 更新 activeThreadId
   * - 发射 thread:switched 事件
   */
  switch: async (threadId: string): Promise<void> => {
    const currentThreadId = useThreadStore.getState().activeThreadId;

    // 保存当前消息 + 切走时将状态设为 idle
    if (currentThreadId && currentThreadId !== threadId) {
      const messages = useChatStore.getState().messages;
      await threadPersistence.saveThreadMessages(currentThreadId, messages as any);

      // 用户离开当前对话 → 状态变为 idle（不再活跃使用）
      const currentThread = useThreadStore.getState().getThread(currentThreadId);
      if (currentThread && currentThread.status === 'active') {
        useThreadStore.getState().updateThread(currentThreadId, { status: 'idle' });
      }
    }

    // 加载新消息
    const messages = await threadPersistence.loadThreadMessages(threadId);
    useChatStore.setState({
      messages: messages as any,
      currentThreadId: threadId,
    });

    // 更新 threadStore
    useThreadStore.setState((state) => ({
      activeThreadId: threadId,
      threads: {
        ...state.threads,
        [threadId]: {
          ...state.threads[threadId],
          lastActiveAt: Date.now(),
          hasUnreadActivity: false,
        },
      },
    }));

    // 发射事件
    chatEventBus.emit('thread:switched', {
      threadId,
      previousId: currentThreadId,
      timestamp: Date.now(),
    } as any);
  },

  /**
   * 归档对话
   */
  archive: async (threadId: string): Promise<void> => {
    useThreadStore.getState().updateThread(threadId, { status: 'archived' });
    chatEventBus.emit('thread:archived', {
      threadId,
      timestamp: Date.now(),
    } as any);
  },

  /**
   * 删除对话
   */
  delete: async (threadId: string): Promise<void> => {
    useThreadStore.getState().updateThread(threadId, { status: 'deleted' });
    chatEventBus.emit('thread:deleted', {
      threadId,
      timestamp: Date.now(),
    } as any);
  },

  /**
   * 订阅 agentStore.runningAgents，自动更新 thread.status
   *
   * TM-3 ~ TM-5: Agent 驱动的状态同步
   */
  initAgentStatusSync: () => {
    let unsubscribe: (() => void) | null = null;

    unsubscribe = useAgentStore.subscribe((state) => {
      const runningAgents = state.runningAgents;
      const activeThreadId = useThreadStore.getState().activeThreadId;
      if (!activeThreadId) return;

      const thread = useThreadStore.getState().getThread(activeThreadId);
      if (!thread) return;

      // 按 threadId 过滤，确保 thread 隔离
      const currentThreadAgents = runningAgents.filter(
        (a) => a.threadId === activeThreadId
      );
      const hasRunningAgents = currentThreadAgents.length > 0;

      // 状态转换逻辑（方案 B）：
      // active → working（Agent 启动）
      // working → idle（Agent 完成）
      // active → idle（用户停止交互，由其他机制处理）
      let newStatus: ThreadStatus = thread.status;

      if (hasRunningAgents) {
        // 有 Agent 运行时，状态变为 working
        newStatus = 'working';
      } else if (thread.status === 'working') {
        // Agent 完成后，状态变为 idle
        newStatus = 'idle';
      }
      // 其他情况保持原状态（active 保持 active，idle 保持 idle）

      useThreadStore.getState().updateThread(activeThreadId, {
        status: newStatus,
        lastActiveAt: Date.now(),
      });
    });

    return unsubscribe;
  },

  /**
   * 订阅事件总线，自动更新 thread.status
   *
   * TM-9 ~ TM-12: Chat 流式状态同步
   * - chat:stream:start → active（LLM 正在回复）
   * - chat:stream:finished → idle（LLM 回复完成）
   * - 不覆盖 working 状态（Agent 优先）
   *
   * 为什么用事件总线而不是 useChatStore.subscribe？
   * Vite HMR 模式下 dynamic import 可能产生不同的 store 实例，
   * 导致 subscribe 无法捕获到 isLoading 变化。
   * 事件总线是单例，不受 HMR 影响。
   */
  initChatStatusSync: () => {
    const unsubs: (() => void)[] = [];

    // chat:stream:start → thread 状态变为 active
    const unsubStart = chatEventBus.on('chat:stream:start', (payload: any) => {
      const sessionId = payload.sessionId;
      if (!sessionId) return;

      const thread = useThreadStore.getState().getThread(sessionId);
      if (!thread) return;

      // LLM 开始回复 → active（不覆盖 working）
      if (thread.status !== 'working') {
        useThreadStore.getState().updateThread(sessionId, {
          status: 'active',
          lastActiveAt: Date.now(),
        });
      }
    });
    unsubs.push(unsubStart);

    // chat:stream:finished → thread 状态变为 idle
    const unsubFinished = chatEventBus.on('chat:stream:finished', (payload: any) => {
      const sessionId = payload.sessionId;
      if (!sessionId) return;

      const thread = useThreadStore.getState().getThread(sessionId);
      if (!thread) return;

      // LLM 回复完成 → idle（不覆盖 working，Agent 优先）
      if (thread.status === 'active') {
        useThreadStore.getState().updateThread(sessionId, {
          status: 'idle',
          lastActiveAt: Date.now(),
        });
      }
    });
    unsubs.push(unsubFinished);

    return () => unsubs.forEach(fn => fn());
  },
};

/**
 * 数据迁移：将历史会话的 active 状态迁移为 idle
 *
 * 方案 B 引入 idle 状态后，已存储的会话 status 字段仍是旧的 'active'
 * 需要将非当前活跃的会话状态改为 'idle'
 */
export function migrateLegacyStatus(): void {
  const { threads, activeThreadId } = useThreadStore.getState();
  let migrated = 0;

  for (const [id, thread] of Object.entries(threads)) {
    // 跳过当前活跃线程、已归档、已删除的线程
    if (id === activeThreadId) continue;
    if (thread.status !== 'active') continue;

    // 将非活跃线程的 active 状态迁移为 idle
    useThreadStore.getState().updateThread(id, { status: 'idle' });
    migrated++;
  }

  if (migrated > 0) {
    console.log(`[ThreadManager] 🔄 已迁移 ${migrated} 个历史会话状态: active → idle`);
  }
}

function generateThreadId(): string {
  return `thread_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  return hour < 12 ? '上午' : hour < 18 ? '下午' : '晚上';
}

function generateDefaultTitle(): string {
  const greeting = getGreeting();

  // 从 titleCounters 获取计数
  const counters = useThreadStore.getState().titleCounters;
  const count = counters[greeting] || 0;

  if (count === 0) {
    return `${greeting}的新对话`;
  }
  return `${greeting}的对话 ${count}`;
}

// ===== 类型导入 =====

import type { Thread, ThreadStatus, ThreadOptions } from './threadStore';
import type { Agent } from '../types/agent';
