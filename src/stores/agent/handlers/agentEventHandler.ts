/**
 * Agent 事件处理器
 * 处理来自后端的各种 Agent 事件
 * @module agentEventHandler
 */

import type { AgentEventPayload, Agent } from '@/types/agent';
import type { Message } from 'ifainew-core';

/**
 * 事件处理器上下文
 */
export interface EventHandlerContext {
  agentId: string;
  agentType: string;
  msgId: string | undefined;
  eventId: string;
  chatState: {
    messages: Message[];
  };
}

/**
 * 事件处理器状态更新回调
 */
export interface StateUpdateCallback {
  (update: (state: AgentState) => AgentState | void): void;
}

/**
 * Agent 状态（部分）
 */
interface AgentState {
  runningAgents: Agent[];
}

/**
 * 事件处理结果
 */
export interface EventHandleResult {
  shouldUpdateChat: boolean;
  chatMessages?: Message[];
}

/**
 * 处理 status 事件
 */
export function handleStatusEvent(
  payload: any,
  context: EventHandlerContext,
  setState: StateUpdateCallback
): void {
  const { agentId } = context;
  const { status, progress } = payload;

  setState((state) => ({
    runningAgents: state.runningAgents.map((a) =>
      a.id === agentId ? { ...a, status: status as any, progress } : a
    ),
  }));
}

/**
 * 处理 log 事件
 */
export function handleLogEvent(
  payload: any,
  context: EventHandlerContext,
  setState: StateUpdateCallback,
  sliceLogs: (logs: string[], limit: number) => string[],
  shouldUpdateStatus: (status: string) => boolean
): void {
  const { agentId } = context;
  const message = payload.message;

  setState((state) => ({
    runningAgents: state.runningAgents.map((a) => {
      if (a.id !== agentId) return a;
      const newLogs = sliceLogs([...a.logs, message], 100);
      const needsStatusFix = shouldUpdateStatus(a.status);
      return { ...a, logs: newLogs, status: needsStatusFix ? 'running' : a.status };
    }),
  }));
}

/**
 * 处理 thinking/content 事件
 */
export function handleThinkingEvent(
  payload: any,
  context: EventHandlerContext,
  setState: StateUpdateCallback
): void {
  const { agentId } = context;
  const chunk = payload.content || '';
  // Thinking 事件处理逻辑...
  // 这里需要处理流式内容更新
}

/**
 * 处理 tool_call 事件
 */
export function handleToolCallEvent(
  payload: any,
  context: EventHandlerContext,
  setState: StateUpdateCallback,
  chatState: { messages: Message[] }
): { updatedMessages: Message[]; messageUpdated: boolean; isNewToolCall: boolean } {
  const toolCall = payload.toolCall;
  const { agentId, msgId } = context;

  if (!toolCall || !msgId) {
    return { updatedMessages: chatState.messages, messageUpdated: false, isNewToolCall: false };
  }

  // 验证工具是否有效
  const isValidTool = toolCall?.tool && toolCall.tool !== 'unknown' && toolCall.tool.trim().length > 0;
  if (!isValidTool) {
    return { updatedMessages: chatState.messages, messageUpdated: false, isNewToolCall: false };
  }

  // 构建 liveToolCall 对象
  const liveToolCall = {
    id: toolCall.id,
    type: 'function' as const,
    tool: toolCall.tool,
    args: unescapeToolArguments(toolCall.args),
    function: {
      name: toolCall.tool,
      arguments: JSON.stringify(toolCall.args),
    },
    status: 'pending' as const,
    isPartial: toolCall.isPartial,
    agentId: agentId,
  };

  let messageUpdated = false;
  let isNewToolCall = false;

  const updatedMessages = chatState.messages.map((m) => {
    if (m.id === msgId) {
      const existing = m.toolCalls || [];

      // 基于签名去重
      const signature = `${liveToolCall.tool}:${JSON.stringify(liveToolCall.args)}`;
      const signatureIndex = existing.findIndex(
        (tc) => tc.tool === liveToolCall.tool && JSON.stringify(tc.args) === JSON.stringify(liveToolCall.args)
      );

      const index = signatureIndex !== -1 ? signatureIndex : existing.findIndex((tc) => tc.id === liveToolCall.id);

      // 处理重复
      if (index === -1 && signatureIndex !== -1) {
        return m; // 跳过重复的工具调用
      }

      if (index !== -1) {
        // 更新现有工具调用
        const prevContent = existing[index].args?.content || '';
        const nextContent = liveToolCall.args?.content || '';
        const prevIsPartial = existing[index].isPartial;

        // 去重检查
        if (
          prevContent === nextContent &&
          prevIsPartial === liveToolCall.isPartial &&
          liveToolCall.isPartial &&
          prevIsPartial
        ) {
          return m;
        }

        const newToolCalls = [...existing];
        const existingStatus = newToolCalls[index].status;
        const TERMINAL_STATES = ['completed', 'failed', 'rejected'];

        newToolCalls[index] = {
          ...newToolCalls[index],
          ...liveToolCall,
          status: TERMINAL_STATES.includes(existingStatus)
            ? existingStatus
            : existingStatus === 'approved' && liveToolCall.isPartial
              ? existingStatus
              : liveToolCall.status,
        };
        messageUpdated = true;
        return { ...m, toolCalls: newToolCalls };
      } else {
        // 添加新工具调用
        isNewToolCall = true;
        messageUpdated = true;
        return { ...m, toolCalls: [...existing, liveToolCall] };
      }
    }
    return m;
  });

  return { updatedMessages, messageUpdated, isNewToolCall };
}

