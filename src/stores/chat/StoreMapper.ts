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
    console.log('[StoreMapper] 🔗 Atomic Linkage Active');

    // 🏆 FIX: 防止重复续播的标记
    let continuationInProgress: { [key: string]: boolean } = {};

    // 🏆 FIX: 防止流式 chunk 重复追加的标记
    let processedChunks: { [key: string]: Set<string> } = {};

    // ============================================
    // 🏆 新增：ContentSegmentManager 集成
    // ============================================

    // 监听流式开始 → 初始化 ContentSegmentManager
    chatEventBus.on('chat:stream:start', (payload: any) => {
        const { messageId } = payload;
        console.log('[StoreMapper] 🚀 Stream start, initializing ContentSegmentManager:', messageId);

        // 使用 assistant 的 ID 作为 correlationId
        contentSegmentManager.onStreamStart(messageId);
    });

    // 监听内容块 → 通知 ContentSegmentManager
    chatEventBus.on('chat:stream:chunk', (payload: any) => {
        const { delta, correlationId } = payload;
        console.log('[StoreMapper] 📝 Forwarding chunk to ContentSegmentManager:', {
            correlationId,
            delta: delta.substring(0, 30)
        });

        // 通知 ContentSegmentManager
        contentSegmentManager.onContentChunk(delta, correlationId);
    });

    // 监听工具调用 → 通知 ContentSegmentManager
    chatEventBus.on('chat:tool:call', (payload: any) => {
        const { correlationId, toolId, name, arguments: args } = payload;

        console.log('[StoreMapper] 🔧 Forwarding tool call to ContentSegmentManager:', {
            correlationId,
            toolId,
            name
        });

        // 通知 ContentSegmentManager
        contentSegmentManager.onToolCall({
            id: toolId,
            type: 'function',
            function: {
                name,
                arguments: args
            }
        }, correlationId);
    });

    // 监听流式结束 → 完成并清理
    chatEventBus.on('chat:stream:finished', (payload: any) => {
        const { correlationId } = payload;
        console.log('[StoreMapper] 🏁 Stream finished, notifying ContentSegmentManager:', correlationId);

        contentSegmentManager.onStreamFinish(correlationId);
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

            // 找到对应的 segment 并更新
            if (targetMsg.segments) {
                const segmentIndex = targetMsg.segments.findIndex((s: any) => {
                    const sid = `segment-${s.order}`;
                    return sid === segmentId;
                });

                if (segmentIndex !== -1) {
                    const updatedSegment = { ...targetMsg.segments[segmentIndex] };
                    updatedSegment.content = (updatedSegment.content || '') + delta;
                    targetMsg.segments[segmentIndex] = updatedSegment;
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
        const result = {
          messages: [
            ...filtered,
            { id: messageId, role: 'user', content, timestamp: Date.now() },
            { id: assistantId, role: 'assistant', content: '', status: 'streaming', timestamp: Date.now() + 1 }
          ],
          isLoading: true
        };
        console.log('[StoreMapper] ✅ Messages after creation:', result.messages.map(m => ({ id: m.id, role: m.role })));
        return result;
      };
      useChatStore.setState(updater as any);
    });

    // 2. 映射流式 Chunk
    chatEventBus.on('chat:stream:chunk', (payload) => {
      const { delta, correlationId, isFinal } = payload;

      // 🏆 FIX: 防止同一个 chunk 被重复处理
      const chunkKey = `${correlationId}_${delta}_${isFinal}`;
      if (!processedChunks[correlationId]) {
        processedChunks[correlationId] = new Set();
      }
      if (processedChunks[correlationId].has(chunkKey)) {
        console.warn('[StoreMapper] ⚠️ Duplicate chunk detected, skipping:', chunkKey.substring(0, 50));
        return;
      }
      processedChunks[correlationId].add(chunkKey);

      // 如果是最终 chunk，清理标记
      if (isFinal) {
        setTimeout(() => {
          delete processedChunks[correlationId];
        }, 100);
      }

      const updater = (state: any) => {
        const messageIndex = state.messages.findIndex((m: any) => m.id === correlationId);
        if (messageIndex === -1) return state;

        const newMessages = [...state.messages];
        const targetMsg = { ...newMessages[messageIndex] };
        targetMsg.content += delta;
        targetMsg.status = isFinal ? 'sent' : 'streaming';
        newMessages[messageIndex] = targetMsg;

        return {
            messages: newMessages,
            isLoading: !isFinal
        };
      };
      useChatStore.setState(updater as any);
    });

    // 3. 映射工具调用请求 (气泡渲染 + 覆盖保护)
    chatEventBus.on('chat:tool:call', (payload) => {
      const { correlationId, toolId, name, arguments: args } = payload;

      console.log('[StoreMapper] 🔧 Tool call event received:');
      console.log('[StoreMapper] 🔧   correlationId:', correlationId);
      console.log('[StoreMapper] 🔧   toolId:', toolId);
      console.log('[StoreMapper] 🔧   name:', name);
      console.log('[StoreMapper] 🔧   arguments:', args?.substring(0, 50));

      // 🏆 FIX: 在 updater 外部保存 existingToolIndex，用于后续自动审批逻辑
      let existingToolIndex = -1;

      const updater = (state: any) => {
        const messageIndex = state.messages.findIndex((m: any) => m.id === correlationId);
        console.log('[StoreMapper] 🔧 Message index for correlationId:', messageIndex);

        if (messageIndex === -1) {
            console.warn('[StoreMapper] ⚠️ Message not found for correlationId:', correlationId);
            console.log('[StoreMapper] 🔧 Available message IDs:', state.messages.map((m: any) => m.id));
            return state;
        }

        const newMessages = [...state.messages];
        const targetMsg = { ...newMessages[messageIndex] };

        console.log('[StoreMapper] 🔧 Target message before:', {
            id: targetMsg.id,
            existingToolCalls: targetMsg.toolCalls?.length || 0
        });

        if (!targetMsg.toolCalls) targetMsg.toolCalls = [];
        existingToolIndex = targetMsg.toolCalls.findIndex((tc: any) => tc.id === toolId);

        // 🏆 FIX: 解析 JSON 参数为对象，兼容 UI 组件
        let parsedArgs = {};
        try {
          // 尝试解析 JSON 字符串
          if (args && typeof args === 'string') {
            console.log('[StoreMapper] 🔧 Parsing JSON args:', args);
            // 尝试直接解析（完整的 JSON）
            parsedArgs = JSON.parse(args);
            console.log('[StoreMapper] ✅ Parsed args successfully:', parsedArgs);
          } else if (args && typeof args === 'object') {
            parsedArgs = args;
          }
        } catch (e) {
          console.warn('[StoreMapper] ⚠️ Failed to parse args:', args, e);
          // 解析失败时，尝试提取有用信息
          parsedArgs = { _raw: args || '' };
        }

        // 🏆 FIX: 创建兼容 UI 组件和私有库的双格式结构
        // UI 组件期望: { tool: 'name', args: {...} }  args 必须是对象
        // 私有库使用: { function: { name, arguments } }  arguments 是字符串
        if (existingToolIndex === -1) {
            // 🏆 NEW: 分配 batchId 以支持工具折叠显示
            const aggregatableTools = ['agent_scan_project', 'agent_list_dir', 'agent_read_file', 'agent_search', 'list_dir', 'read_file'];
            const lowerToolName = name.toLowerCase();
            let batchId: string | undefined = undefined;

            if (aggregatableTools.some(t => lowerToolName.includes(t))) {
                const lastToolCall = targetMsg.toolCalls.length > 0 ? targetMsg.toolCalls[targetMsg.toolCalls.length - 1] : null;
                console.log('[StoreMapper] 🔍 BatchId check:', {
                    currentTool: name,
                    lastTool: lastToolCall?.tool,
                    lastToolBatchId: (lastToolCall as any)?.batchId,
                    toolCallsLength: targetMsg.toolCalls.length
                });

                // 🏆 FIX: 简化batchId复用逻辑
                // 如果上一个工具有batchId，说明它是可聚合工具，直接复用
                // 不需要再次检查上一个工具的名称（因为它有batchId就说明是可聚合的）
                if (lastToolCall && (lastToolCall as any).batchId) {
                    batchId = (lastToolCall as any).batchId;
                    console.log('[StoreMapper] ✅ Reusing batchId from last tool:', batchId);
                } else {
                    const currentEditorMode = (window as any).__IFAI_EDITOR_MODE__ || 'vibe';
                    console.log('[StoreMapper] 🔍 Current editor mode:', currentEditorMode, '(no last tool with batchId)');
                    if (currentEditorMode === 'vibe' || currentEditorMode === 'spec') {
                        batchId = `batch_${crypto.randomUUID().slice(0, 8)}`;
                        console.log('[StoreMapper] 🆕 Created new batchId:', batchId);
                    } else {
                        console.log('[StoreMapper] ⚠️ Editor mode not vibe/spec, no batchId created');
                    }
                }
            } else {
                console.log('[StoreMapper] ⚠️ Tool not in aggregatable list:', name);
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
              targetMsg.toolCalls[existingToolIndex].function.arguments += args || '';
              // 尝试重新解析完整的 arguments
              try {
                const fullArgsStr = targetMsg.toolCalls[existingToolIndex].function.arguments;
                if (fullArgsStr.startsWith('{') && fullArgsStr.endsWith('}')) {
                  targetMsg.toolCalls[existingToolIndex].args = JSON.parse(fullArgsStr);
                }
              } catch (e) {
                // 解析失败，保持 _raw 格式
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
        setTimeout(async () => {
          const currentState = useChatStore.getState();

          // 🏆 FIX: 检查是否已经有续播在进行中
          if (continuationInProgress[correlationId]) {
            console.log('[StoreMapper] ⏳ Continuation already in progress for:', correlationId);
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

          const { useSettingsStore } = await import('../settingsStore');
          const settings = useSettingsStore.getState();
          const providerId = settings.currentProviderId || 'openai';
          const modelId = settings.currentModel || 'gpt-4o';

          console.log('[StoreMapper] 🔄 All tools completed, triggering AI continuation');
          console.log('[StoreMapper] 🔄 Message count for continuation:', currentState.messages.length);
          console.log('[StoreMapper] 🔄 CorrelationId for continuation:', correlationId);

          const targetMsg = currentState.messages.find((m: any) => m.id === correlationId);
          console.log('[StoreMapper] 🔄 Found target message:', targetMsg ? { id: targetMsg.id, role: targetMsg.role } : 'NOT FOUND');

          // 🏆 安全超时：5秒后强制重置 isLoading 和续播标记
          const safetyTimer = setTimeout(() => {
            if (useChatStore.getState().isLoading) {
              console.warn('[StoreMapper] ⏰ Tool continuation safety timeout. Resetting isLoading.');
              useChatStore.setState({ isLoading: false } as any);
            }
            continuationInProgress[correlationId] = false;
          }, 5000);

          try {
            await currentState.generateResponse(
              currentState.messages,
              providerId,
              modelId,
              correlationId  // 复用原始 assistant 消息 ID
            );
          } finally {
            clearTimeout(safetyTimer);
            // 🏆 续播完成后延迟重置标记
            setTimeout(() => {
              continuationInProgress[correlationId] = false;
            }, 1000);
          }
        }, 300); // 增加延迟确保所有工具完成事件都被处理
      }
    });

    // 5. 映射流式结束
    chatEventBus.on('chat:stream:finished', () => {
      useChatStore.setState({ isLoading: false } as any);
    });

    // 6. 映射错误
    chatEventBus.on('chat:error', (payload) => {
      useChatStore.setState({ isLoading: false } as any);
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
