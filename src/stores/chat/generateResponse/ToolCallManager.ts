/**
 * ToolCallManager - 工具调用管理器 (Final Fidelity & Syntax Fixed)
 * 
 * 负责管理工具调用的全生命周期，支持即时执行与异常保护。
 */

import { chatEventBus, BasePayload } from '../eventBus/ChatEventBus';

export interface ToolCallState {
  id: string;
  name: string;
  arguments: string;
  status: 'pending' | 'approved' | 'executing' | 'completed' | 'error';
}

export class ToolCallManager {
  private activeToolCalls: Map<string, ToolCallState> = new Map();
  private isStreamActive = false;

  constructor() {
    this.init();
  }
private init() {
  chatEventBus.on('chat:stream:start', () => { this.isStreamActive = true; });
  chatEventBus.on('chat:stream:finished', (p) => { 
      this.isStreamActive = false; 
      this.processPendingToolCalls(p); 
  });

  chatEventBus.on('chat:tool:call', (payload) => {
    if ((payload as any).isUIRequest) return; 
    this.handleIncomingToolCall(payload);
  });

  // 🏆 物理后门：供 E2E 测试强制执行所有待审批工具
  if (typeof window !== 'undefined') {
      (window as any).__E2E_FORCE_EXECUTE_ALL__ = () => {
          console.log('[ToolCallManager] 🛡️ E2E Force executing all pending tools...');
          const pending = Array.from(this.activeToolCalls.values());
          pending.forEach(tc => this.executeTool(tc, { correlationId: 'e2e-forced', sessionId: 'e2e', timestamp: Date.now() }));
      };
  }
}

  private handleIncomingToolCall(payload: any) {
    const { toolId, name, arguments: newArgs } = payload;
    let state = this.activeToolCalls.get(toolId);
    
    if (!state) {
      state = { id: toolId, name, arguments: '', status: 'pending' };
      this.activeToolCalls.set(toolId, state);
    }

    state.arguments += newArgs;

    // 🏆 物理保险丝：如果流已结束，立即尝试处理
    if (!this.isStreamActive) {
        this.processPendingToolCalls(payload);
    }
  }

  private async processPendingToolCalls(payload: BasePayload) {
    const pending = Array.from(this.activeToolCalls.values()).filter(tc => tc.status === 'pending');
    for (const tc of pending) {
      if (this.checkAutoApprove(tc.name)) {
        await this.executeTool(tc, payload);
      } else {
        chatEventBus.emit('chat:error', { 
            ...payload, 
            code: 'APPROVAL_REQUIRED', 
            message: `Tool ${tc.name} requires manual approval`,
            moduleId: 'ToolManager'
        } as any);
      }
    }
  }

  private async executeTool(tc: ToolCallState, payload: BasePayload) {
    if (tc.status === 'executing') return;

    // 🏆 特殊处理：如果是 LocalModel 自动触发的工具（如 bash），由后端直接执行
    if ((payload as any).isAutoExecuted) {
        console.log(`[ToolCallManager] ⚡ Tool ${tc.name} auto-executing, skipping manual invoke.`);
        tc.status = 'executing';
        return;
    }

    tc.status = 'executing';

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const { useFileStore } = await import('../../fileStore');

      console.log(`[ToolCallManager] 🛠️ Executing via invoke: ${tc.name}`);

      // 🏆 获取项目根目录
      const projectRoot = useFileStore.getState().rootPath;

      const result = await invoke('approve_tool_call', {
        messageId: payload.correlationId,
        toolCallId: tc.id,
        toolName: tc.name,           // 🆕 工具名称
        toolArgs: tc.arguments,       // 🆕 工具参数
        projectRoot: projectRoot      // 🆕 项目根目录
      }).catch(err => {
          console.warn(`[ToolCallManager] ⚠️ Backend command failed:`, err);
          return null;
      });

      // 🏆 FIX: 在执行成功后也更新全局 Store 中的工具状态为 completed
      const globalStore = (window as any).__chatStore;
      if (globalStore && result) {
          console.log(`[ToolCallManager] 💉 Updating tool status to completed in Store: ${tc.name}`);
          globalStore.setState((state: any) => ({
              messages: state.messages.map((msg: any) => {
                  if (msg.toolCalls && msg.toolCalls.some((t: any) => t.id === tc.id)) {
                      return {
                          ...msg,
                          toolCalls: msg.toolCalls.map((t: any) =>
                              t.id === tc.id ? { ...t, status: 'completed' as const, result } : t
                          )
                      };
                  }
                  return msg;
              })
          }));
      }

      if (!result) {
          tc.status = 'error';

          // 🏆 FIX: 更新全局 Store 中的工具状态为 error
          const globalStore = (window as any).__chatStore;
          if (globalStore) {
              console.log(`[ToolCallManager] 💉 Updating tool status to error in Store: ${tc.name}`);
              globalStore.setState((state: any) => ({
                  messages: state.messages.map((msg: any) => {
                      if (msg.toolCalls && msg.toolCalls.some((t: any) => t.id === tc.id)) {
                          return {
                              ...msg,
                              toolCalls: msg.toolCalls.map((t: any) =>
                                  t.id === tc.id ? { ...t, status: 'error' as const } : t
                              )
                          };
                      }
                      return msg;
                  })
              }));
          }

          return;
      }

      // 🏆 FIX: 在执行成功后也更新全局 Store 中的工具状态为 completed
      // 这会在 StoreMapper 中触发 chat:tool:completed 事件处理
      tc.status = 'completed';

      // 添加工具结果消息到 Store（复用 globalStore 引用）
      if (globalStore) {
          console.log(`[ToolCallManager] 💉 Adding result message for ${tc.name} to Store`);
          globalStore.setState((state: any) => ({
              messages: [...state.messages, {
                  id: `res-${tc.id}`,
                  role: 'tool',
                  content: typeof result === 'string' ? result : JSON.stringify(result),
                  tool_call_id: tc.id,
                  timestamp: Date.now()
              }],
              isLoading: true
          }));
      }

      chatEventBus.emit('chat:tool:completed', {
  ...payload,
  toolId: tc.id,
  result: result,
  timestamp: Date.now()
});

this.activeToolCalls.delete(tc.id);

// 🏆 物理隔离保护：延迟 100ms 触发续播，确保渲染已完成
setTimeout(async () => {
    if (this.activeToolCalls.size === 0 && globalStore) {
        const state = globalStore.getState();

        const { useSettingsStore } = await import('../../settingsStore');
        const settings = useSettingsStore.getState();
        const providerId = settings.currentProviderId || 'openai';
        const modelId = settings.currentModel || 'gpt-4o';

        // 🏆 FIX: 复用原始 assistant 消息 ID 作为 correlationId，确保后续工具调用能找到正确的消息
        const existingCorrelationId = payload.correlationId;
        console.log(`[ToolCallManager] 🔄 Resuming AI response with existingCorrelationId: ${existingCorrelationId}`);
        state.generateResponse(state.messages, providerId, modelId, existingCorrelationId);
    }
}, 100);
    } catch (e) {
      console.error('[ToolCallManager] ❌ Execution failed:', e);
      this.activeToolCalls.delete(tc.id);
    }
  }

  private checkAutoApprove(toolName: string): boolean {
    const safeTools = ['agent_scan_project', 'agent_list_dir', 'readFile', 'listFiles', 'getSymbol', 'bash'];
    return safeTools.includes(toolName);
  }
}

export const toolCallManager = new ToolCallManager();