/**
 * 处理 tool_result 事件
 */
export function handleToolResultEvent(
  payload: any,
  context: EventHandlerContext,
  chatMessages: Message[]
): Message[] {
  const { toolCallId, result } = payload;
  const { msgId } = context;

  if (!toolCallId || !msgId) {
    return chatMessages;
  }

  return chatMessages.map((m) => {
    if (m.id === msgId && m.toolCalls) {
      return {
        ...m,
        toolCalls: m.toolCalls.map((tc) => {
          if (tc.id === toolCallId) {
            return { ...tc, result: result };
          }
          return tc;
        }),
      };
    }
    return m;
  });
}

/**
 * 处理 result 事件
 */
export function handleResultEvent(
  payload: any,
  context: EventHandlerContext,
  setState: StateUpdateCallback,
  chatMessages: Message[]
): { updatedMessages: Message[]; shouldClearAgent: boolean } {
  const { agentId, agentType, msgId } = context;
  const result = payload.result || '';

  const updatedMessages = chatMessages.map((m) => {
    if (m.id === msgId) {
      return {
        ...m,
        content: result,
        agentId: undefined,
        isAgentLive: false,
        toolCalls: m.toolCalls?.map((tc) => {
          const isCompleted = tc.status === 'approved' || tc.status === 'pending';
          return {
            ...tc,
            status: isCompleted ? ('completed' as const) : tc.status,
            ...(isCompleted && !tc.result ? { result } : {}),
          };
        }),
      };
    }
    return m;
  });

  setState((state) => ({
    runningAgents: state.runningAgents.map((a) => {
      if (a.id === agentId) {
        const completionLog = `✅ 任务完成 (${Math.round((Date.now() - a.startTime) / 1000)}s)`;
        const shouldExpire = a.type !== 'task-breakdown';
        return {
          ...a,
          status: 'completed',
          progress: 1.0,
          expiresAt: shouldExpire ? Date.now() + 10000 : undefined,
          logs: [...a.logs, completionLog],
        };
      }
      return a;
    }),
  }));

  return { updatedMessages, shouldClearAgent: true };
}

/**
 * 处理 error 事件
 */
export function handleErrorEvent(
  payload: any,
  context: EventHandlerContext,
  setState: StateUpdateCallback,
  chatMessages: Message[]
): Message[] {
  const { agentId } = context;
  const error = payload.error;

  const updatedMessages = chatMessages.map((m) => {
    if (m.id === context.msgId) {
      return {
        ...m,
        content: `❌ Agent Error: ${error}`,
        agentId: undefined,
        isAgentLive: false,
      };
    }
    return m;
  });

  setState((state) => ({
    runningAgents: state.runningAgents.map((a) => {
      if (a.id === agentId) {
        const shouldExpire = a.type !== 'task-breakdown';
        return {
          ...a,
          status: 'failed',
          expiresAt: shouldExpire ? Date.now() + 10000 : undefined,
        };
      }
      return a;
    }),
  }));

  return updatedMessages;
}

