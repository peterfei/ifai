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
import { createLogger } from '../../../utils/logger';

// 🔥 Logger instance for PersistenceManager
const logger = createLogger('PersistenceManager');

/**
 * 持久化管理器配置
 */
const PERSISTENCE_CONFIG = {
  STREAM_THROTTLE_MS: 2000, // 🔥 FIX: 流式响应节流从 200ms 增加到 2000ms (2秒)
                           // 原因：每个 chunk 都持久化导致 UI 冻结
                           // 2秒内只持久化一次，大幅减少 IndexedDB 写入
  DISABLE_STREAMING_PERSIST: true, // 🔥 FIX: 完全禁用流式期间持久化
                                  // 原因：流式输出时频繁持久化是 UI 卡顿的根本原因
                                  // 策略：只在流式结束时保存一次，确保数据安全
};

export class PersistenceManager {
  private lastStreamPersistTime = 0;
  private streamThrottleTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.init();
    // 🏆 Phase 6: 启动自愈
    this.recoverSessions();
  }

  /**
   * 持久化自愈：处理因崩溃导致的断链状态
   */
  private async recoverSessions() {
    logger.info('Running persistence self-healing check...');
    try {
      const { useThreadStore } = await import('../../threadStore');
      const threads = useThreadStore.getState().threads;

      for (const threadId of Object.keys(threads)) {
        const messages = getThreadMessages(threadId);
        let hasFixed = false;

        // 修复处于中间态的消息
        const fixedMessages = messages.map(m => {
          if (m.status === 'sending' || m.status === 'streaming') {
            hasFixed = true;
            return { ...m, status: 'interrupted', content: m.content + '\n\n[Session Interrupted during refactor/crash]' };
          }
          return m;
        });

        if (hasFixed) {
          logger.warn(`Recovered interrupted session: ${threadId}`);
          setThreadMessages(threadId, fixedMessages as any);
          await this.persistFullSession(threadId);
        }
      }
    } catch (error) {
      logger.error('Self-healing failed:', error);
    }
  }

  /**
   * 初始化：将存储层挂载到神经系统
   */
  private init() {
    logger.info('Memory system online, subscribing to EventBus...');

    // 🔥 FIX: 打印流式持久化策略
    if (PERSISTENCE_CONFIG.DISABLE_STREAMING_PERSIST) {
      logger.info('Streaming persistence DISABLED for performance');
      logger.info('   (will persist once on stream:finished)');
    } else {
      logger.info(`Streaming persistence enabled (throttle: ${PERSISTENCE_CONFIG.STREAM_THROTTLE_MS}ms)`);
    }

    // 1. 发送瞬间即刻落盘 (物理保险丝 1: 发送不断链)
    chatEventBus.on('chat:message:sent', async (payload) => {
      logger.debug(`Transactional commit for message: ${payload.messageId}`);
      await this.persistFullSession(payload.sessionId);
    });

    // 2. 流式响应节流持久化 (物理保险丝 2: 崩溃恢复)
    chatEventBus.on('chat:stream:chunk', (payload) => {
      this.throttledPersist(payload.sessionId);
    });

    // 3. 错误或结束时强制同步最终状态
    chatEventBus.on('chat:stream:finished', async (payload) => {
      this.clearThrottleTimer();
      logger.info(`Final persist for session: ${payload.sessionId || payload.correlationId}`);
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
    // 🔥 FIX: 如果启用了禁用流式持久化，直接跳过
    if (PERSISTENCE_CONFIG.DISABLE_STREAMING_PERSIST) {
      // 完全跳过流式期间的持久化
      // 只在 chat:stream:finished 时保存一次
      return;
    }

    const now = Date.now();

    // 如果距离上次持久化不足 2000ms，则仅设置定时器兜底
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
      }
    } catch (error) {
      logger.error(`Persistence failure for ${sessionId}:`, error);
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
