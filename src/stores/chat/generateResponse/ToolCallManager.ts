/**
 * ToolCallManager - 工具调用管理器 (Phase 4)
 * 
 * 负责管理工具调用的全生命周期：
 * 拼装参数 -> 自动/手动审批 -> 异步执行 -> 结果反馈
 * 
 * @version v1.0.0
 */

import { chatEventBus, BasePayload } from '../eventBus/ChatEventBus';
import { useSettingsStore } from '../../settingsStore';

export interface ToolCallState {
  id: string;
  name: string;
  arguments: string;
  status: 'pending' | 'approved' | 'executing' | 'completed' | 'error';
  isPartial: boolean;
}

export class ToolCallManager {
  private activeToolCalls: Map<string, ToolCallState> = new Map();

  constructor() {
    this.init();
  }

  private init() {
    // 监听来自 StreamController 的工具信号
    chatEventBus.on('chat:tool:call', (payload) => {
      this.handleIncomingToolCall(payload);
    });

    // 监听流结束信号，尝试批量自动执行
    chatEventBus.on('chat:stream:finished', async (payload) => {
      await this.processPendingToolCalls(payload);
    });
  }

  /**
   * 处理流入的工具调用片段
   */
  private handleIncomingToolCall(payload: BasePayload & { toolId: string; name: string; arguments: string }) {
    const { toolId, name, arguments: newArgs, correlationId } = payload;
    
    let state = this.activeToolCalls.get(toolId);
    if (!state) {
      state = { id: toolId, name, arguments: '', status: 'pending', isPartial: true };
      console.log(`[ToolCallManager] 🆕 New tool call detected: ${name} (${toolId})`);
    }

    // 拼装参数
    state.arguments += newArgs;
    this.activeToolCalls.set(toolId, state);

    // 理论上此时可以触发 UI 预渲染事件，让用户看到正在输入参数
  }

  /**
   * 批量处理待审批的工具调用
   */
  private async processPendingToolCalls(payload: BasePayload) {
    const pending = Array.from(this.activeToolCalls.values()).filter(tc => tc.status === 'pending');
    if (pending.length === 0) return;

    console.log(`[ToolCallManager] ⚡ Processing ${pending.length} pending tool calls`);

    // 1. 执行审批流 (TODO: 引入统一审批策略)
    for (const tc of pending) {
      const shouldAutoApprove = this.checkAutoApprove(tc.name);
      
      if (shouldAutoApprove) {
        await this.executeTool(tc, payload);
      } else {
        // 发布需要审批的事件，UI 监听到后会弹出按钮
        chatEventBus.emit('chat:tool:call', {
          ...payload,
          toolId: tc.id,
          name: tc.name,
          arguments: tc.arguments,
          // 标记状态为待手动审批
        } as any);
      }
    }
  }

  /**
   * 执行具体工具
   */
  private async executeTool(tc: ToolCallState, payload: BasePayload) {
    tc.status = 'executing';
    console.log(`[ToolCallManager] 🛠️ Executing tool: ${tc.name}`);

    try {
      // TODO: 调用适配器执行真实业务
      // 此处先模拟结果分发
      chatEventBus.emit('chat:tool:completed', {
        ...payload,
        toolId: tc.id,
        result: `Mock result for ${tc.name}`,
        timestamp: Date.now()
      });
      
      tc.status = 'completed';
      this.activeToolCalls.delete(tc.id); // 清理
    } catch (error) {
      tc.status = 'error';
      chatEventBus.emit('chat:tool:completed', {
        ...payload,
        toolId: tc.id,
        result: null,
        error: String(error),
        timestamp: Date.now()
      });
    }
  }

  private checkAutoApprove(toolName: string): boolean {
    const settings = useSettingsStore.getState();
    // 简化的自动审批逻辑，实际会更复杂
    const safeTools = ['readFile', 'listFiles', 'getSymbol'];
    return settings.agentApprovalMode === 'auto' || safeTools.includes(toolName);
  }
}

export const toolCallManager = new ToolCallManager();
