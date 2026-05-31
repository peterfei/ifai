/**
 * ThreadManager - Thread 生命周期管理器
 *
 * 所有 Thread 状态变化的统一入口：
 * - 用户操作：create, switch, archive, delete
 * - Agent 驱动：agent:started, agent:completed
 */

import { useThreadStore } from './threadStore';
import { useChatStore, isStreamActive } from './useChatStore';
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

      // 🏆 切换线程时检查所有活动源，避免误将仍有后台任务的线程设为 idle
      const currentThread = useThreadStore.getState().getThread(currentThreadId);
      if (currentThread && currentThread.status === 'active') {
        // ① 通过 StreamingResponseController 检测消息级别的活跃流
        const hasStreamActivity = messages.some((msg: any) => isStreamActive(msg.id));

        // ② 通过 PerThreadSessionStore 检测 per-thread 流计数
        // 即使 messages 已不在当前视图中，activeStreamCount 仍精确追踪后台流
        const pss = typeof window !== 'undefined'
          ? (window as any).__getPerThreadSessionStore?.()
          : null;
        const hasPerThreadStream = pss ? pss.isStreamActiveForThread(currentThreadId) : false;

        // ③ 通过 agentStore 检测该线程是否有正在运行的 Agent 任务
        const hasAgentActivity = useAgentStore.getState().runningAgents.some(
          (a) => a.threadId === currentThreadId
        );

        // ④ 检查该线程是否有未完成的 tool calls
        // 流已完成但工具调用还在 pending/running，状态应保持而不是 idle
        const oldThreadMsgs = useChatStore.getState()._messagesByThread?.[currentThreadId] || [];
        const hasPendingToolCalls = oldThreadMsgs.some((m: any) =>
          m.toolCalls?.some((tc: any) =>
            tc.status === 'pending' || tc.status === 'running'
          )
        );

        // ⑤ 检查该线程是否有运行中的 workflow
        // workflow 系统不经过 agentStore/chat:stream，需要独立跟踪
        const hasActiveWorkflow = hasActiveWorkflowForThread(currentThreadId);

        // 仅当所有活动源都确认无活跃任务时，才将状态设为 idle
        const hasAnyActivity = hasStreamActivity || hasPerThreadStream || hasAgentActivity || hasPendingToolCalls || hasActiveWorkflow;
        if (!hasAnyActivity) {
          useThreadStore.getState().updateThread(currentThreadId, { status: 'idle' });
        }
      }
    }

    // 加载新消息到 _messagesByThread（不触发 Rule 1 覆盖旧线程 bucket）
    const loadedMsgs = await threadPersistence.loadThreadMessages(threadId);
    if (loadedMsgs?.length) {
      const existingByThread = (useChatStore.getState() as any)._messagesByThread || {};
      useChatStore.setState({
        _messagesByThread: { ...existingByThread, [threadId]: loadedMsgs },
      } as any);
    }
    // 切换 currentThreadId（仅含此字段 → Rule 2 从 _messagesByThread 自动提供 messages）
    useChatStore.setState({ currentThreadId: threadId });

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
   * 更新对话标题
   *
   * @param threadId - 对话ID
   * @param newTitle - 新标题
   */
  updateTitle: (threadId: string, newTitle: string): void => {
    const thread = useThreadStore.getState().threads[threadId];
    if (!thread) {
      console.warn(`[ThreadManager] Thread not found: ${threadId}`);
      return;
    }

    useThreadStore.getState().updateThread(threadId, {
      title: newTitle,
      updatedAt: Date.now(),
    });

    // 发射事件
    chatEventBus.emit('thread:titleUpdated', {
      threadId,
      oldTitle: thread.title,
      newTitle,
      timestamp: Date.now(),
    } as any);
  },

  /**
   * 更新对话属性（通用方法）
   *
   * @param threadId - 对话ID
   * @param updates - 要更新的属性
   */
  update: (threadId: string, updates: Partial<Thread>): void => {
    const thread = useThreadStore.getState().threads[threadId];
    if (!thread) {
      console.warn(`[ThreadManager] Thread not found: ${threadId}`);
      return;
    }

    useThreadStore.getState().updateThread(threadId, {
      ...updates,
      updatedAt: Date.now(),
    });

    // 发射事件
    chatEventBus.emit('thread:updated', {
      threadId,
      updates,
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

    // ─── chat:stream 事件 ─────────────────────────────────────

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

    // chat:stream:finished → thread 状态变为 idle（除非有 pending tool calls）
    const unsubFinished = chatEventBus.on('chat:stream:finished', (payload: any) => {
      const sessionId = payload.sessionId;
      if (!sessionId) return;

      const thread = useThreadStore.getState().getThread(sessionId);
      if (!thread) return;

      // LLM 回复完成 → idle（不覆盖 working，Agent 优先）
      if (thread.status === 'active') {
        // 🏆 Phase 4: 检查该线程是否有未完成的 tool calls
        // 流完成但工具还未执行完（pending/running）→ 保持当前状态
        const threadMessages = useChatStore.getState()._messagesByThread?.[sessionId] || [];
        const hasPendingToolCalls = threadMessages.some((m: any) =>
          m.toolCalls?.some((tc: any) =>
            tc.status === 'pending' || tc.status === 'running'
          )
        );

        if (!hasPendingToolCalls) {
          useThreadStore.getState().updateThread(sessionId, {
            status: 'idle',
            lastActiveAt: Date.now(),
          });
        }
      }
    });
    unsubs.push(unsubFinished);

    // ─── workflow 事件 ────────────────────────────────────────
    // workflow 系统不经过 agentStore 或 chat:stream，需要独立跟踪

    /** workflowId → threadId 映射，用于 workflow:completed/error 查找到对应线程 */
    const workflowThreadMap = new Map<string, string>();

    // workflow:started → thread 状态变为 active
    const unsubWfStarted = chatEventBus.on('workflow:started', (payload: any) => {
      const sessionId = payload.sessionId;
      const workflowId = payload.workflowId;
      if (!sessionId || !workflowId) return;

      // 记录映射，供完成事件查找线程
      _workflowThreadMap.set(workflowId, sessionId);

      const thread = useThreadStore.getState().getThread(sessionId);
      if (!thread) return;

      // 工作流开始 → active（不覆盖 working）
      if (thread.status !== 'working') {
        useThreadStore.getState().updateThread(sessionId, {
          status: 'active',
          lastActiveAt: Date.now(),
        });
      }
    });
    unsubs.push(unsubWfStarted);

    // workflow:completed / workflow:error → thread 状态变为 idle
    const handleWorkflowEnd = (payload: any) => {
      const workflowId = payload.workflow_id || payload.workflowId;
      if (!workflowId) return;

      const sessionId = _workflowThreadMap.get(workflowId);
      _workflowThreadMap.delete(workflowId); // 清理映射
      if (!sessionId) return;

      const thread = useThreadStore.getState().getThread(sessionId);
      if (!thread) return;

      // 工作流结束 → idle（不覆盖 working）
      if (thread.status === 'active') {
        useThreadStore.getState().updateThread(sessionId, {
          status: 'idle',
          lastActiveAt: Date.now(),
        });
      }
    };

    const unsubWfCompleted = chatEventBus.on('workflow:completed', handleWorkflowEnd);
    unsubs.push(unsubWfCompleted);
    const unsubWfError = chatEventBus.on('workflow:error', handleWorkflowEnd);
    unsubs.push(unsubWfError);

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

// ===== 模块级 Workflow 状态跟踪 =====

/** workflowId → threadId 映射，供 workflow:completed/error 查找线程 */
const _workflowThreadMap = new Map<string, string>();

/** 检查某线程是否有运行中的 workflow（供 switch() 使用） */
export function hasActiveWorkflowForThread(threadId: string): boolean {
  for (const tid of _workflowThreadMap.values()) {
    if (tid === threadId) return true;
  }
  return false;
}
