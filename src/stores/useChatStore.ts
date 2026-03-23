/**
 * useChatStore - 新架构重构版 (Final Integrity - 核级对齐)
 *
 * 100% 逻辑解耦，完全基于 ChatEventBus 和 PersistenceManager。
 *
 * @version v1.1.0 - 新增 segment ordering 支持
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { chatEventBus, StreamPhase } from './chat/eventBus/ChatEventBus';
import { ensureTauriInitialized } from '../utils/tauriInitializer';

// -------------------------------------------------------------------
// 1. 类型定义
// -------------------------------------------------------------------

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;                    // 保留（向后兼容）
  timestamp: number;
  status?: string;
  isStreaming?: boolean;              // 🏆 新增：标记是否正在流式传输
  toolCalls?: ToolCall[];
  tool_call_id?: string;

  // 🏆 新增：正式的 segments 字段（取代 contentSegments）
  segments?: ContentSegment[];         // 可选字段（兼容持久化和 core 类型）

  // 兼容性字段
  contentSegments?: ContentSegment[];   // 保留（过渡期兼容）
  references?: any[];
  multiModalContent?: ContentPart[];
}

export interface ContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string };
}

/**
 * 🏆 更新：ContentSegment 接口
 * 添加 phase 字段用于区分 pre-tool / in-tool / post-tool
 */
export interface ContentSegment {
  type: 'text' | 'tool';
  order: number;
  timestamp: number;

  // 🏆 新增：phase 字段（核心！）
  phase: StreamPhase;

  // Text segments
  content?: string;

  // Tool segments
  toolCallId?: string;
  toolName?: string;
  status?: string;

