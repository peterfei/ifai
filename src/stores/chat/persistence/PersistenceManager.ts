/**
 * PersistenceManager - 聊天事务持久化管理器 (记忆系统)
 * 
 * 作为 ChatEventBus 的核心订阅者，实时转录消息事务。
 * 实现“发送即存、流式节流”的稳定性策略。
 * 
 * @version v1.0.0
 */

import { chatEventBus } from '../eventBus/ChatEventBus';
import { threadPersistence } from '../../persistence/threadPersistence';
import { getThreadMessages, setThreadMessages } from '../../useChatStore';

/**
 * 持久化管理器配置
 */
const PERSISTENCE_CONFIG = {
  STREAM_THROTTLE_MS: 200, // 流式响应持久化节流 (200ms)
};

export class PersistenceManager {
  private lastStreamPersistTime = 0;
  private streamThrottleTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.init();
  }

  /**
   * 初始化：将存储层挂载到神经系统
   */
  private init() {
    console.log('[PersistenceManager] 🧠 Memory system online, subscribing to EventBus...');

    // 1. 发送瞬间即刻落盘 (物理保险丝 1: 发送不断链)
    chatEventBus.on('chat:message:sent', async (payload) => {
      console.log(`[PersistenceManager] 💾 Transactional commit for message: ${payload.messageId}`);
      await this.persistFullSession(payload.sessionId);
    });

    // 2. 流式响应节流持久化 (物理保险丝 2: 崩溃恢复)
    chatEventBus.on('chat:stream:chunk', (payload) => {
      this.throttledPersist(payload.sessionId);
    });

    // 3. 错误或结束时强制同步最终状态
    chatEventBus.on('chat:stream:finished', async (payload) => {
      this.clearThrottleTimer();
      await this.persistFullSession(payload.sessionId);
    });

    chatEventBus.on('chat:error', async (payload) => {
      this.clearThrottleTimer();
      await this.persistFullSession(payload.sessionId);
    });
  }

  /**
   * 节流持久化：平衡性能与数据安全性
   */
  private throttledPersist(sessionId: string) {
    const now = Date.now();
    
    // 如果距离上次持久化不足 200ms，则仅设置定时器兜底
    if (now - this.lastStreamPersistTime < PERSISTENCE_CONFIG.STREAM_THROTTLE_MS) {
      if (!this.streamThrottleTimer) {
        this.streamThrottleTimer = setTimeout(() => {
          this.persistFullSession(sessionId);
          this.clearThrottleTimer();
        }, PERSISTENCE_CONFIG.STREAM_THROTTLE_MS);
      }
      return;
    }

    // 执行持久化
    this.persistFullSession(sessionId);
    this.lastStreamPersistTime = now;
  }

  /**
   * 完整 Session 事务落盘
   */
  private async persistFullSession(sessionId: string) {
    try {
      const { useThreadStore } = await import('../../threadStore');
      const thread = useThreadStore.getState().getThread(sessionId);
      
      if (thread) {
        // 🏆 物理隔离：直接调用底层持久化服务
        await threadPersistence.saveThread(thread);
        const messages = getThreadMessages(sessionId);
        if (messages.length > 0) {
          await threadPersistence.saveThreadMessages(sessionId, messages as any);
        }
        console.log(`[PersistenceManager] ✅ Session ${sessionId} persisted successfully.`);
      }
    } catch (error) {
      console.error(`[PersistenceManager] ❌ Persistence failure for ${sessionId}:`, error);
    }
  }

  private clearThrottleTimer() {
    if (this.streamThrottleTimer) {
      clearTimeout(this.streamThrottleTimer);
      this.streamThrottleTimer = null;
    }
  }
}

// 导出单例，确保全系统共用一套持久化策略
export const persistenceManager = new PersistenceManager();
