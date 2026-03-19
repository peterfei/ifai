/**
 * useChatStore - 新架构重构版 (Final Integrity - 核级对齐)
 * 
 * 100% 逻辑解耦，完全基于 ChatEventBus 和 PersistenceManager。
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { chatEventBus } from './chat/eventBus/ChatEventBus';

// -------------------------------------------------------------------
// 1. 类型定义
// -------------------------------------------------------------------

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: number;
  status?: string;
  toolCalls?: ToolCall[];
  tool_call_id?: string;

  // 🔥 FIX: 添加 UI 组件依赖的属性
  contentSegments?: ContentSegment[];
  references?: any[];
  multiModalContent?: ContentPart[];
}

export interface ContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string };
}

export interface ContentSegment {
  type: 'text' | 'tool';
  order: number;
  timestamp: number;
  content?: string;
  toolCallId?: string;
  startPos?: number;
  endPos?: number;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
  status?: string;
  result?: any;
  isPartial?: boolean;
  batchId?: string;

  // 🔥 FIX: 添加 UI 组件使用的字段
  // 🏆 注意：args 可以是 string（私有库格式）或 object（UI 格式）
  tool?: string;
  args?: string | Record<string, any>;
}

export interface ChatStore {
  messages: Message[];
  input: string;
  isLoading: boolean;
  currentThreadId: string;

  setInput: (input: string) => void;
  setLoading: (loading: boolean) => void;
  sendMessage: (content: string | any[], providerId?: string, modelName?: string) => Promise<any>;
  addMessage: (message: Message) => void;
  clearMessages: () => void;
  generateResponse: (history: any[], providerId: string, modelName: string, existingCorrelationId?: string) => Promise<void>;

  // 🔥 FIX: 添加工具审批方法，支持 UI 组件调用
  approveToolCall: (messageId: string, toolCallId: string) => Promise<void>;
  rejectToolCall: (messageId: string, toolCallId: string) => Promise<void>;

  // 🔥 FIX: 添加回滚方法，支持工具调用回滚
  rollbackToolCall: (messageId: string, toolCallId: string) => Promise<void>;
}

// -------------------------------------------------------------------
// 2. Store 创建
// -------------------------------------------------------------------

export const useChatStore = create<ChatStore>()(
  persist(
    (set, get) => ({
      messages: [],
      input: '',
      isLoading: false,
      currentThreadId: 'default-thread',

      setInput: (val: string) => set({ input: val }),
      setLoading: (val: boolean) => set({ isLoading: val }),

      sendMessage: async (content, providerId, modelName) => {
        const { sendMessageOrchestrator } = await import('./chat/sendMessage/SendMessageOrchestrator');
        set({ isLoading: true, input: '' });

        try {
            const result = await sendMessageOrchestrator.send(
              content as string, 
              providerId || 'openai', 
              modelName || 'gpt-4o'
            );
            // 🏆 物理对齐：使用同一个 correlationId 启动生成
            await get().generateResponse(get().messages, providerId || 'openai', modelName || 'gpt-4o', result.correlationId);
            return result;
        } catch (e) {
            console.error('[ChatStore] Send failed:', e);
            set({ isLoading: false });
            throw e;
        }
      },

      addMessage: (message) => {
        set((state) => ({ messages: [...state.messages, message] }));
      },

      clearMessages: () => {
        set({ messages: [] });
      },

      // 🔥 FIX: 添加工具审批方法的实现
      approveToolCall: async (messageId: string, toolCallId: string) => {
        const { invoke } = await import('@tauri-apps/api/core');
        const { useFileStore } = await import('./fileStore');

        // 🏆 FIX: 从 Store 中获取工具信息
        const state = get();
        const message = state.messages.find(m => m.id === messageId);
        const toolCall = message?.toolCalls?.find(tc => tc.id === toolCallId);

        if (!toolCall) {
          throw new Error(`Tool call not found: ${toolCallId}`);
        }

        // 🏆 FIX: 提取工具名称和参数
        const toolName = toolCall.function?.name || toolCall.tool || '';
        // 🏆 FIX: 确保参数始终是字符串格式（Rust 期望字符串）
        let toolArgs = toolCall.function?.arguments;
        if (!toolArgs) {
            const argsObj = toolCall.args || {};
            toolArgs = typeof argsObj === 'string' ? argsObj : JSON.stringify(argsObj);
        }
        if (!toolArgs || toolArgs === '{}') {
            toolArgs = '{}';
        }

        // 🏆 获取项目根目录
        const projectRoot = useFileStore.getState().rootPath;

        console.log('[ChatStore] Approving tool:', { toolName, toolArgs, toolCallId, projectRoot });

        // 🏆 FIX: 更新工具状态为 executing
        set((state) => ({
          messages: state.messages.map(msg => {
            if (msg.id === messageId && msg.toolCalls) {
              return {
                ...msg,
                toolCalls: msg.toolCalls.map(tc =>
                  tc.id === toolCallId ? { ...tc, status: 'executing' as const } : tc
                )
              };
            }
            return msg;
          })
        }));

        // 通过事件总线通知 ToolCallManager
        chatEventBus.emit('chat:tool:approved', {
          correlationId: messageId,
          sessionId: get().currentThreadId,
          timestamp: Date.now(),
          toolId: toolCallId
        });

        // 调用后端审批工具（传递工具信息和项目根目录）
        try {
          const result = await invoke('approve_tool_call', {
            messageId: messageId,
            toolCallId: toolCallId,
            toolName: toolName,
            toolArgs: toolArgs,
            projectRoot: projectRoot  // 🆕 传递项目根目录
          });

          // 发布工具完成事件
          // 🏆 注意：续播由 ToolCallManager 统一处理，避免双重续播
          chatEventBus.emit('chat:tool:completed', {
            correlationId: messageId,
            sessionId: get().currentThreadId,
            timestamp: Date.now(),
            toolId: toolCallId,
            result: result,
            // 🏆 添加标记，表示这是自动审批流程，需要触发续播
            shouldContinue: true
          });
        } catch (error) {
          console.error('[ChatStore] Tool approval failed:', error);
          // 🏆 FIX: 审批失败时更新状态为 error
          set((state) => ({
            messages: state.messages.map(msg => {
              if (msg.id === messageId && msg.toolCalls) {
                return {
                  ...msg,
                  toolCalls: msg.toolCalls.map(tc =>
                    tc.id === toolCallId ? { ...tc, status: 'error' as const } : tc
                  )
                };
              }
              return msg;
            })
          }));
          chatEventBus.emit('chat:error', {
            correlationId: messageId,
            sessionId: get().currentThreadId,
            timestamp: Date.now(),
            code: 'TOOL_APPROVAL_FAILED',
            message: error instanceof Error ? error.message : String(error),
            moduleId: 'ToolApproval'
          } as any);
        }
      },

      rejectToolCall: async (messageId: string, toolCallId: string) => {
        // 🏆 FIX: 更新工具状态为 rejected
        set((state) => ({
          messages: state.messages.map(msg => {
            if (msg.id === messageId && msg.toolCalls) {
              return {
                ...msg,
                toolCalls: msg.toolCalls.map(tc =>
                  tc.id === toolCallId ? { ...tc, status: 'rejected' as const } : tc
                )
              };
            }
            return msg;
          })
        }));

        // 通过事件总线通知工具被拒绝
        chatEventBus.emit('chat:error', {
          correlationId: messageId,
          sessionId: get().currentThreadId,
          timestamp: Date.now(),
          code: 'TOOL_REJECTED',
          message: `Tool ${toolCallId} was rejected by user`,
          moduleId: 'ToolApproval'
        } as any);

        // 拒绝后也需要续播，让 AI 继续生成
        const { useSettingsStore } = await import('./settingsStore');
        const settings = useSettingsStore.getState();
        await get().generateResponse(
          get().messages,
          settings.currentProviderId || 'openai',
          settings.currentModel || 'gpt-4o'
        );
      },

      // 🔥 FIX: 添加回滚方法的实现
      rollbackToolCall: async (messageId: string, toolCallId: string) => {
        const { invoke } = await import('@tauri-apps/api/core');

        try {
          await invoke('rollback_tool_call', {
            messageId: messageId,
            toolCallId: toolCallId
          });

          // 从消息中移除该工具调用
          set((state) => ({
            messages: state.messages.map(msg => {
              if (msg.id === messageId && msg.toolCalls) {
                return {
                  ...msg,
                  toolCalls: msg.toolCalls.filter(tc => tc.id !== toolCallId)
                };
              }
              return msg;
            })
          }));

          console.log(`[ChatStore] Tool ${toolCallId} rolled back`);
        } catch (error) {
          console.error('[ChatStore] Tool rollback failed:', error);
        }
      },

      generateResponse: async (history, providerId, modelName, existingCorrelationId?: string) => {
          const { streamingResponseController } = await import('./chat/generateResponse/StreamingResponseController');
          const { useSettingsStore } = await import('./settingsStore');
          const { useFileStore } = await import('./fileStore');

          // 🏆 物理对齐：复用已有 ID 或生成续播 ID
          const correlationId = existingCorrelationId || (window as any).crypto.randomUUID();
          const threadId = get().currentThreadId;

          await streamingResponseController.startListening(correlationId, { 
              correlationId, 
              sessionId: threadId, 
              timestamp: Date.now() 
          });

          const settings = useSettingsStore.getState();
          const providerConfig = settings.providers.find((p: any) => p.id === providerId) || { id: providerId };

          const safetyTimer = setTimeout(() => {
              if (get().isLoading) {
                  console.warn('[ChatStore] 🛡️ Safety timeout. Unlocking UI.');
                  set({ isLoading: false });
              }
          }, 30000);

          try {
              const { invoke } = await import('@tauri-apps/api/core');
              
              // 🏆 核级脱敏：1. 过滤空消息 2. 压缩重复角色 3. 角色交替校验
              let lastRole = '';
              const sanitizedMessages = history
                .filter(m => {
                    const hasContent = typeof m.content === 'string' ? m.content.trim().length > 0 : !!m.content;
                    const hasTools = m.toolCalls && m.toolCalls.length > 0;
                    return hasContent || hasTools || m.role === 'tool';
                })
                .map(m => ({ 
                    role: m.role, 
                    content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
                    tool_calls: m.toolCalls,
                    tool_call_id: m.tool_call_id
                }))
                .filter(m => {
                    if (m.role === lastRole && m.role !== 'tool') return false;
                    lastRole = m.role;
                    return true;
                });

              await invoke('ai_chat', {
                  providerConfig: {
                      ...providerConfig,
                      api_key: providerConfig.apiKey || "",
                      base_url: providerConfig.baseUrl || "",
                      models: [modelName]
                  },
                  messages: sanitizedMessages,
                  // 🏆 FIX: 使用私有库的 eventId 格式 "chat_${correlationId}"
                  eventId: `chat_${correlationId}`,
                  projectRoot: useFileStore.getState().rootPath,
                  enableTools: true,
                  mode: (window as any).__IFAI_EDITOR_MODE__ || "vibe"
              });
          } catch (e) {
              console.error('[ChatStore] AI Chat Invoke failed:', e);
              set({ isLoading: false });
          } finally {
              clearTimeout(safetyTimer);
          }
      }
    }),
    {
      name: 'ifai-chat-storage-v4',
      partialize: (state) => {
          const { isLoading, ...rest } = state;
          return rest;
      }
    }
  )
);

// -------------------------------------------------------------------
// 3. 辅助导出与挂载
// -------------------------------------------------------------------

export const switchThread = async (threadId: string) => {
    useChatStore.setState({ currentThreadId: threadId, isLoading: false });
    const { threadPersistence } = await import('./persistence/threadPersistence');
    try {
        const messages = await threadPersistence.loadThreadMessages(threadId);
        useChatStore.setState({ messages: messages || [] });
    } catch (e) {
        console.error('[ChatStore] SwitchThread failed:', e);
    }
};

export const getThreadMessages = (id: string) => useChatStore.getState().messages;
export const setThreadMessages = (id: string, msgs: any[]) => useChatStore.setState({ messages: msgs });

if (typeof window !== 'undefined') {
    (window as any).__chatStore = useChatStore;
    (window as any).__setThreadMessages = setThreadMessages;
    (window as any).__resetLoading = () => useChatStore.setState({ isLoading: false });
}

import { initStoreMapper } from './chat/StoreMapper';
initStoreMapper();

// 🔥 FIX: 添加工具调用去重器的模拟实现
export const toolCallDeduplicator = {
  deduplicate: (toolCalls: any[]) => toolCalls,
  add: (toolCallId: string) => {},
  remove: (toolCallId: string) => {},
  clear: () => {}
};

export default useChatStore;
