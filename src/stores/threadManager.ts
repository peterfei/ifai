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

    // 保存当前消息
    if (currentThreadId && currentThreadId !== threadId) {
      const messages = useChatStore.getState().messages;
      await threadPersistence.saveThreadMessages(currentThreadId, messages as any);
    }

    // 加载新消息
    const messages = await threadPersistence.loadThreadMessages(threadId);
    useChatStore.setState({
      messages,
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

      // 按 threadId 过滤，确保 thread 隔离
      const currentThreadAgents = runningAgents.filter(
        (a) => a.threadId === activeThreadId
      );
      const hasRunningAgents = currentThreadAgents.length > 0;
      const newStatus: ThreadStatus = hasRunningAgents ? 'working' : 'completed';

      useThreadStore.getState().updateThread(activeThreadId, {
        status: newStatus,
        lastActiveAt: Date.now(),
      });
    });

    return unsubscribe;
  },
};

// ===== 辅助函数 =====

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