/**
 * 处理 explore_progress 事件
 */
export function handleExploreProgressEvent(
  payload: any,
  context: EventHandlerContext,
  setState: StateUpdateCallback
): void {
  const { agentId } = context;
  const progress = payload.exploreProgress;

  if (!progress) return;

  setState((state) => ({
    runningAgents: state.runningAgents.map((a) => {
      if (a.id !== agentId) return a;

      let scannedFiles = a.exploreProgress?.scannedFiles || [];
      const isNewFile = progress.currentFile && !scannedFiles.includes(progress.currentFile);

      if (progress.currentFile && !scannedFiles.includes(progress.currentFile)) {
        scannedFiles = [progress.currentFile, ...scannedFiles].slice(0, 10);
      }

      const newExploreProgress: any = {
        ...(a.exploreProgress || {}),
        ...progress,
        currentFile: progress.currentFile || a.exploreProgress?.currentFile,
      };

      if (scannedFiles.length > 0) {
        newExploreProgress.scannedFiles = scannedFiles;
      }

      let newLogs = a.logs || [];
      if (isNewFile && progress.currentFile) {
        const parts = progress.currentFile.split('/').filter((p: string) => p);
        const fileName = parts.pop() || progress.currentFile;
        const dirPath = parts.join('/');

        if (parts.length > 0) {
          newLogs = [...newLogs, `📁 ${dirPath}`, `  ├─ ${fileName}`];
        } else {
          newLogs = [...newLogs, `📄 ${fileName}`];
        }
      }

      return {
        ...a,
        exploreProgress: newExploreProgress,
        currentStep: `${progress.phase}: ${progress.progress.scanned}/${progress.progress.total}`,
        progress: progress.progress.total > 0 ? progress.progress.scanned / progress.progress.total : a.progress,
        logs: newLogs,
      };
    }),
  }));
}

/**
 * 处理 explore_findings 事件
 */
export function handleExploreFindingsEvent(
  payload: any,
  context: EventHandlerContext,
  setState: StateUpdateCallback
): void {
  const { agentId } = context;
  const findings = payload.exploreFindings;

  if (!findings) return;

  setState((state) => ({
    runningAgents: state.runningAgents.map((a) => {
      if (a.id !== agentId) return a;

      const completedProgress = a.exploreProgress?.progress
        ? {
            ...a.exploreProgress.progress,
            scanned: a.exploreProgress.progress.total,
          }
        : undefined;

      return {
        ...a,
        exploreFindings: findings,
        exploreProgress: a.exploreProgress
          ? {
              ...a.exploreProgress,
              phase: 'completed',
              progress: completedProgress,
            }
          : undefined,
      };
    }),
  }));
}

/**
 * 工具参数反转义
 */
function unescapeToolArguments(args: any): any {
  if (args && typeof args.content === 'string') {
    args.content = args.content.replace(/\\n/g, '\n').replace(/\\"/g, '"');
  }
  return args;
}

/**
 * 主事件处理器分发函数
 */
export function createAgentEventHandler(setState: StateUpdateCallback) {
  return {
    status: (payload: any, context: EventHandlerContext) => handleStatusEvent(payload, context, setState),
    log: (payload: any, context: EventHandlerContext, sliceLogs: any, shouldUpdateStatus: any) =>
      handleLogEvent(payload, context, setState, sliceLogs, shouldUpdateStatus),
    thinking: (payload: any, context: EventHandlerContext) => handleThinkingEvent(payload, context, setState),
    tool_call: (payload: any, context: EventHandlerContext, chatState: { messages: Message[] }) =>
      handleToolCallEvent(payload, context, setState, chatState),
    tool_result: (payload: any, context: EventHandlerContext, chatMessages: Message[]) =>
      handleToolResultEvent(payload, context, chatMessages),
    result: (payload: any, context: EventHandlerContext, chatMessages: Message[]) =>
      handleResultEvent(payload, context, setState, chatMessages),
    error: (payload: any, context: EventHandlerContext, chatMessages: Message[]) =>
      handleErrorEvent(payload, context, setState, chatMessages),
    explore_progress: (payload: any, context: EventHandlerContext) =>
      handleExploreProgressEvent(payload, context, setState),
    explore_findings: (payload: any, context: EventHandlerContext) =>
      handleExploreFindingsEvent(payload, context, setState),
  };
}
