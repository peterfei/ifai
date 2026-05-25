/**
 * useChatStore - 新架构重构版 (Final Integrity - 核级对齐)
 *
 * 100% 逻辑解耦，完全基于 ChatEventBus 和 PersistenceManager。
 *
 * @version v1.1.0 - 新增 segment ordering 支持
 */

import { create } from 'zustand';
import { persist as zustandPersist } from 'zustand/middleware';
import { chatEventBus, StreamPhase } from './chat/eventBus/ChatEventBus';
import { ensureTauriInitialized } from '../utils/tauriInitializer';
import { persist, PersistenceStrategies } from './persistence/PersistenceDecorator';
import { selectAPIMessageContent } from '../types/multimodal';
import { ToolCallConverter } from '../utils/ToolCallConverter';

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
  approvalMeta?: Record<string, any>;   // LLM 操作审批元数据

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
  zustandPersist(
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

            // 🔥 P4: 如果工作流处理了消息（skipped），跳过 AI 生成
            if (result.skipped) {
              console.log('[ChatStore] ⚡ Workflow handled message, skipping AI generation');
              set({ isLoading: false });
              return result;
            }

            // 🔥 自动更新线程标题：如果当前线程的标题是默认标题，根据消息内容更新
            const { useThreadStore } = await import('./threadStore');
            const threadStore = useThreadStore.getState();
            // 🔥 FIX: 使用 activeThreadId 作为后备，确保即使 currentThreadId 不同步也能找到正确的线程
            const threadId = get().currentThreadId || threadStore.activeThreadId;
            const currentThread = threadId ? threadStore.getThread(threadId) : null;
            if (currentThread) {
              const isDefaultTitle = /^(上午|下午|晚上)(的新对话|的对话 \d+)$/.test(currentThread.title);
              if (isDefaultTitle) {
                threadStore.updateThreadTitleFromMessage(threadId, content as string);
              }
            }

            // 🏆 物理对齐：使用同一个 correlationId 启动生成
            // 🔥 FIX: 使用 result.context（由 SendMessageOrchestrator 正确构建，包含新 user 消息）
            // 而非 get().messages（可能被 persist 中间件的 merge 函数用旧数据覆盖）
            // 根因：zustand persist merge 执行 { ...currentState, ...persistedState }，
            // persistedState.messages 会覆盖 currentState.messages，导致新创建的 user 消息丢失
            let historyForGeneration = result.context && result.context.length > 0
              ? result.context
              : get().messages;

            // 🔥 FIX: 防御性检查 — 确保 historyForGeneration 中至少有一条 user 消息
            // 场景：persist hydration 丢失 user 消息 或 contextSelector 评分导致 user 消息被丢弃
            const hasUserInHistory = historyForGeneration.some((m: any) => m.role === 'user');
            if (!hasUserInHistory) {
              console.warn('[ChatStore] ⚠️ No user message in historyForGeneration! Recovering from content parameter');
              historyForGeneration = [
                ...historyForGeneration,
                { role: 'user', content: content as string }
              ];
            }

            await get().generateResponse(historyForGeneration, providerId || 'openai', modelName || 'gpt-4o', result.correlationId);
            return result;
        } catch (e) {
            console.error('[ChatStore] Send failed:', e);
            set({ isLoading: false });
            throw e;
        }
      },

      // 🔥 元编程持久化：使用声明式装饰器替代过程式代码
      // 性能提升：从 79.90ms → <5ms（200 条消息场景）
      addMessage: persist(PersistenceStrategies.debounce)((message: any) => {
        set((state) => ({ messages: [...state.messages, message] }));
      }),

      clearMessages: () => {
        set({ messages: [] });
        // 同步清空 TodoWrite 任务，避免新对话残留旧 Banner
        import('./todoWriteStore').then(({ useTodoWriteStore }) => {
          useTodoWriteStore.setState({ tasks: [] });
          useTodoWriteStore.getState().updateStats();
        }).catch(() => {});
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

        // 🏆 P2: 检测 TodoWrite 工具调用并同步到 todoWriteStore
        if (toolName === 'TodoWrite') {
          try {
            const argsObj = typeof toolArgs === 'string' ? JSON.parse(toolArgs) : toolArgs;
            if (argsObj.todos && Array.isArray(argsObj.todos)) {
              const { useTodoWriteStore } = await import('./todoWriteStore');
              useTodoWriteStore.getState().syncFromToolCall(argsObj.todos);
              console.log('[ChatStore] ✅ TodoWrite synced:', argsObj.todos);
            }
          } catch (error) {
            console.error('[ChatStore] ❌ Failed to sync TodoWrite:', error);
          }
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
          // 🔐 首先尝试 resolve 后端 pending approval（后端 tool_approval_required 机制）
          // 如果后端有 pending approval，由后端自行执行工具，前端不需要调用 approve_tool_call
          let backendResolved = false;
          try {
            backendResolved = await invoke('resolve_tool_approval', {
              toolCallId: toolCallId,
              approved: true,
              result: null  // 后端会自行执行并返回结果
            });
          } catch {
            // resolve_tool_approval 可能不存在（旧版本后端），忽略
          }

          if (backendResolved) {
            console.log('[ChatStore] 🔐 Backend approval resolved, tool will be executed by backend loop');
            // 后端会自行执行工具、发送 tool_done 事件、并继续 continuation loop
            // 前端不需要发出 tool:completed 事件
            return;
          }

          const result = await invoke('approve_tool_call', {
            messageId: messageId,
            toolCallId: toolCallId,
            toolName: toolName,
            toolArgs: toolArgs,
            projectRoot: projectRoot  // 🆕 传递项目根目录
          });

          // 发布工具完成事件
          // 🔥 FIX: shouldContinue=false — 后端 continuation loop 处理续播，前端不应触发
          chatEventBus.emit('chat:tool:completed', {
            correlationId: messageId,
            sessionId: get().currentThreadId,
            timestamp: Date.now(),
            toolId: toolCallId,
            result: result,
            shouldContinue: false
          });
        } catch (error) {
          console.error('[ChatStore] Tool approval failed:', error);
          const errorMsg = error instanceof Error ? error.message : String(error);
          const errorResult = JSON.stringify({ status: 'error', message: `Error executing tool: ${errorMsg}` });

          // 🏆 FIX: 审批失败时更新状态为 error
          set((state) => ({
            messages: state.messages.map(msg => {
              if (msg.id === messageId && msg.toolCalls) {
                return {
                  ...msg,
                  toolCalls: msg.toolCalls.map(tc =>
                    tc.id === toolCallId ? { ...tc, status: 'error' as const, result: errorResult } : tc
                  )
                };
              }
              return msg;
            })
          }));
          chatEventBus.emit('chat:tool:completed', {
            correlationId: messageId,
            sessionId: get().currentThreadId,
            timestamp: Date.now(),
            toolId: toolCallId,
            result: errorResult,
            shouldContinue: false
          });
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

        // 🔐 通知后端 approval 被拒绝（如果后端有 pending approval）
        try {
          await ensureTauriInitialized();
          const { invoke } = await import('@tauri-apps/api/core');
          await invoke('resolve_tool_approval', {
            toolCallId: toolCallId,
            approved: false,
            result: null
          });
          console.log('[ChatStore] 🔐 Backend approval rejected, backend loop will continue with error');
          // 后端收到拒绝后会继续 loop（将错误信息反馈给 AI），不需要前端续播
          return;
        } catch {
          // resolve_tool_approval 不存在，走原有逻辑
        }

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
          console.log('[useChatStore] 🎯 existingCorrelationId:', existingCorrelationId);
          console.log('[useChatStore] 🎯 providerId:', providerId);
          console.log('[useChatStore] 🎯 modelName:', modelName);
          console.log('[useChatStore] 🎯 history length:', history.length);

          // 🔥 FIX: 自动修复无效的 Kimi 模型名称
          let fixedModelName = modelName;
          if (providerId === 'kimi') {
            // 修复旧模型名称
            const modelFixes: Record<string, string> = {
              'moonshot-v1-k2.6': 'kimi-k2.6',
              'moonshot-v1-k2.5': 'kimi-k2.5',
            };
            if (modelFixes[modelName]) {
              console.warn(`[useChatStore] ⚠️ 检测到无效模型名称: ${modelName}，自动修复为: ${modelFixes[modelName]}`);
              fixedModelName = modelFixes[modelName];

              // 延迟更新设置存储（避免循环依赖）
              setTimeout(() => {
                const { useSettingsStore } = require('./settingsStore');
                useSettingsStore.getState().setCurrentProviderAndModel(providerId, fixedModelName);
              }, 0);
            }
          }

          const { streamingResponseController } = await import('./chat/generateResponse/StreamingResponseController');
          const { useSettingsStore } = await import('./settingsStore');
          const { useFileStore } = await import('./fileStore');

          // 🏆 物理对齐：复用已有 ID 或生成续播 ID
          const correlationId = existingCorrelationId || (window as any).crypto.randomUUID();
          const threadId = get().currentThreadId;

          console.log('[useChatStore] 🎯 Calling startListening with correlationId:', correlationId);

          try {
            await streamingResponseController.startListening(correlationId, {
                correlationId,
                sessionId: threadId,
                timestamp: Date.now()
            });
            console.log('[useChatStore] ✅ startListening completed, now calling invoke');
          } catch (e) {
            console.error('[useChatStore] ❌ startListening failed:', e);
            throw e; // 重新抛出异常，阻止 invoke 调用
          }

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
                    // 🔥 元编程：使用 ToolCallConverter 统一转换逻辑
                    const tool_calls = m.toolCalls
                        ? ToolCallConverter.toAPIFormat(m.toolCalls as any[])
                        : undefined;

                    // ✅ 元编程：使用类型安全的内容选择器
                    const content = selectAPIMessageContent(m);

                    // 🔧 后端兼容层：确保多模态内容被正确序列化
                    let apiContent: any = content;
                    if (Array.isArray(content)) {
                        // 确保多模态内容格式正确
                        apiContent = content.map(part => {
                            if (part.type === 'image_url') {
                                // 确保图片 URL 格式正确
                                return {
                                    type: 'image_url',
                                    image_url: {
                                        url: part.image_url.url
                                    }
                                };
                            }
                            return part;
                        });
                    }

                    return {
                        role: m.role,
                        content: apiContent,
                        tool_calls: tool_calls && tool_calls.length > 0 ? tool_calls : undefined,
                        tool_call_id: m.tool_call_id
                    };
                })
                .filter(m => {
                    if (m.role === lastRole && m.role !== 'tool') return false;
                    lastRole = m.role;
                    return true;
                });

              // 🔧 确保至少有一条 user 消息
              const hasUserMessage = sanitizedMessages.some(m => m.role === 'user');
              if (!hasUserMessage) {
                const lastUserMsg = [...history].reverse().find(m => m.role === 'user');
                if (lastUserMsg) {
                  sanitizedMessages.push({
                    role: 'user',
                    content: typeof lastUserMsg.content === 'string' ? lastUserMsg.content : JSON.stringify(lastUserMsg.content),
                  });
                }
              }

              await invoke('ai_chat', {
                  providerConfig: {
                      ...providerConfig,
                      api_key: (providerConfig as any).apiKey || "",
                      base_url: (providerConfig as any).baseUrl || "",
                      models: [fixedModelName]  // 🔥 FIX: 使用修复后的模型名称
                  },
                  messages: sanitizedMessages,
                  eventId: `chat_${correlationId}`,
                  projectRoot: useFileStore.getState().getActiveRoot()?.path || useFileStore.getState().rootPath,
                  enableTools: true,
                  mode: (window as any).__IFAI_EDITOR_MODE__ || "vibe"
              });
         } catch (e) {
              // 🔥 FIX: 避免重复处理 API 错误
              const errorMsg = e instanceof Error ? e.message : String(e);
              const isApiError = errorMsg.includes('API stream error:') ||
                                errorMsg.includes('API request timeout') ||
                                (errorMsg.includes('"code":') && errorMsg.includes('"message":'));

              if (!isApiError) {
                chatEventBus.emit('chat:error', {
                  correlationId: correlationId,
                  error: {
                    code: 'INVOKE_ERROR',
                    message: errorMsg
                  }
                });
              }
              set({ isLoading: false });
          } finally {
              clearTimeout(safetyTimer);
          }
      }
    }),
    {
      name: 'ifai-chat-store',
      // 只持久化核心字段，避免 isLoading 等瞬态状态污染
      partialize: (state) => ({
        messages: state.messages,
        currentThreadId: state.currentThreadId,
      }),
      // 🔥 FIX: persist merge 时保护内存中的 messages 不被旧数据覆盖
      // 根因：{ ...currentState, ...persistedState } 让 persistedState.messages 总是覆盖 currentState.messages
      // 场景：StoreMapper 通过 chat:message:sent 刚添加了新 user/assistant 消息（34条），
      // 但 persist 中间件触发 merge，用 localStorage 中旧数据（19条）覆盖，导致 user 消息丢失
      merge: (persistedState: any, currentState: any) => {
        const merged = { ...currentState, ...persistedState };
        const currentMsgs = currentState.messages;
        const persistedMsgs = persistedState.messages;

        // 内存中消息比 localStorage 多 → 保留内存版本（StoreMapper 刚更新过）
        if (
          Array.isArray(currentMsgs) &&
          Array.isArray(persistedMsgs) &&
          currentMsgs.length > persistedMsgs.length
        ) {
          merged.messages = currentMsgs;
          console.log(
            `[ChatStore] 🛡️ Persist merge: 保留 ${currentMsgs.length} 条内存消息，忽略 localStorage ${persistedMsgs.length} 条旧数据`
          );
        }
        // localStorage 为空但内存有消息 → 保留内存版本（首次加载或 IndexedDB restore）
        else if (
          Array.isArray(persistedMsgs) &&
          persistedMsgs.length === 0 &&
          Array.isArray(currentMsgs) &&
          currentMsgs.length > 0
        ) {
          merged.messages = currentMsgs;
          console.log(
            `[ChatStore] 🛡️ Persist merge: 保留 ${currentMsgs.length} 条内存消息，忽略 localStorage 空数据`
          );
        }
        return merged;
      },
      // 🔥 FIX: hydration 时同步 activeThreadId 和 currentThreadId
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.error('[ChatStore] ❌ Hydration error:', error);
          return;
        }
        if (state) {
          // 延迟执行，确保 threadStore 已经加载
          setTimeout(async () => {
            try {
              const { useThreadStore } = await import('./threadStore');
              const threadStore = useThreadStore.getState();
              const activeThreadId = threadStore.activeThreadId;

              // 如果 currentThreadId 是默认值或无效，使用 activeThreadId
              if (!state.currentThreadId || state.currentThreadId === 'default-thread') {
                if (activeThreadId) {
                  console.log('[ChatStore] 🔀 Hydration: 同步 currentThreadId 到 activeThreadId:', activeThreadId.substring(0, 20));
                  useChatStore.setState({ currentThreadId: activeThreadId });
                }
              }
            } catch (e) {
              console.warn('[ChatStore] ⚠️ Hydration sync failed:', e);
            }
          }, 100);
        }
      }
    }
  )
);

