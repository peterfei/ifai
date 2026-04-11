/**
 * StoreMapper - 架构映射器 (核级对齐版)
 *
 * 负责将 EventBus 信号映射回 Zustand Store 状态。
 *
 * @version v1.1.0 - 集成 ContentSegmentManager
 */

import { chatEventBus } from './eventBus/ChatEventBus';
import { useChatStore } from '../useChatStore';
import { useSettingsStore } from '../settingsStore';
import { shouldAutoApprove as checkAutoApprove } from '../../utils/approvalPolicy';
import { contentSegmentManager } from './generateResponse/ContentSegmentManager';
import { toast } from 'sonner';

export const initStoreMapper = () => {
    // 🔥 CRITICAL: 防止同一页面重复初始化（HMR）
    // 仅检查 window 级别，不检查 globalThis，避免跨 page 隔离问题
    if (typeof window !== 'undefined' && (window as any).__STORE_MAPPER_INITIALIZED__) {
        console.log('[StoreMapper] ⏭️ Already initialized, skipping duplicate init');
        return;
    }
    if (typeof window !== 'undefined') {
        (window as any).__STORE_MAPPER_INITIALIZED__ = true;
    }

    // 🔥 序号校验：追踪每个流的 delta 序号
    const streamIndexTracker = new Map<string, number>();

    // 🔥 CRITICAL FIX: 设置全局标记，表明 initStoreMapper 被调用了
    if (typeof window !== 'undefined') {
      (window as any).__STORE_MAPPER_CALLED__ = true;
      (window as any).__STORE_MAPPER_CALL_TIME__ = Date.now();
      if (!(window as any).__STORE_MAPPER_INIT_LOGS__) {
        (window as any).__STORE_MAPPER_INIT_LOGS__ = [];
      }
      (window as any).__STORE_MAPPER_INIT_LOGS__.push({
        time: Date.now(),
        event: 'initStoreMapper called'
      });

      // 🏆 修复气泡次序：添加单调递增计数器确保消息顺序
      if (!(window as any).__MESSAGE_SEQUENCE_COUNTER__) {
        (window as any).__MESSAGE_SEQUENCE_COUNTER__ = 0;
      }
    }

    console.log('[StoreMapper] 🔗 Atomic Linkage Active - INITIALIZED');
    console.log('[StoreMapper] 🔗 Window.__STORE_MAPPER_CALLED__:', (window as any).__STORE_MAPPER_CALLED__);

    // 🔥 DEBUG: 验证监听器是否被注册
    setTimeout(() => {
      const handlers = (chatEventBus as any).handlers;
      const counts = {
        'chat:stream:chunk': handlers.get('chat:stream:chunk')?.length || 0,
        'chat:segment:updated': handlers.get('chat:segment:updated')?.length || 0,
        'chat:stream:start': handlers.get('chat:stream:start')?.length || 0,
        'chat:stream:finished': handlers.get('chat:stream:finished')?.length || 0,
        'chat:message:sent': handlers.get('chat:message:sent')?.length || 0
      };
      console.log('[StoreMapper] 🔍 DEBUG: Registered handlers:', counts);

      if (typeof window !== 'undefined') {
        (window as any).__STORE_MAPPER_INIT_LOGS__.push({
          time: Date.now(),
          event: 'handlers_registered',
          counts
        });
      }
    }, 1000);

    // 🏆 FIX: 防止重复续播的标记
    let continuationInProgress: { [key: string]: boolean } = {};

    // 🏆 FIX: 续播防抖定时器
    let continuationTimers: { [key: string]: NodeJS.Timeout } = {};

    // 🏆 FIX: 防止流式 chunk 重复追加的标记
    let processedChunks: { [key: string]: Set<string> } = {};

    // 🏆 FIX: 跟踪已完成的流，防止在流结束后触发续播
    let finishedStreams: Set<string> = new Set();

    // 🚀 OPTIMIZATION: 跟踪续播的内容，用于检测空续播
    let continuationContentTracker: { [key: string]: { hasContent: boolean; startTime: number } } = {};

    // ============================================
    // 🏆 新增：ContentSegmentManager 集成
    // ============================================

    // 监听流式开始 → 初始化 ContentSegmentManager
    chatEventBus.on('chat:stream:start', (payload: any) => {
        // 🔥 FIX: 优先使用 correlationId，并确认在 Store 中的物理存在
        const correlationId = payload.correlationId || payload.messageId;
        const messageId = payload.messageId; // UI 层面的 ID

        console.log('[StoreMapper] 🚀 Stream start:', { correlationId, messageId });

        // 🏆 设置 isStreaming 标记
        useChatStore.setState((state: any) => ({
            messages: state.messages.map((m: any) => 
                m.id === correlationId ? { ...m, isStreaming: true, status: 'streaming' } : m
            ),
            isLoading: true
        }) as any);

        // 🏆 物理纠偏：确保 Store 中的消息可以通过 correlationId 被找到
        // 如果它们不一致，我们需要一个映射关系或者直接在 Manager 中处理
        contentSegmentManager.onStreamStart(correlationId);
    });

    // 监听内容块 → 通知 ContentSegmentManager
    chatEventBus.on('chat:stream:chunk', (payload: any) => {
        const { delta, correlationId, deltaIndex } = payload;

        // 🔥 DEBUG: 只在异常情况或每 50 个 delta 打印一次
        const shouldLog = deltaIndex === undefined || deltaIndex < 0 || deltaIndex % 50 === 0;

        if (shouldLog) {
            console.log('[StoreMapper] 📨 chat:stream:chunk received:', {
                correlationId,
                deltaIndex,
                deltaLength: delta?.length || 0,
                deltaPreview: delta?.substring(0, 30) || ''
            });
        }

        // 🔥 DEBUG: 检查 delta 是否包含路径混乱的迹象
        if (delta && delta.includes('/') && delta.length > 50) {
            console.log('[StoreMapper] 🔍 Chunk with path detected:', delta);
        }

        // 🔥 序号校验：如果有序号，记录并检查顺序
        if (deltaIndex !== undefined && deltaIndex >= 0) {
            const lastIdx = streamIndexTracker.get(correlationId) ?? -1;
            streamIndexTracker.set(correlationId, deltaIndex);

            // 检测乱序 - 只在乱序时打印警告
            if (deltaIndex !== lastIdx + 1) {
                console.warn(`[StoreMapper] ⚠️ Out-of-order delta detected: expected ${lastIdx + 1}, got ${deltaIndex}`);
            }
        }
        
        // 🏆 FIX: 物理自愈 - 如果 chunk 到了但 Manager 还没初始化（可能由于 start 事件丢失），手动补全
        if (!contentSegmentManager.isStreamActive(correlationId)) {
            console.warn(`[StoreMapper] 🛡️ Stream ${correlationId} not active in Manager, triggering auto-start`);
            contentSegmentManager.onStreamStart(correlationId);
        }

        // 🏆 FIX: 即使使用了 SegmentManager，也必须实时同步顶层 content
        // 这是最基础的打字机效果保障，防止分段渲染逻辑失效导致空白
        useChatStore.setState((state: any) => {
            const messageIndex = state.messages.findIndex((m: any) => m.id === correlationId);
            if (messageIndex === -1) {
                // 🔥 DEBUG: 找不到消息时的调试信息
                console.warn(`[StoreMapper] ⚠️ Message not found for correlationId: ${correlationId}`);
                console.log(`[StoreMapper] Available message IDs:`, state.messages.map((m: any) => m.id));
                return state;
            }

            const newMessages = [...state.messages];
            const targetMsg = { ...newMessages[messageIndex], isStreaming: true };
            const oldContent = targetMsg.content || '';
            targetMsg.content = oldContent + delta;
            newMessages[messageIndex] = targetMsg;


            return { messages: newMessages, isLoading: true };
        });

        // 通知 ContentSegmentManager
        contentSegmentManager.onContentChunk(delta, correlationId);
    });

    // 5. 映射流式结束 → 完成、清理、同步
    chatEventBus.on('chat:stream:finished', (payload: any) => {
        const { correlationId, totalTokens } = payload;
        if (!correlationId) return;

        // 🔥 序号校验：清理序号追踪器
        streamIndexTracker.delete(correlationId);

        // A. 通知 ContentSegmentManager
        contentSegmentManager.onStreamFinish(correlationId);

        // B. 物理标记流完成 & 清除续播锁
        finishedStreams.add(correlationId);
        continuationInProgress[correlationId] = false;
        
        // 延迟清理 finishedStreams 标记，防止内存泄漏
        setTimeout(() => {
          finishedStreams.delete(correlationId);
        }, 10000);

        // C. 重置 UI 加载状态
        useChatStore.setState((state: any) => ({
            messages: state.messages.map((m: any) =>
                m.id === correlationId ? { ...m, isStreaming: false, status: 'completed' } : m
            ),
            isLoading: false
        }) as any);

        // 🔥 DEBUG: 验证状态是否正确更新
        setTimeout(() => {
            const newState = useChatStore.getState();
            if (newState.isLoading) {
                console.error('[StoreMapper] ❌ isLoading is still true after setState! Force resetting...');
                useChatStore.setState({ isLoading: false } as any);
            }
        }, 50);

        // D. 终极同步：确保 segments 中缺失的内容补齐到 content
        // 🔥 FIX: 仅在 segments 有 content 而 message.content 为空或明显更短时补齐
        // 不再无条件覆盖 message.content，避免 segments 重复时污染正文
        setTimeout(() => {
          const state = useChatStore.getState();
          const messageIndex = state.messages.findIndex((m: any) => m.id === correlationId);
          if (messageIndex === -1) return;

          const newMessages = [...state.messages];
          const targetMsg = { ...newMessages[messageIndex] };
          const currentContent = targetMsg.content || '';

          if (targetMsg.segments && targetMsg.segments.length > 0 && currentContent.length === 0) {
            // 仅当 content 完全为空时，从 segments 恢复
            const fullContent = targetMsg.segments
              .filter((s: any) => s.type === 'text' && s.content)
              .map((s: any) => s.content)
              .join('');

            if (fullContent.length > 0) {
              console.log('[StoreMapper] 🔧 Recovering content from segments:', {
                correlationId,
                contentLength: fullContent.length
              });
              targetMsg.content = fullContent;
              newMessages[messageIndex] = targetMsg;
              useChatStore.setState({ messages: newMessages } as any);
            }
          }
        }, 100);
    });

    // ============================================
    // 🏆 新增：监听 segment 事件 → 更新 Store
    // ============================================

    // 监听 segment 创建/更新
    chatEventBus.on('chat:segment:created', (payload: any) => {
        const { correlationId, segment } = payload;
        console.log('[StoreMapper] ✅ Segment created, updating store:', {
            correlationId,
            segmentType: segment.type,
            segmentOrder: segment.order
        });

        const updater = (state: any) => {
            const messageIndex = state.messages.findIndex((m: any) => m.id === correlationId);
            if (messageIndex === -1) return state;

            const newMessages = [...state.messages];
            const targetMsg = { ...newMessages[messageIndex] };

            // 更新 segments 数组
            if (!targetMsg.segments) {
                targetMsg.segments = [];
            }

            // 添加新 segment（确保不重复）
            const exists = targetMsg.segments.some((s: any) => s.order === segment.order);
            if (!exists) {
                targetMsg.segments = [...targetMsg.segments, segment];
            }

            newMessages[messageIndex] = targetMsg;

            return { messages: newMessages };
        };

        useChatStore.setState(updater as any);
    });

    chatEventBus.on('chat:segment:updated', (payload: any) => {
        const { correlationId, segmentId, delta } = payload;
        const updater = (state: any) => {
            const messageIndex = state.messages.findIndex((m: any) => m.id === correlationId);
            if (messageIndex === -1) return state;

            const newMessages = [...state.messages];
            const targetMsg = { ...newMessages[messageIndex] };

            // 🚀 OPTIMIZATION: 标记续播有内容了
            if (continuationContentTracker[correlationId]) {
                continuationContentTracker[correlationId].hasContent = true;
            }
            // 找到对应的 segment 并更新
            if (targetMsg.segments) {
                const segmentIndex = targetMsg.segments.findIndex((s: any) => {
                    const sid = `segment-${s.order}`;
                    return sid === segmentId;
                });

                if (segmentIndex !== -1) {
                    // 🏆 FIX: 物理替换数组和对象引用，确保 React 监听到深层变化
                    // 🔥 CRITICAL FIX: 不在这里追加 delta！ContentSegmentManager.onContentChunk
                    // 已经将 delta 追加到 segment.content 中。这里只需要触发 React re-render。
                    // 如果在这里也追加，会导致 segment content 双重追加（每个字符重复）。
                    const newSegments = [...targetMsg.segments];
                    const updatedSegment = { ...newSegments[segmentIndex] };
                    // 🔥 FIX: 从 ContentSegmentManager 同步最新 content（而非自己追加 delta）
                    const csmSegments = contentSegmentManager.getSegments(correlationId);
                    const csmSeg = csmSegments.find((s: any) => `segment-${s.order}` === segmentId);
                    if (csmSeg) {
                        updatedSegment.content = csmSeg.content;
                    }
                    newSegments[segmentIndex] = updatedSegment;
                    targetMsg.segments = newSegments;
                    
                    // 🏆 同步标记消息正在生成，确保 UI 能够实时响应
                    targetMsg.isStreaming = true;
                }
            }

            newMessages[messageIndex] = targetMsg;

            return { messages: newMessages };
        };

        useChatStore.setState(updater as any);
    });

    // ============================================
    // 现有逻辑：用户消息发送
    // ============================================

    // 1. 映射用户消息发送
    console.log('[StoreMapper] 🔍 Registering chat:message:sent listener, EventBus instance:', (chatEventBus as any).constructor.name);
    chatEventBus.on('chat:message:sent', (payload) => {
      const { messageId, content, correlationId, isAssistantOnly, isWorkflowMessage } = payload as any;
      const assistantId = correlationId;

      console.log('[StoreMapper] 📨 chat:message:sent received:', {
        messageId,
        correlationId,
        assistantId,
        content: content?.substring(0, 50),
        isAssistantOnly,
        isWorkflowMessage  // 🔥 检查是否是工作流消息
      });

      // 🔥 FIX: 如果是工作流消息，不设置 isLoading: true，防止触发 AI 回复
      if (isWorkflowMessage) {
        console.log('[StoreMapper] 🔥 This is a workflow message, NOT setting isLoading=true');
        console.log('[StoreMapper] 🔥 Creating user message:', { messageId, content: content?.substring(0, 30), assistantId });

        // 🔥 DEBUG: 检查当前 store 状态
        const currentStateBefore = useChatStore.getState();
        console.log('[StoreMapper] 🔍 State BEFORE update:', {
          messageCount: currentStateBefore.messages.length,
          messages: currentStateBefore.messages.map((m: any) => ({ id: m.id.substring(0, 15), role: m.role })),
          isLoading: currentStateBefore.isLoading
        });

        // 仍然创建消息，但不设置 isLoading
        const updater = (state: any) => {
          console.log('[StoreMapper] 🔍 updater function called, state.messages.length:', state?.messages?.length || 0);

          const filtered = state.messages.filter((m: any) => m.id !== messageId && m.id !== assistantId);
          const now = Date.now();
          const newMessages = [
            ...filtered,
            {
              id: messageId,
              role: 'user',
              content,
              timestamp: now,
              segments: [{ id: `seg-user-${messageId}`, type: 'text' as const, phase: 'pre-tool' as const, content, order: 1, timestamp: now }]
            },
            {
              id: assistantId,
              role: 'assistant',
              content: '',
              status: 'streaming',
              timestamp: now + 1,
              segments: []
            }
          ];
          console.log('[StoreMapper] 🔥 New messages to set:', newMessages.map((m: any) => ({ id: m.id.substring(0, 15), role: m.role, content: m.content?.substring(0, 20) })));

          const result = {
            messages: newMessages,
            isLoading: false  // 🔥 关键：不设置 isLoading，防止触发 AI 回复
          };
          console.log('[StoreMapper] 🔥 updater returning:', { messageCount: result.messages.length, isLoading: result.isLoading });
          return result;
        };

        console.log('[StoreMapper] 🔍 Calling setState with updater...');
        useChatStore.setState(updater as any);
        console.log('[StoreMapper] 🔍 setState called, waiting for state to update...');

        // 🔥 DEBUG: 验证状态是否真的被更新了
        setTimeout(() => {
          const currentState = useChatStore.getState();
          console.log('[StoreMapper] 🔍 State after update:', {
            messageCount: currentState.messages.length,
            lastMessage: currentState.messages[currentState.messages.length - 1],
            hasUserMessage: currentState.messages.some((m: any) => m.id === messageId),
            isLoading: currentState.isLoading
          });
        }, 50);

        return;  // 🔥 提前返回，不执行后续逻辑
      }

      // 🏆 FIX: 清理旧的 chunk 标记，防止内存泄漏
      if (processedChunks[correlationId]) {
        delete processedChunks[correlationId];
      }

      // 🏆 FIX: 清理旧的 finishedStreams 标记，防止跨消息污染
      if (finishedStreams.has(correlationId)) {
        finishedStreams.delete(correlationId);
        console.log('[StoreMapper] 🧹 Cleaned up old finished stream marker for new message:', correlationId);
      }

      const updater = (state: any) => {
        // 🏆 物理隔离：如果是 AI 续播占位，严禁添加 User 消息
        if (isAssistantOnly) {
            const filtered = state.messages.filter((m: any) => m.id !== assistantId);
            console.log('[StoreMapper] 🤖 Assistant-only mode, creating assistant message:', assistantId);
            return {
                messages: [
                    ...filtered,
                    { id: assistantId, role: 'assistant', content: '', status: 'streaming', timestamp: Date.now() }
                ],
                isLoading: true
            };
        }

        // 正常 User + Assistant 模式
        const filtered = state.messages.filter((m: any) => m.id !== messageId && m.id !== assistantId);
        console.log('[StoreMapper] 👤 User + Assistant mode, creating both messages');

        // 🏆 物理对齐：直接为 User 消息生成初始 Segment
        // 🏆 修复：使用单调递增计数器确保消息顺序，避免快速创建时时间戳相同
        const now = Date.now();
        const sequenceCounter = typeof window !== 'undefined' ? ++(window as any).__MESSAGE_SEQUENCE_COUNTER__ : 0;

        // 使用序列计数器作为时间戳的一部分，确保唯一性和顺序性
        const userTimestamp = now + sequenceCounter * 100;  // 每个消息增加 100ns（实际上很少会连续创建）
        const assistantTimestamp = userTimestamp + 1;  // 助手消息紧随用户消息

        const userSegments = [{
            id: `seg-user-${messageId}`,
            type: 'text' as const,
            phase: 'pre-tool' as const,
            content: content,
            order: 1,
            timestamp: userTimestamp
        }];

        const result = {
            messages: [
                ...filtered,
                {
                    id: messageId,
                    role: 'user',
                    content,
                    timestamp: userTimestamp,
                    segments: userSegments // 物理注入
                },
                {
                    id: assistantId,
                    role: 'assistant',
                    content: '',
                    status: 'streaming',
                    timestamp: assistantTimestamp, // 🏆 紧随用户消息
                    segments: [] // AI 初始为空
                }
            ],
            isLoading: true
        };

        console.log('[StoreMapper] ✅ Messages after creation:', result.messages.map(m => ({ id: m.id, role: m.role, timestamp: m.timestamp })));
        return result;
      };
      useChatStore.setState(updater as any);
    });

    // P4: 映射工作流响应
    chatEventBus.on('workflow:response', (payload) => {
      const { correlationId, response, workflowId, workflowType } = payload as any;

      console.log('[StoreMapper] 🔧 workflow:response received:', {
        correlationId,
        workflowId,
        workflowType,
        response: response?.substring(0, 50),
      });

      const updater = (state: any) => {
        // 🔥 FIX: 更新 chat:message:sent 创建的助手消息，而不是创建新的
        // 找到 ID 为 correlationId 的助手消息（由 chat:message:sent 创建）
        const assistantIndex = state.messages.findIndex((m: any) =>
          m.id === correlationId && m.role === 'assistant'
        );

        if (assistantIndex === -1) {
          // 如果找不到助手消息（不应该发生），创建一个新的
          console.warn('[StoreMapper] ⚠️ Assistant message not found, creating new one');
          const assistantMessage = {
            id: correlationId,
            role: 'assistant',
            content: response,
            status: 'completed',
            timestamp: Date.now(),
            segments: [{
              id: `seg-workflow-${workflowId}`,
              type: 'text' as const,
              phase: 'pre-tool' as const,
              content: response,
              order: 1,
              timestamp: Date.now(),
            }],
            metadata: {
              workflowId,
              workflowType,
              correlationId,
            }
          };

          return {
            messages: [...state.messages, assistantMessage],
            isLoading: false,
          };
        }

        // 更新现有的助手消息
        const newMessages = [...state.messages];
        const originalTimestamp = newMessages[assistantIndex].timestamp;

        newMessages[assistantIndex] = {
          ...newMessages[assistantIndex],
          content: response,
          status: 'completed',
          // 🔥 FIX: 保留原始时间戳，避免消息乱序
          timestamp: originalTimestamp || Date.now(),
          segments: [{
            id: `seg-workflow-${workflowId}`,
            type: 'text' as const,
            phase: 'pre-tool' as const,
            content: response,
            order: 1,
            timestamp: Date.now(),
          }],
          metadata: {
            workflowId,
            workflowType,
            correlationId,
          }
        };

        console.log('[StoreMapper] ✅ Updated assistant message with workflow response');

        return {
          messages: newMessages,
          isLoading: false,
        };
      };

      useChatStore.setState(updater as any);
    });

    // P3.5: 映射工作流实时进度（流式显示进度）
    chatEventBus.on('workflow:progress', (payload) => {
      const { workflowId, event_type, node_id, message } = payload as any;

      console.log('[StoreMapper] 📊 workflow:progress received:', {
        workflowId,
        event_type,
        node_id,
        message,
      });

      // 更新工作流消息，显示实时进度
      const updater = (state: any) => {
        // 🔥 FIX: 检查 state 是否为 null 或未定义，提供默认状态
        if (!state) {
          console.warn('[StoreMapper] ⚠️ State is null in workflow:progress handler, using default state');
          return { messages: [] }; // 提供默认状态
        }

        if (!state.messages) {
          console.warn('[StoreMapper] ⚠️ State.messages is missing in workflow:progress handler, using default messages');
          return { ...state, messages: [] }; // 提供默认 messages
        }

        // 查找包含此 workflowId 的助手消息
        const assistantIndex = state.messages.findIndex((m: any) =>
          m.role === 'assistant' &&
          m.metadata?.workflowId === workflowId
        );

        if (assistantIndex === -1) {
          console.warn('[StoreMapper] ⚠️ Workflow message not found for progress:', workflowId);
          return null; // 保持当前状态不变
        }

        // 🔥 构建进度显示
        const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false });
        let progressIndicator = '';

        if (event_type === 'node_started') {
          progressIndicator = `\n\n#### 🔄 执行中... ( ${timestamp} )\n\n`;
        }

        const progressContent = progressIndicator + (
          message ? `${message}\n` : ''
        );

        // 追加到现有内容（或者创建初始进度消息）
        const existingMessage = state.messages[assistantIndex];

        // 🔥 FIX: 如果消息已有自定义内容（总结），不要追加进度信息
        const hasCustomContent = existingMessage.content &&
          (existingMessage.content.includes('总结') ||
           existingMessage.content.includes('进行中') ||
           existingMessage.content.includes('代码探索完成') ||
           existingMessage.content.includes('项目结构') ||
           existingMessage.content.length > 300);

        const newContent = hasCustomContent
          ? existingMessage.content  // 保留自定义内容，不追加
          : existingMessage.content + progressContent;  // 否则追加进度

        const newMessages = [...state.messages];
        newMessages[assistantIndex] = {
          ...existingMessage,
          content: newContent,
          timestamp: Date.now(),
          metadata: {
            ...existingMessage.metadata,
            lastProgressUpdate: Date.now(),
          },
        };

        return { messages: newMessages };
      };

      useChatStore.setState(updater as any);
    });

    // P4: 映射工作流执行完成（显示实际执行结果）
    chatEventBus.on('workflow:completed', (payload) => {
      const { workflow_id, status, node_results, started_at, completed_at } = payload as any;

      console.log('[StoreMapper] ✅ workflow:completed received:', {
        workflow_id,
        status,
        nodes_count: Object.keys(node_results || {}).length,
        node_results_keys: Object.keys(node_results || {}),
      });

      // 🔥 详细打印每个节点的结果
      if (node_results) {
        for (const [nodeId, nodeResult] of Object.entries(node_results)) {
          const result = nodeResult as any;
          console.log(`[StoreMapper] 🔍 Node ${nodeId}:`, {
            status: result.status,
            has_output: !!result.output,
            output_length: result.output?.length || 0,
            output_preview: result.output?.substring(0, 100),
            has_error: !!result.error,
          });
        }
      }

      // 🔥 生成详细的执行结果响应
      let responseContent = `## ✅ 工作流执行完成\n\n`;
      responseContent += `**工作流 ID**: \`${workflow_id}\`\n`;
      responseContent += `**状态**: ${status}\n`;

      if (started_at && completed_at) {
        const duration = ((completed_at - started_at) / 1000).toFixed(2);
        responseContent += `**执行时长**: ${duration} 秒\n`;
      }

      responseContent += `\n### 📊 节点执行结果\n\n`;

      const results = node_results || {};
      const nodeIds = Object.keys(results);

      if (nodeIds.length === 0) {
        responseContent += `⚠️ 没有节点执行结果\n`;
      } else {
        for (const nodeId of nodeIds) {
          const nodeResult = results[nodeId];
          // 🔥 修复：后端序列化后是小写（completed, failed, skipped）
          const statusIcon = nodeResult.status === 'completed' ? '✅' :
                            nodeResult.status === 'failed' ? '❌' :
                            nodeResult.status === 'skipped' ? '⏭️' : '⏳';

          responseContent += `#### ${statusIcon} **${nodeId}**\n\n`;
          responseContent += `**状态**: ${nodeResult.status}\n`;

          if (nodeResult.output) {
            responseContent += `**输出**:\n\`\`\`\n${nodeResult.output}\n\`\`\`\n\n`;
          }

          if (nodeResult.error) {
            responseContent += `**错误**: ${nodeResult.error}\n\n`;
          }
        }
      }

      // 查找并更新对应的工作流消息
      // 我们需要通过 workflow_id 找到相关消息
      const updater = (state: any) => {
        // 🔥 FIX: 检查 state 是否为 null 或未定义，提供默认状态
        if (!state) {
          console.warn('[StoreMapper] ⚠️ State is null in workflow:completed handler, using default state');
          return { messages: [] }; // 提供默认状态
        }

        if (!state.messages) {
          console.warn('[StoreMapper] ⚠️ State.messages is missing in workflow:completed handler, using default messages');
          return { ...state, messages: [] }; // 提供默认 messages
        }

        // 查找包含此 workflowId 的助手消息
        const assistantIndex = state.messages.findIndex((m: any) =>
          m.role === 'assistant' &&
          m.metadata?.workflowId === workflow_id
        );

        if (assistantIndex === -1) {
          // 如果找不到消息，记录警告但不创建新消息（因为应该已经有 workflow:response 创建的消息）
          console.warn('[StoreMapper] ⚠️ Workflow message not found for completion:', workflow_id);
          return null;
        }

        // 更新现有消息
        const newMessages = [...state.messages];
        const existingMessage = newMessages[assistantIndex];

        // 🔥 FIX: 工作流完成后，将详细结果追加到消息内容中
        // 这样即使监控器被移除，用户也能在历史消息中看到完整的工作流结果
        const existingContent = existingMessage.content || '';

        // 检查是否已有工作流完成标记（避免重复追加）
        const hasCompletionMarker = existingContent.includes('## ✅ 工作流执行完成');

        // 追加工作流完成结果到现有内容
        const finalContent = hasCompletionMarker
          ? existingContent  // 已有完成标记，不重复追加
          : `${existingContent}\n\n${responseContent}`;  // 追加完成结果

        newMessages[assistantIndex] = {
          ...existingMessage,
          // 🔥 CRITICAL: 追加工作流完成结果到现有内容
          content: finalContent,
          status: 'completed',
          // 🔥 FIX: 保留原始时间戳，避免消息乱序
          timestamp: existingMessage.timestamp || Date.now(),
          segments: hasCompletionMarker ? existingMessage.segments : [
            ...(existingMessage.segments || []),
            {
              id: `seg-workflow-completed-${workflow_id}`,
              type: 'text' as const,
              phase: 'pre-tool' as const,
              content: responseContent,
              order: (existingMessage.segments?.length || 0) + 1,
              timestamp: Date.now(),
            }
          ],
          metadata: {
            ...existingMessage.metadata,
            completed: true,
            completedAt: completed_at,
          }
        };

        console.log('[StoreMapper] ✅ Updated message with workflow completion results', {
          hasCustomContent,
          contentPreview: existingMessage.content?.substring(0, 50)
        });

        return {
          messages: newMessages,
          isLoading: false,
        };
      };

      const updateResult = useChatStore.setState(updater as any);
      if (updateResult === null) {
        console.warn('[StoreMapper] ⚠️ No update applied for workflow completion');
      }
    });

    // P4: 映射工作流错误
    chatEventBus.on('workflow:error', (payload) => {
      const { correlationId, error } = payload as any;
      const assistantId = correlationId;

      console.log('[StoreMapper] ❌ workflow:error received:', {
        correlationId,
        error,
      });

      const errorMessage = `❌ 工作流执行失败\n\n${error}`;

      const updater = (state: any) => {
        const filtered = state.messages.filter((m: any) => m.id !== assistantId);
        const assistantMessage = {
          id: assistantId,
          role: 'assistant',
          content: errorMessage,
          status: 'completed',
          timestamp: Date.now(),
          segments: [{
            id: `seg-workflow-error-${assistantId}`,
            type: 'text' as const,
            phase: 'pre-tool' as const,
            content: errorMessage,
            order: 1,
            timestamp: Date.now(),
          }],
        };

        return {
          messages: [...filtered, assistantMessage],
          isLoading: false,
        };
      };

      useChatStore.setState(updater as any);
    });

    // 2. 映射流式 Chunk (🏆 已注销：内容更新现由 contentSegmentManager 统一管理)
    // chatEventBus.on('chat:stream:chunk', (payload) => { ... });

    // 3. 映射工具调用请求 (气泡渲染 + 覆盖保护)
    chatEventBus.on('chat:tool:call', (payload) => {
      const { correlationId, toolId, name, arguments: args } = payload;

      console.log('[StoreMapper] 🔧 Tool call event received:', { correlationId, toolId, name });

      // 🏆 NEW: 物理合并 - 通知 ContentSegmentManager
      contentSegmentManager.onToolCall({
          id: toolId,
          type: 'function',
          function: {
              name,
              arguments: args
          }
      }, correlationId);

      // 🏆 FIX: 在 updater 外部保存 existingToolIndex，用于后续自动审批逻辑
      let existingToolIndex = -1;

      const updater = (state: any) => {
        const messageIndex = state.messages.findIndex((m: any) => m.id === correlationId);
        if (messageIndex === -1) return state;

        const newMessages = [...state.messages];
        const targetMsg = { ...newMessages[messageIndex] };

        if (!targetMsg.toolCalls) targetMsg.toolCalls = [];
        existingToolIndex = targetMsg.toolCalls.findIndex((tc: any) => tc.id === toolId);

        // 🏆 FIX: 解析 JSON 参数为对象，兼容 UI 组件
        let parsedArgs: any = {};
        
        // 🏆 内部辅助：尝试从不完整的 JSON 字符串中提取关键字段
        const extractPartialJSON = (jsonStr: string) => {
          const result: any = { _raw: jsonStr };
          
          // 提取 rel_path
          const relPathMatch = jsonStr.match(/"rel_path"\s*:\s*"([^"]*)"?/);
          if (relPathMatch) result.rel_path = relPathMatch[1];
          
          // 提取 content (处理转义字符和多行)
          // 这是一个近似提取，直到找到下一个可能的键或字符串结尾
          const contentMatch = jsonStr.match(/"content"\s*:\s*"([\s\S]*)$/);
          if (contentMatch) {
            let content = contentMatch[1];
            // 移除末尾可能的未闭合引号或结束括号
            content = content.replace(/"\s*\}?$/, '').replace(/"$/, '');
            // 处理基本的换行转义和引号转义
            result.content = content.replace(/\\n/g, '\n').replace(/\\"/g, '"');
          }
          
          return result;
        };

        try {
          // 尝试解析 JSON 字符串
          if (args && typeof args === 'string') {
            console.log('[StoreMapper] 🔧 Parsing JSON args:', args.substring(0, 50));
            // 尝试直接解析（完整的 JSON）
            try {
              parsedArgs = JSON.parse(args);
              console.log('[StoreMapper] ✅ Parsed args successfully');
            } catch (e) {
              // 🏆 流式传输中，尝试部分提取
              parsedArgs = extractPartialJSON(args);
            }
          } else if (args && typeof args === 'object') {
            parsedArgs = args;
          }
        } catch (e) {
          console.warn('[StoreMapper] ⚠️ Unexpected error in args processing:', e);
          parsedArgs = { _raw: args || '' };
        }

        // 🏆 FIX: 创建兼容 UI 组件和私有库的双格式结构
        // UI 组件期望: { tool: 'name', args: {...} }  args 必须是对象
        // 私有库使用: { function: { name, arguments } }  arguments 是字符串
        if (existingToolIndex === -1) {
            // 🏆 NEW: 分配 batchId 以支持工具折叠显示
            const aggregatableTools = [
                'agent_scan_project', 
                'agent_list_dir', 
                'agent_read_file', 
                'agent_write_file', 
                'agent_create_file',
                'agent_delete_file', 
                'agent_rename_file',
                'agent_move_file',
                'agent_replace_content',
                'agent_replace_text',
                'agent_search', 
                'list_dir', 
                'read_file'
            ];
            const lowerToolName = name.toLowerCase();
            let batchId: string | undefined = undefined;

            if (aggregatableTools.some(t => lowerToolName.includes(t))) {
                const lastToolCall = targetMsg.toolCalls.length > 0 ? targetMsg.toolCalls[targetMsg.toolCalls.length - 1] : null;

                // 🏆 FIX: 简化batchId复用逻辑
                if (lastToolCall && (lastToolCall as any).batchId) {
                    batchId = (lastToolCall as any).batchId;
                } else {
                    const currentEditorMode = (window as any).__IFAI_EDITOR_MODE__ || 'standard';
                    if (currentEditorMode === 'vibe' || currentEditorMode === 'spec') {
                        batchId = `batch_${crypto.randomUUID().slice(0, 8)}`;
                    }
                }
            }

            targetMsg.toolCalls.push({
                id: toolId,
                type: 'function',
                // 🔥 UI 组件兼容字段（args 必须是对象）
                tool: name,
                args: parsedArgs,
                // 🔥 私有库兼容字段（arguments 保持字符串）
                function: { name, arguments: args || '' },
                // 🔥 FIX: 设置初始状态为 pending
                status: 'pending',
                // 🏆 NEW: 添加 batchId 支持工具折叠
                batchId
            });
            console.log('[StoreMapper] 🔧 Added new tool call:', name, 'batchId:', batchId);
        } else {
            if (name !== 'Unknown Tool') {
                targetMsg.toolCalls[existingToolIndex].tool = name;
                targetMsg.toolCalls[existingToolIndex].function.name = name;
            }
            // 🔥 合并参数对象而不是字符串拼接
            const existingArgs = targetMsg.toolCalls[existingToolIndex].args || {};
            if ((parsedArgs as any)._raw) {
              // 如果是新参数是原始字符串，更新 function.arguments
              targetMsg.toolCalls[existingToolIndex].function.arguments = args || ''; // args 已经是累积的
              
              // 尝试重新解析完整的 arguments
              try {
                const fullArgsStr = targetMsg.toolCalls[existingToolIndex].function.arguments;
                try {
                  targetMsg.toolCalls[existingToolIndex].args = JSON.parse(fullArgsStr);
                } catch (e) {
                  // 🏆 FIX: 使用部分提取逻辑，恢复流式渲染
                  targetMsg.toolCalls[existingToolIndex].args = extractPartialJSON(fullArgsStr);
                }
              } catch (e) {
                // 极端错误处理
                targetMsg.toolCalls[existingToolIndex].args = { _raw: targetMsg.toolCalls[existingToolIndex].function.arguments };
              }
            } else {
              // 如果是新参数是对象，合并到现有参数
              targetMsg.toolCalls[existingToolIndex].args = {
                ...existingArgs,
                ...parsedArgs
              };
            }
            console.log('[StoreMapper] 🔧 Updated existing tool call:', name);
        }

        newMessages[messageIndex] = targetMsg;
        console.log('[StoreMapper] 🔧 Target message after:', {
            id: targetMsg.id,
            toolCalls: targetMsg.toolCalls.map((tc: any) => ({
                id: tc.id,
                tool: tc.tool,
                argsType: typeof tc.args,
                functionName: tc.function?.name
            }))
        });

        return { messages: newMessages };
      };
      useChatStore.setState(updater as any);

      // 🏆 FIX: 自动审批逻辑（仅在工具首次创建时触发，避免重复批准）
      // 只有当是新创建的工具时才执行自动批准
      if (existingToolIndex === -1) {
        // 延迟执行以确保 UI 先渲染
        setTimeout(async () => {
        try {
          const settings = useSettingsStore.getState();
          const editorMode = (window as any).__IFAI_EDITOR_MODE__ || 'standard';

          // 检查是否应该自动审批
          const shouldAutoApprove = checkAutoApprove({
            settings,
            editorMode: editorMode as any,
            isSessionTrusted: false,  // TODO: 实现会话信任逻辑
            toolName: name,
            isSandbox: true,
            userMessageHasAutoApprove: false
          });

          console.log('[StoreMapper] 🤖 Auto-approve check:', {
            toolName: name,
            shouldAutoApprove,
            agentAutoApprove: settings.agentAutoApprove
          });

          if (shouldAutoApprove) {
            console.log('[StoreMapper] 🚀 Triggering auto-approve for tool:', name);

            // 🏆 FIX: 检查是否已被执行，防止 ToolCallManager 与 StoreMapper 的竞态
            if ((window as any).__EXECUTED_TOOLS__ && (window as any).__EXECUTED_TOOLS__.has(toolId)) {
              console.log('[StoreMapper] ⚠️ Tool already executed, skipping:', toolId);
              return;
            }

            // 🏆 FIX: 标记工具已执行，防止 ToolCallManager 重复执行
            if (!(window as any).__EXECUTED_TOOLS__) {
              (window as any).__EXECUTED_TOOLS__ = new Set();
            }
            (window as any).__EXECUTED_TOOLS__.add(toolId);

            const chatStore = useChatStore.getState();
            await chatStore.approveToolCall(correlationId, toolId);
          }
        } catch (error) {
          console.error('[StoreMapper] ❌ Auto-approve failed:', error);
        }
        }, 100);
      }
    });

    // 4. 映射工具执行结果
    chatEventBus.on('chat:tool:completed', (payload) => {
      const { toolId, result, error, correlationId, shouldContinue } = payload;

      const updater = (state: any) => {
        // 🏆 注意：保持原始结果格式（JSON 对象或字符串），由 UI 层的 toolResultFormatter 负责格式化
        const content = error || (typeof result === 'string' ? result : JSON.stringify(result));

        // 🏆 FIX: 更新工具调用状态为 completed
        const updatedMessages = state.messages.map((msg: any) => {
          if (msg.toolCalls && msg.toolCalls.length > 0) {
            const updatedToolCalls = msg.toolCalls.map((tc: any) => {
              if (tc.id === toolId) {
                return {
                  ...tc,
                  status: 'completed',
                  result: content,
                  isPartial: false  // 确保清除 isPartial 标志，避免阻塞 _finish 检测
                };
              }
              return tc;
            });
            return { ...msg, toolCalls: updatedToolCalls };
          }
          return msg;
        });

        // 检查是否已存在工具结果消息
        const hasToolResult = state.messages.some((m: any) => m.id === `res-${toolId}`);

        return {
          messages: hasToolResult ? updatedMessages : [
            ...updatedMessages,
            {
              id: `res-${toolId}`,
              role: 'tool',
              content: content,
              tool_call_id: toolId,
              timestamp: Date.now()
            }
          ],
          // 🔥 FIX: 不再强制 isLoading=true，因为后端 continuation loop 已禁用前端续播
          // _finish 事件会通过 emitFinished 正确设置 isLoading=false
        };
      };
      useChatStore.setState(updater as any);

      // 🔥 CRITICAL FIX: 禁用前端续播（后端已在内部 loop 中处理 continuation）
      // 后端的 harness_ai_service.rs 已有完整的 continuation loop 机制
      // 前端续播会导致双重流并发，造成 delta_index 冲突和内容混乱
      // 如果后端 continuation 失败，流会自然结束，用户可以手动重新发送
      if (false && shouldContinue) {
        // 🏆 防抖处理：清除之前的定时器，确保多个并行工具完成后只触发一次续播
        if (continuationTimers[correlationId]) {
          clearTimeout(continuationTimers[correlationId]);
        }

        continuationTimers[correlationId] = setTimeout(async () => {
          delete continuationTimers[correlationId];
          
          const currentState = useChatStore.getState();

          // 🏆 FIX: 检查是否已经有续播在进行中
          if (continuationInProgress[correlationId]) {
            return;
          }

          // 🔥 FIX: 如果需要续播，清除 finishedStreams 标记
          // 当 LLM 发送工具调用后空 content 导致流被标记为完成时，需要清除标记允许续播
          if (finishedStreams.has(correlationId)) {
            finishedStreams.delete(correlationId);
          }

          // 🏆 FIX: 检查流是否已经完成，如果完成则不触发续播
          // （这个检查现在应该不会触发，因为上面已经清除了标记）
          if (finishedStreams.has(correlationId)) {
            // 流已完成，确保 isLoading 为 false
            if (currentState.isLoading) {
              useChatStore.setState({ isLoading: false } as any);
            }
            return;
          }

          // 🏆 检查是否还有未完成的工具
          const hasPendingTools = currentState.messages.some((msg: any) =>
            msg.toolCalls && msg.toolCalls.some((tc: any) => tc.status === 'pending' || tc.status === 'executing')
          );

          if (hasPendingTools) {
            console.log('[StoreMapper] ⏳ Waiting for other tools to complete...');
            return;
          }

          // 🏆 标记续播开始
          continuationInProgress[correlationId] = true;
          console.log('[StoreMapper] 🔄 Setting continuationInProgress for:', correlationId);
          console.log('[StoreMapper] 🔄 Current timestamp:', Date.now());

          // 🚀 OPTIMIZATION: 初始化续播内容跟踪
          continuationContentTracker[correlationId] = {
            hasContent: false,
            startTime: Date.now()
          };

          const { useSettingsStore } = await import('../settingsStore');
          const settings = useSettingsStore.getState();
          const providerId = settings.currentProviderId || 'openai';
          const modelId = settings.currentModel || 'gpt-4o';

          console.log('[StoreMapper] 🔄 All tools completed, triggering AI continuation');
          console.log('[StoreMapper] 🔄 Message count for continuation:', currentState.messages.length);
          console.log('[StoreMapper] 🔄 CorrelationId for continuation:', correlationId);
          console.log('[StoreMapper] 🔄 generateResponse function exists:', typeof currentState.generateResponse);
          console.log('[StoreMapper] 🔄 About to call generateResponse...');

          const targetMsg = currentState.messages.find((m: any) => m.id === correlationId);
          console.log('[StoreMapper] 🔄 Found target message:', targetMsg ? { id: targetMsg.id, role: targetMsg.role } : 'NOT FOUND');

          // 🏆 FIX: 回滚 commit 41dac32 的过短超时，修复真实 LLM 续播失败问题
          // 1. 快速检测：5秒内如果没有新内容，结束续播（给慢速 LLM 充足时间）
          // 2. 安全超时：15秒后强制结束（从2秒恢复到15秒）
          const quickCheckTimer = setTimeout(() => {
            const tracker = continuationContentTracker[correlationId];
            if (tracker && !tracker.hasContent) {
              console.log('[StoreMapper] ⚡ Quick finish: No content received in 5s, ending continuation');
              useChatStore.setState({ isLoading: false } as any);
              continuationInProgress[correlationId] = false;
              delete continuationContentTracker[correlationId];
            }
          }, 5000); // ✅ 从 1000ms 改为 5000ms

          const safetyTimer = setTimeout(() => {
            if (useChatStore.getState().isLoading) {
              console.warn('[StoreMapper] ⏰ Tool continuation safety timeout (15s). Resetting isLoading.');
              useChatStore.setState({ isLoading: false } as any);
            }
            continuationInProgress[correlationId] = false;
            delete continuationContentTracker[correlationId];
          }, 15000); // ✅ 从 2000ms 改为 15000ms (回滚 commit 41dac32)

          try {
            const beforeMsgCount = currentState.messages.length;
            await currentState.generateResponse(
              currentState.messages,
              providerId,
              modelId,
              correlationId  // 复用原始 assistant 消息 ID
            );
            // 检查续播后消息是否更新
            const afterState = useChatStore.getState();
            const afterMsgCount = afterState.messages.length;
            console.log('[StoreMapper] 🔄 Continuation completed. Messages before:', beforeMsgCount, 'after:', afterMsgCount);
          } finally {
            clearTimeout(quickCheckTimer);
            clearTimeout(safetyTimer);
            // 🏆 FIX: 续播完成后立即重置标记，允许后续产生的工具调用立即触发新的续播
            continuationInProgress[correlationId] = false;
            delete continuationContentTracker[correlationId];
          }
        }, 1000); // 增加防抖延迟到 1s，确保状态彻底稳定
      }
    });

    // 6. 映射错误
    chatEventBus.on('chat:error', (payload: any) => {
      const { correlationId, error } = payload;
      console.error('[StoreMapper] ❌ Chat error received:', { correlationId, error });

      // 提取错误消息
      let errorMessage: string;
      if (typeof error === 'object' && error !== null && error.message) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      } else {
        errorMessage = JSON.stringify(error);
      }

      // 🔥 FIX: 尝试提取内层的 error.message（对于智谱等 API 返回的 JSON 字符串）
      // 支持格式：
      // 1. "API 请求失败: {\"error\":{\"code\":\"1210\",\"message\":\"API 调用参数有误，请检查文档。\"}}"
      // 2. "{\"error\":{\"code\":\"1210\",\"message\":\"API 调用参数有误，请检查文档。\"}}"
      const extractInnerErrorMessage = (msg: string): string => {
        // 尝试去除 "API 请求失败: " 前缀
        let cleanedMsg = msg;
        if (msg.startsWith('API 请求失败: ')) {
          cleanedMsg = msg.substring('API 请求失败: '.length);
        }

        // 尝试解析 JSON
        if (cleanedMsg.trim().startsWith('{')) {
          try {
            const parsed = JSON.parse(cleanedMsg);
            if (parsed.error && parsed.error.message) {
              return parsed.error.message;
            }
          } catch {
            // JSON 解析失败，返回原始消息
          }
        }

        return msg;
      };

      errorMessage = extractInnerErrorMessage(errorMessage);

      // 🔥 FIX: 显示 toast 错误提示（只显示内层 error.message）
      toast.error(errorMessage);

      const updater = (state: any) => {
        const messageIndex = state.messages.findIndex((m: any) => m.id === correlationId);
        if (messageIndex === -1) return { isLoading: false };

        const newMessages = [...state.messages];
        const targetMsg = { ...newMessages[messageIndex] };

        // 如果内容为空，添加错误提示（只显示内层 error.message）
        if (!targetMsg.content || targetMsg.content.length < 10) {
          targetMsg.content = (targetMsg.content || '') + `\n\n❌ **AI 响应错误**: ${errorMessage}`;
        }

        targetMsg.status = 'error';
        newMessages[messageIndex] = targetMsg;

        return { messages: newMessages, isLoading: false };
      };

      useChatStore.setState(updater as any);
    });

    // 7. 🏆 FIX: 监听工具审批事件，更新工具状态
    chatEventBus.on('chat:tool:approved', (payload) => {
      const { correlationId, toolId } = payload as any;

      console.log('[StoreMapper] ✅ Tool approved event received:', { correlationId, toolId });

      const updater = (state: any) => {
        const messageIndex = state.messages.findIndex((m: any) => m.id === correlationId);

        if (messageIndex === -1) {
            console.warn('[StoreMapper] ⚠️ Message not found for tool approval:', correlationId);
            return state;
        }

        const newMessages = [...state.messages];
        const targetMsg = { ...newMessages[messageIndex] };

        if (!targetMsg.toolCalls) {
            console.warn('[StoreMapper] ⚠️ No toolCalls found in message');
            return state;
        }

        // 更新工具状态为 executing
        const toolIndex = targetMsg.toolCalls.findIndex((tc: any) => tc.id === toolId);
        if (toolIndex !== -1) {
            targetMsg.toolCalls[toolIndex].status = 'executing';
            console.log('[StoreMapper] ✅ Updated tool status to executing:', toolId);
        }

        newMessages[messageIndex] = targetMsg;
        return { messages: newMessages };
      };
      useChatStore.setState(updater as any);
    });
};