  // 兼容性字段（保留）
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
  rollbackToolCall: (messageId: string, toolCallId: string, force?: boolean) => Promise<{ conflict?: boolean; success?: boolean; error?: string } | void>;
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
        // 🏆 FIX: 触发自动保存，确保消息被保存到 IndexedDB
        import('./persistence/threadPersistence').then(({ autoSaveThread }) => {
          autoSaveThread(get().currentThreadId);
        });
      },

      clearMessages: () => {
        set({ messages: [] });
      },

      // 🔥 FIX: 添加工具审批方法的实现
      approveToolCall: async (messageId: string, toolCallId: string) => {
        // 🔥 FIX: 确保 Tauri bridge 已初始化
        await ensureTauriInitialized();

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
        if (!projectRoot) {
          console.error('[ChatStore] ❌ Project root is empty! FileStore state:', useFileStore.getState());
        }

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
      rollbackToolCall: async (messageId: string, toolCallId: string, force: boolean = false) => {
        // 🔥 FIX: 确保 Tauri bridge 已初始化
        await ensureTauriInitialized();

        const { invoke } = await import('@tauri-apps/api/core');

        try {
          // 调用后端回滚 API，传递 force 参数
          const result = await invoke<{
            conflict?: boolean;
            success?: boolean;
            error?: string;
          }>('rollback_tool_call', {
            messageId: messageId,
            toolCallId: toolCallId,
            force: force
          });

          // 如果有冲突，返回冲突信息
          if (result?.conflict) {
            return { conflict: true };
          }

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
          return { success: true };
        } catch (error) {
          console.error('[ChatStore] Tool rollback failed:', error);
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error)
          };
        }
      },

      generateResponse: async (history, providerId, modelName, existingCorrelationId?: string) => {
          console.log('[useChatStore] 🚀 generateResponse called');
          const { streamingResponseController } = await import('./chat/generateResponse/StreamingResponseController');
          const { useSettingsStore } = await import('./settingsStore');
          const { useFileStore } = await import('./fileStore');

          // 🏆 物理对齐：复用已有 ID 或生成续播 ID
          const correlationId = existingCorrelationId || (window as any).crypto.randomUUID();
          const threadId = get().currentThreadId;

          console.log('[useChatStore] 🎯 Calling startListening with correlationId:', correlationId);

          await streamingResponseController.startListening(correlationId, {
              correlationId,
              sessionId: threadId,
              timestamp: Date.now()
          });

          console.log('[useChatStore] ✅ startListening completed, now calling invoke');

          const settings = useSettingsStore.getState();
          const providerConfig = settings.providers.find((p: any) => p.id === providerId) || { id: providerId };

          const safetyTimer = setTimeout(() => {
              if (get().isLoading) {
                  console.warn('[ChatStore] 🛡️ Safety timeout. Unlocking UI.');
                  set({ isLoading: false });
              }
          }, 30000);

          try {
              // 🔥 FIX: 确保 Tauri bridge 已初始化
              await ensureTauriInitialized();

              // 🔥 DEBUG: 诊断 Tauri 环境状态
              console.log('[ChatStore] 🔍 Tauri Environment Check:', {
                hasTAURI_INTERNALS: !!(window as any).__TAURI_INTERNALS__,
                hasInvoke: !!(window as any).__TAURI_INTERNALS__?.invoke,
                hasCoreInvoke: !!(window as any).__TAURI__?.core?.invoke,
                isE2E: !!(window as any).__E2E__,
                e2eRealTauriMode: (window as any).__E2E_REAL_TAURI_MODE__
              });

              const { invoke } = await import('@tauri-apps/api/core');
              
              // 🏆 核级脱敏：1. 过滤空消息 2. 压缩重复角色 3. 角色交替校验
              // 🔥 FIX: 转换 tool_calls 到 OpenAI API 格式
              let lastRole = '';
              const sanitizedMessages = history
                .filter(m => {
                    const hasContent = typeof m.content === 'string' ? m.content.trim().length > 0 : !!m.content;
                    const hasTools = m.toolCalls && m.toolCalls.length > 0;
                    return hasContent || hasTools || m.role === 'tool';
                })
                .map(m => {
                    // 🔥 FIX: 转换 tool_calls 到 OpenAI API 格式
                    // 前端格式: { id, tool, args, status, function } -> API 格式: { id, type: 'function', function: { name, arguments } }
                    const tool_calls = m.toolCalls?.map((tc: any) => ({
                        id: tc.id,
                        type: 'function' as const,
                        function: {
                            name: tc.function?.name || tc.tool,
                            arguments: tc.function?.arguments || (typeof tc.args === 'string' ? tc.args : JSON.stringify(tc.args || {}))
                        }
                    }));

                    return {
                        role: m.role,
                        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
                        tool_calls: tool_calls && tool_calls.length > 0 ? tool_calls : undefined,
                        tool_call_id: m.tool_call_id
                    };
                })
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
    console.log(`[ChatStore] 🔄 切换到 thread: ${threadId.substring(0, 20)}`);

    // 🏆 关键修复：先清空全局消息，避免旧 Tab 的消息污染新 Tab
    useChatStore.setState({ currentThreadId: threadId, isLoading: false, messages: [] });

    const { threadPersistence } = await import('./persistence/threadPersistence');
    try {
        const messages = await threadPersistence.loadThreadMessages(threadId);

        console.log(`[ChatStore] 📥 加载了 ${messages.length} 条消息，准备排序`);

        // 🏆 FIX: 确保从持久化加载的消息有 segments 字段（向后兼容）
        const normalizedMessages = (messages || []).map((msg: any, idx: number) => {
            // 如果已经有 segments 且不为空，直接使用
            if (msg.segments && msg.segments.length > 0) {
                return { ...msg, _loadOrder: idx };  // 添加加载顺序索引
            }

            // 物理恢复：如果没 segments 但有内容，创建一个默认的 pre-tool 段落
            const segments = [];
            if (msg.content) {
                segments.push({
                    id: `seg-recovered-${msg.id}`,
                    type: 'text',
                    phase: 'pre-tool',
                    content: msg.content,
                    order: 1
                });
            }

            return {
                ...msg,
                segments,
                _loadOrder: idx  // 添加加载顺序索引用于稳定排序
            };
        });

        // 🏆 物理对齐：使用稳定的排序算法，确保相同 timestamp 时保持加载顺序
        const sortedMessages = normalizedMessages.sort((a: any, b: any) => {
            const timestampDiff = (a.timestamp || 0) - (b.timestamp || 0);
            if (timestampDiff !== 0) {
                return timestampDiff;
            }
            // 相同 timestamp 时，使用加载顺序保持稳定
            return (a._loadOrder || 0) - (b._loadOrder || 0);
        });

        const messagePreview = sortedMessages.map((m: any) => `${m.role}: ${(m.content || '').substring(0, 30)}`).join(', ');
        console.log(`[ChatStore] ✅ 设置 ${sortedMessages.length} 条排序后的消息: [${messagePreview}]`);

        useChatStore.setState({ messages: sortedMessages });
    } catch (e) {
        console.error('[ChatStore] SwitchThread failed:', e);
    }
};

export const getThreadMessages = (id: string) => useChatStore.getState().messages;
export const setThreadMessages = (id: string, msgs: any[]) => useChatStore.setState({ messages: msgs });

if (typeof window !== 'undefined') {
    (window as any).__chatStore = useChatStore;
    (window as any).__setThreadMessages = setThreadMessages;
    (window as any).__switchThread = switchThread;
    (window as any).__resetLoading = () => useChatStore.setState({ isLoading: false });
}

import { initStoreMapper } from './chat/StoreMapper';

// 🔥 CRITICAL: 设置全局标记，表明 useChatStore 模块被加载了
if (typeof window !== 'undefined') {
  (window as any).__USE_CHAT_STORE_LOADED__ = true;
  (window as any).__USE_CHAT_STORE_LOAD_TIME__ = Date.now();
  console.log('[useChatStore] 🔧 Module loaded, setting __USE_CHAT_STORE_LOADED__ = true');
}

console.log('[useChatStore] 🔧 Module loaded, calling initStoreMapper...');
try {
  initStoreMapper();
  console.log('[useChatStore] ✅ initStoreMapper called successfully');
  if (typeof window !== 'undefined') {
    (window as any).__STORE_MAPPER_CALL_SUCCEEDED__ = true;
  }
} catch (error) {
  console.error('[useChatStore] ❌ initStoreMapper FAILED:', error);
  if (typeof window !== 'undefined') {
    (window as any).__STORE_MAPPER_CALL_FAILED__ = true;
    (window as any).__STORE_MAPPER_ERROR__ = String(error);
  }
}

// 🔥 FIX: 添加工具调用去重器的模拟实现
export const toolCallDeduplicator = {
  deduplicate: (toolCalls: any[]) => toolCalls,
  add: (toolCallId: string) => {},
  remove: (toolCallId: string) => {},
  clear: () => {}
};

export default useChatStore;