// -------------------------------------------------------------------
// 3. 辅助导出与挂载
// -------------------------------------------------------------------

export const switchThread = async (threadId: string) => {
    console.log(`[ChatStore] 🔄 切换到 thread: ${threadId.substring(0, 20)}`);

    const previousThreadId = useChatStore.getState().currentThreadId;
    const previousMessages = useChatStore.getState().messages;
    const isSameThread = previousThreadId === threadId;

    // 🐛 FIX: 切换前显式保存当前线程的消息，确保 StoreMapper 流式累加的内容不被丢失
    if (!isSameThread && previousThreadId && previousMessages.length > 0) {
        const { threadPersistence } = await import('./persistence/threadPersistence');
        await threadPersistence.saveThreadMessages(previousThreadId, previousMessages as any).catch(err => {
            console.error('[ChatStore] ⚠️ Failed to save messages before thread switch:', err);
        });
    }

    // 更新 currentThreadId
    useChatStore.setState({ currentThreadId: threadId, isLoading: false });

    // 🔥 FIX: 同步更新 CoreStoreProxy 版本的 store（React 组件订阅的是这个实例）
    // Vite 开发模式下 dynamic import 和 static import 可能解析为不同模块实例
    if (typeof window !== 'undefined' && (window as any).__chatStore && (window as any).__chatStore !== useChatStore) {
        (window as any).__chatStore.setState({ currentThreadId: threadId, isLoading: false });
        console.log('[ChatStore] 🔀 Synced currentThreadId to CoreStoreProxy instance');
    }

    const { threadPersistence } = await import('./persistence/threadPersistence');
    // 确保 threadPersistence 已初始化，否则 loadThreadMessages 会静默返回空数组
    if (!(threadPersistence as any).initialized) {
        console.log('[ChatStore] ⏳ threadPersistence not initialized, initializing...');
        await threadPersistence.init();
    }

    // 🏆 元编程：发射领域事件，CPS 声明式监听自行响应
    // 不再直接 import 调用 CPS，实现控制反转（IoC）
    chatEventBus.emit('chat:thread:switching', { threadId, previousThreadId });

    try {
        const messages = await threadPersistence.loadThreadMessages(threadId);

        console.log(`[ChatStore] 📥 加载了 ${messages.length} 条消息，准备排序`);

        if (messages.length === 0) {
            if (isSameThread) {
                // 同一线程，保留内存中的 messages
                console.log(`[ChatStore] ⏭️ 同线程无 IndexedDB 数据，保留 ${previousMessages.length} 条内存消息`);
                return;
            }
            // 不同线程且 IndexedDB 无数据 → 清空消息（新线程/空线程）
            console.log(`[ChatStore] 🧹 切换到新线程，清空 ${previousMessages.length} 条旧消息`);
            useChatStore.setState({ messages: [] });
            if (typeof window !== 'undefined' && (window as any).__chatStore && (window as any).__chatStore !== useChatStore) {
                (window as any).__chatStore.setState({ messages: [] });
            }
            return;
        }

        // 🔧 normalizeToolCalls: 声明式状态映射表
        // 元编程原则：非硬编码 if/else，通过配置数据驱动转换
        // 防止 hasActiveToolCalls（MessageItem.tsx:248-250）在历史消息加载时触发打字机效果
        const STALE_STATUS_MAP: Record<string, string> = {
            pending: 'completed',
            executing: 'completed',
            running: 'completed',
        };
        const normalizeToolCalls = (toolCalls: any[] | undefined): any[] | undefined => {
            if (!toolCalls || toolCalls.length === 0) return toolCalls;
            return toolCalls.map((tc: any) => ({
                ...tc,
                status: STALE_STATUS_MAP[tc.status] ?? tc.status,
                isPartial: tc.isPartial ? false : tc.isPartial,
            }));
        };

        // 🏆 FIX: 确保从持久化加载的消息有 segments 字段（向后兼容）
        // 🔥 v0.5.0: 强制重置 isStreaming 状态，避免历史消息触发打字机效果
        const normalizedMessages = (messages || []).map((msg: any, idx: number) => {
            // 🏆 元编程：通过声明式谓词检查消息是否有活跃流 session
            // 如果有，保留 isStreaming/status 而非强制重置为 completed
            const isActiveStream = isStreamActive(msg.id);

            // 如果已经有 segments 且不为空，直接使用
            if (msg.segments && msg.segments.length > 0) {
                return {
                    ...msg,
                    isStreaming: isActiveStream ? true : false,
                    status: isActiveStream ? 'streaming' : 'completed',
                    toolCalls: normalizeToolCalls(msg.toolCalls),
                    _loadOrder: idx,
                };
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
                isStreaming: isActiveStream ? true : false,
                status: isActiveStream ? 'streaming' : 'completed',
                toolCalls: normalizeToolCalls(msg.toolCalls),
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
        if (typeof window !== 'undefined' && (window as any).__chatStore && (window as any).__chatStore !== useChatStore) {
            (window as any).__chatStore.setState({ messages: sortedMessages });
        }

        // 🐛 FIX: 响应式检测——加载的消息中是否有仍在活跃流式输出的？
        // 如果有，恢复 isLoading，使 StoreMapper 能继续实时更新 UI
        restoreIsLoadingIfActive(sortedMessages);
    } catch (e) {
        console.error('[ChatStore] SwitchThread failed:', e);
        // 加载失败时保留当前 messages，不做任何修改
    }
};

/**
 * 🏆 声明式谓词：消息的流是否仍在活跃？
 * 元编程原则：将"如何判断活跃流"封装为单一数据源，
 * 消除多处 getSession + isFinished 手动判断
 */
export function isStreamActive(correlationId: string): boolean {
    const controller = typeof window !== 'undefined'
        ? (window as any).__StreamingResponseController
        : null;
    const session = controller?.getSession?.(correlationId);
    return !!session && !session.isFinished;
}

/**
 * 🐛 FIX: 检测刚加载的消息中是否有仍在流式输出的活跃 session。
 * 用户切回原对话时，如果 LLM 还在后台生成，需要恢复 isLoading 使 UI 继续实时更新。
 *
 * 元编程原则：声明式规则而非过程式 if/else。
 * 规则："loadedMessages 中有 msg.id 匹配 activeSession 且未完成 → isLoading = true"
 */
function restoreIsLoadingIfActive(messages: any[]): void {
    const hasActiveStream = messages.some((msg: any) => isStreamActive(msg.id));

    if (hasActiveStream) {
        console.log(`[ChatStore] 🔄 Detected active stream, restoring isLoading`);
        useChatStore.setState({ isLoading: true });
    }
}

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

  // 🔥 CRITICAL FIX: 监听消息变化并自动持久化到 IndexedDB
  // 这确保所有消息（包括普通聊天消息）都会被保存，而不仅仅是工作流消息
  let lastPersistedMessages = '{}';

  useChatStore.subscribe((state) => {
    const messages = state.messages;

    // 将消息序列化为字符串进行比较，避免频繁持久化
    // 🐛 FIX: 包含 contentLen 以捕获流式响应中的内容变化（StoreMapper 追加 delta 改变 content）
    const messagesJson = JSON.stringify(messages.map((m: any) => ({ id: m.id, role: m.role, timestamp: m.timestamp, contentLen: m.content?.length || 0 })));

    // 只有当消息真正变化时才持久化
    if (messagesJson !== lastPersistedMessages && messages.length > 0) {
      lastPersistedMessages = messagesJson;

      // 获取当前 threadId
      let threadId = state.currentThreadId;
      if (!threadId) {
        // 尝试从 threadStore 获取
        import('./threadStore').then(({ useThreadStore }) => {
          const threadState = useThreadStore.getState();
          threadId = threadState.activeThreadId || state.currentThreadId;

          if (threadId) {
            console.log('[useChatStore] 💾 Auto-persisting', messages.length, 'messages to thread:', threadId);

            // 持久化到 IndexedDB
            import('./persistence/threadPersistence').then(({ threadPersistence }) => {
              threadPersistence.saveThreadMessages(threadId, messages as any).then(() => {
                console.log('[useChatStore] ✅ Messages auto-saved to IndexedDB');
              }).catch(err => {
                console.error('[useChatStore] ❌ Failed to auto-save messages:', err);
              });
            });
          } else {
            console.warn('[useChatStore] ⚠️ No threadId available, skipping persistence');
          }
        });
      } else {
        console.log('[useChatStore] 💾 Auto-persisting', messages.length, 'messages to thread:', threadId);

        // 持久化到 IndexedDB
        import('./persistence/threadPersistence').then(({ threadPersistence }) => {
          threadPersistence.saveThreadMessages(threadId, messages as any).then(() => {
            console.log('[useChatStore] ✅ Messages auto-saved to IndexedDB');
          }).catch(err => {
            console.error('[useChatStore] ❌ Failed to auto-save messages:', err);
          });
        });
      }
    }
  });

  console.log('[useChatStore] ✅ Message persistence subscriber initialized');
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
