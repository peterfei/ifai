/**
 * StoreMapper - 架构映射器 (核级对齐版)
 * 
 * 负责将 EventBus 信号映射回 Zustand Store 状态。
 */

import { chatEventBus } from './eventBus/ChatEventBus';
import { useChatStore } from '../useChatStore';
import { useSettingsStore } from '../settingsStore';
import { shouldAutoApprove as checkAutoApprove } from '../../utils/approvalPolicy';

export const initStoreMapper = () => {
    console.log('[StoreMapper] 🔗 Atomic Linkage Active');

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
        const existingToolIndex = targetMsg.toolCalls.findIndex((tc: any) => tc.id === toolId);

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
            targetMsg.toolCalls.push({
                id: toolId,
                type: 'function',
                // 🔥 UI 组件兼容字段（args 必须是对象）
                tool: name,
                args: parsedArgs,
                // 🔥 私有库兼容字段（arguments 保持字符串）
                function: { name, arguments: args || '' },
                // 🔥 FIX: 设置初始状态为 pending
                status: 'pending'
            });
            console.log('[StoreMapper] 🔧 Added new tool call:', name);
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

      // 🏆 FIX: 自动审批逻辑（在状态更新后异步执行）
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
            const chatStore = useChatStore.getState();
            await chatStore.approveToolCall(correlationId, toolId);
          }
        } catch (error) {
          console.error('[StoreMapper] ❌ Auto-approve failed:', error);
        }
      }, 100);
    });

    // 4. 映射工具执行结果
    chatEventBus.on('chat:tool:completed', (payload) => {
      const { toolId, result, error, correlationId } = payload;

      console.log('[StoreMapper] ✅ Tool completed event received:', { toolId, correlationId, hasResult: !!result });

      const updater = (state: any) => {
        const content = error || (typeof result === 'string' ? result : JSON.stringify(result));

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

        return {
          messages: [
            ...updatedMessages,
            {
              id: `res-${toolId}`,
              role: 'tool',
              content: content,
              tool_call_id: toolId,
              timestamp: Date.now()
            }
          ],
          isLoading: true
        };
      };
      useChatStore.setState(updater as any);
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
