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

export const initStoreMapper = () => {
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
        const { delta, correlationId } = payload;
        
        // 🏆 FIX: 物理自愈 - 如果 chunk 到了但 Manager 还没初始化（可能由于 start 事件丢失），手动补全
        if (!contentSegmentManager.isStreamActive(correlationId)) {
            console.warn(`[StoreMapper] 🛡️ Stream ${correlationId} not active in Manager, triggering auto-start`);
            contentSegmentManager.onStreamStart(correlationId);
        }

        // 🏆 FIX: 即使使用了 SegmentManager，也必须实时同步顶层 content
        // 这是最基础的打字机效果保障，防止分段渲染逻辑失效导致空白
        useChatStore.setState((state: any) => {
            const messageIndex = state.messages.findIndex((m: any) => m.id === correlationId);
            if (messageIndex === -1) return state;

            const newMessages = [...state.messages];
            const targetMsg = { ...newMessages[messageIndex], isStreaming: true };
            targetMsg.content = (targetMsg.content || '') + delta;
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

        console.log('[StoreMapper] 🏁 Stream finished:', correlationId);

        // A. 通知 ContentSegmentManager
        contentSegmentManager.onStreamFinish(correlationId);

        // B. 物理标记流完成 & 清除续播锁
        finishedStreams.add(correlationId);
        continuationInProgress[correlationId] = false;
        
        // 延迟清理 finishedStreams 标记，防止内存泄漏
        setTimeout(() => {
          finishedStreams.delete(correlationId);
          console.log('[StoreMapper] 🧹 Cleaned up finished stream marker:', correlationId);
        }, 10000);

        // C. 重置 UI 加载状态
        useChatStore.setState((state: any) => ({
            messages: state.messages.map((m: any) => 
                m.id === correlationId ? { ...m, isStreaming: false, status: 'completed' } : m
            ),
            isLoading: false
        }) as any);

        // D. 终极同步：确保正文内容与分段完全一致 (延迟 100ms 确保所有 chunk 已落盘)
        setTimeout(() => {
          const state = useChatStore.getState();
          const messageIndex = state.messages.findIndex((m: any) => m.id === correlationId);
          if (messageIndex === -1) return;

          const newMessages = [...state.messages];
          const targetMsg = { ...newMessages[messageIndex] };

          if (targetMsg.segments && targetMsg.segments.length > 0) {
            const fullContent = targetMsg.segments
              .filter((s: any) => s.type === 'text' && s.content)
              .map((s: any) => s.content)
              .join('');

            // 只有当 segments 内容比当前 content 长时才更新，或者强制对齐
            if (fullContent.length > (targetMsg.content || '').length) {
              console.log('[StoreMapper] 🔧 Final sync of segments to content:', {
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
        console.log('[StoreMapper] 📝 Segment updated, updating store:', {
            correlationId,
            segmentId,
            delta: delta.substring(0, 30)
        });

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
                    const newSegments = [...targetMsg.segments];
                    const updatedSegment = { ...newSegments[segmentIndex] };
                    updatedSegment.content = (updatedSegment.content || '') + delta;
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
    chatEventBus.on('chat:message:sent', (payload) => {
      const { messageId, content, correlationId, isAssistantOnly } = payload as any;
      const assistantId = correlationId;

      console.log('[StoreMapper] 📨 chat:message:sent received:', {
        messageId,
        correlationId,
        assistantId,
        content: content?.substring(0, 50),
        isAssistantOnly
      });

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

      console.log('[StoreMapper] ✅ Tool completed event received:', { toolId, correlationId, hasResult: !!result, shouldContinue });
      console.log('[StoreMapper] 🔍 Result type:', typeof result, 'Result value:', result);
      console.log('[StoreMapper] 🔍 Result keys:', result ? Object.keys(result) : 'N/A');

      const updater = (state: any) => {
        // 🏆 注意：保持原始结果格式（JSON 对象或字符串），由 UI 层的 toolResultFormatter 负责格式化
        const content = error || (typeof result === 'string' ? result : JSON.stringify(result));
        console.log('[StoreMapper] 📝 Content created:', content);

        // 🏆 FIX: 更新工具调用状态为 completed
        const updatedMessages = state.messages.map((msg: any) => {
          if (msg.toolCalls && msg.toolCalls.length > 0) {
            const updatedToolCalls = msg.toolCalls.map((tc: any) => {
              if (tc.id === toolId) {
                console.log('[StoreMapper] 🔄 Updating tool status to completed:', toolId);
                return {
                  ...tc,
                  status: 'completed',
                  result: content
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
          isLoading: true  // 保持加载状态，准备续播
        };
      };
      useChatStore.setState(updater as any);

      // 🏆 FIX: 检查是否所有工具都已完成，如果是才触发续播
      if (shouldContinue) {
        // 🏆 防抖处理：清除之前的定时器，确保多个并行工具完成后只触发一次续播
        if (continuationTimers[correlationId]) {
          clearTimeout(continuationTimers[correlationId]);
        }

        continuationTimers[correlationId] = setTimeout(async () => {
          delete continuationTimers[correlationId];
          
          const currentState = useChatStore.getState();

          // 🏆 FIX: 检查是否已经有续播在进行中
          if (continuationInProgress[correlationId]) {
            console.log('[StoreMapper] ⏳ Continuation already in progress for:', correlationId);
            return;
          }

          // 🔥 FIX: 如果需要续播，清除 finishedStreams 标记
          // 当 LLM 发送工具调用后空 content 导致流被标记为完成时，需要清除标记允许续播
          if (finishedStreams.has(correlationId)) {
            console.log('[StoreMapper] 🔄 Clearing finishedStreams for continuation:', correlationId);
            finishedStreams.delete(correlationId);
          }

          // 🏆 FIX: 检查流是否已经完成，如果完成则不触发续播
          // （这个检查现在应该不会触发，因为上面已经清除了标记）
          if (finishedStreams.has(correlationId)) {
            console.log('[StoreMapper] ✅ Stream already finished for:', correlationId, '- skipping continuation');
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

      const updater = (state: any) => {
        const messageIndex = state.messages.findIndex((m: any) => m.id === correlationId);
        if (messageIndex === -1) return { isLoading: false };

        const newMessages = [...state.messages];
        const targetMsg = { ...newMessages[messageIndex] };
        
        // 如果内容为空，添加错误提示
        const errorText = typeof error === 'string' ? error : JSON.stringify(error);
        if (!targetMsg.content || targetMsg.content.length < 10) {
            targetMsg.content = (targetMsg.content || '') + `\n\n❌ **AI 响应错误**: ${errorText}`;
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
