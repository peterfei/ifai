/**
 * StoreMapper - 架构映射器 (Phase 5)
 * 
 * 负责将新架构的 EventBus 信号映射回 Zustand Store 状态。
 * 它是新旧架构过渡期间的“胶水层”，确保 UI 能够感知到解耦后的逻辑变更。
 * 
 * @version v1.0.0
 */

import { chatEventBus } from './eventBus/ChatEventBus';
import { useChatStore as coreUseChatStore } from '../useChatStore';
import type { Message } from 'ifainew-core';

export class StoreMapper {
  constructor() {
    this.init();
  }

  private init() {
    console.log('[StoreMapper] 🔗 Mapping EventBus to Zustand Store...');

    // 🏆 初始化同步：确保 StoreMapper 启动时能感知到 Store
    if (coreUseChatStore.getState().messages.length > 0) {
        console.log('[StoreMapper] ℹ️ Initializing with existing messages');
    }

    // 1. 映射消息发送开始 (Loading 开始)
    chatEventBus.on('chat:message:sending', (payload) => {
      coreUseChatStore.setState({ isLoading: true });
    });

    // 2. 映射消息发送完成
    chatEventBus.on('chat:message:sent', (payload) => {
      const { messageId, content, correlationId } = payload;
      
      const userMessage: any = {
        id: messageId,
        role: 'user',
        content: content,
        timestamp: Date.now(),
        status: 'sent',
        // 🏆 兼容 TimelineLoader: 必须有 id 字段
        _id: messageId 
      };

      const assistantId = correlationId; 
      const assistantPlaceholder: any = {
        id: assistantId,
        role: 'assistant',
        content: '',
        status: 'streaming',
        timestamp: Date.now() + 1,
        _id: assistantId
      };

      // 🏆 物理级同步
      const globalStore = (window as any).__chatStore || coreUseChatStore;
      
      globalStore.setState(((state: any) => {
        const filtered = state.messages.filter((m: any) => m.id !== messageId && m.id !== assistantId);
        return {
          messages: [...filtered, userMessage, assistantPlaceholder],
          isLoading: true
        };
      }) as any);
      
      // 🚀 发送就绪信号，解除 TDD 等待
      if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('ifai:refactor:sync-complete', { detail: { correlationId } }));
      }
      console.log(`[StoreMapper] 🚀 Global UI Sync for ${correlationId}`);
    });
    // 2. 映射流式 Chunk 事件
    chatEventBus.on('chat:stream:chunk', (payload) => {
      const { delta, correlationId, isFinal } = payload;
      
      const globalStore = (window as any).__chatStore || coreUseChatStore;
      globalStore.setState(((state: any) => {
        const messageIndex = state.messages.findIndex((m: any) => m.id === correlationId || m.id.includes(correlationId));
        if (messageIndex === -1) return state;

        const newMessages = [...state.messages];
        const targetMsg = { ...newMessages[messageIndex] };
        targetMsg.content += delta;
        targetMsg.status = isFinal ? 'sent' : 'streaming';
        newMessages[messageIndex] = targetMsg;

        return { 
            messages: newMessages, 
            isLoading: !isFinal // 🏆 补强：如果是最后一块，直接停止 Loading
        };
      }) as any);
    });

    // 映射流式结束
    chatEventBus.on('chat:stream:finished', (payload) => {
      const globalStore = (window as any).__chatStore || coreUseChatStore;
      globalStore.setState({ isLoading: false });
      console.log('[StoreMapper] 🏁 Stream finished signal received');
    });

    // 3. 映射错误事件
    chatEventBus.on('chat:error', (payload) => {
      coreUseChatStore.setState({ isLoading: false });
      // TODO: 触发全局错误提示 (Toast)
    });
  }
}

export const storeMapper = new StoreMapper();
