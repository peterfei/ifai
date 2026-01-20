/**
 * TimelineLoader - 时间线分步加载逻辑
 *
 * 功能特性:
 * 1. 将消息转换为时间线事件
 * 2. 按天分组（今天、昨天、更早）
 * 3. 分批加载（避免一次性加载过多导致超时）
 * 4. 超时保护
 * 5. 错误恢复
 *
 * @version v0.3.1
 */

import type { Message } from 'ifainew-core';

export interface TimelineEvent {
  id: string;
  messageId: string;
  timestamp: number;
  timeLabel: string;
  type: 'user' | 'assistant';
  preview: string;
  hasCode: boolean;
  codeLanguage?: string;
  codeLines?: number;
}

export interface TimelineGroup {
  label: string; // "今天", "昨天", "更早"
  events: TimelineEvent[];
}

export interface TimelineLoadResult {
  groups: TimelineGroup[];
  loadedCount: number;
  totalCount: number;
  hasMore: boolean;
  error?: string; // 超时或其他错误信息
}

interface TimelineLoaderOptions {
  batchSize?: number;
  timeoutMs?: number;
}

export class TimelineLoader {
  private messages: Message[];
  private events: TimelineEvent[];
  private loadedCount: number;
  private batchSize: number;
  private timeoutMs: number;
  private abortController: AbortController | null;

  constructor(messages: Message[], options: TimelineLoaderOptions = {}) {
    this.messages = messages;
    // 检查是否有测试模式超时设置
    const testTimeoutMs = (typeof window !== 'undefined') ? (window as any).__TIMEOUT_TEST_MS__ : undefined;
    this.timeoutMs = testTimeoutMs || options.timeoutMs || 5000;
    this.batchSize = options.batchSize || 10;
    this.loadedCount = 0;
    this.abortController = null;

    console.log('[TimelineLoader] 收到消息数量:', messages.length);
    console.log('[TimelineLoader] 前3条消息:', messages.slice(0, 3));
    console.log('[TimelineLoader] 超时设置:', this.timeoutMs, 'ms');

    // 预处理所有消息为事件
    this.events = this.convertMessagesToEvents(messages);
    console.log('[TimelineLoader] 转换后事件数量:', this.events.length);
  }

  /**
   * 加载初始批次
   */
  async loadInitial(): Promise<TimelineLoadResult> {
    this.loadedCount = 0;
    return this.loadMore();
  }

  /**
   * 加载更多批次
   */
  async loadMore(): Promise<TimelineLoadResult> {
    // 防止重复加载
    if (this.abortController?.signal.aborted === false) {
      return this.getCurrentState();
    }

    this.abortController = new AbortController();

    try {
      // 设置超时保护 - 在超时后中止signal
      const timeoutId = setTimeout(() => {
        this.abortController?.abort();
      }, this.timeoutMs);

      // 加载下一批
      const nextBatch = this.events.slice(this.loadedCount, this.loadedCount + this.batchSize);
      // 更新loadedCount（即使超时，这些也已被"处理"）
      this.loadedCount += nextBatch.length;

      // 模拟网络延迟（可中断）
      // 在测试模式下，如果检测到超时测试标志，则等待更长时间以触发超时
      const isTimeoutTest = (typeof window !== 'undefined') && (window as any).__TIMEOUT_TEST_MODE__;
      const delayMs = isTimeoutTest ? 6000 : 100;

      await this.interruptibleDelay(delayMs, this.abortController.signal);

      clearTimeout(timeoutId);

      return this.getCurrentState();
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        // 返回当前已加载的状态，而不是抛出错误
        // 这样即使超时，已加载的气泡也会被保留
        const currentState = this.getCurrentState();
        return {
          ...currentState,
          error: '加载超时，点击重试'
        };
      }
      throw error;
    } finally {
      this.abortController = null;
    }
  }

  /**
   * 可中断的延迟
   */
  private async interruptibleDelay(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        // 只有在信号未被中止时才resolve
        if (!signal.aborted) {
          resolve();
        }
      }, ms);

      signal.addEventListener('abort', () => {
        clearTimeout(timeoutId);
        const error = new Error('AbortError');
        error.name = 'AbortError';
        reject(error);
      });
    });
  }

  /**
   * 获取当前状态
   */
  private getCurrentState(): TimelineLoadResult {
    const loadedEvents = this.events.slice(0, this.loadedCount);
    const groups = this.groupEventsByDay(loadedEvents);

    return {
      groups,
      loadedCount: this.loadedCount,
      totalCount: this.events.length,
      hasMore: this.loadedCount < this.events.length
    };
  }

  /**
   * 将消息转换为时间线事件
   */
  private convertMessagesToEvents(messages: Message[]): TimelineEvent[] {
    return messages
      .filter(msg => msg.role === 'user' || msg.role === 'assistant')
      .map(msg => this.messageToEvent(msg))
      .sort((a, b) => b.timestamp - a.timestamp); // 按时间倒序
  }

  /**
   * 单个消息转换为事件
   */
  private messageToEvent(message: Message): TimelineEvent {
    const content = typeof message.content === 'string' ? message.content : '';
    const codeInfo = this.extractCodeInfo(content);

    return {
      id: `timeline-${message.id}`,
      messageId: message.id,
      timestamp: (message as any).timestamp || Date.now(),
      timeLabel: this.formatTimeLabel((message as any).timestamp || Date.now()),
      type: message.role as 'user' | 'assistant',
      preview: this.truncateContent(content, 100),
      hasCode: codeInfo.hasCode,
      codeLanguage: codeInfo.language,
      codeLines: codeInfo.lines
    };
  }

  /**
   * 提取代码块信息
   */
  private extractCodeInfo(content: string): {
    hasCode: boolean;
    language?: string;
    lines?: number;
  } {
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    const matches = Array.from(content.matchAll(codeBlockRegex));

    if (matches.length === 0) {
      return { hasCode: false };
    }

    const firstMatch = matches[0];
    const language = firstMatch[1] || 'text';
    const code = firstMatch[2];
    const lines = code.split('\n').length;

    return {
      hasCode: true,
      language,
      lines
    };
  }

  /**
   * 截断内容预览
   */
  private truncateContent(content: string, maxLength: number): string {
    if (content.length <= maxLength) return content;
    return content.substring(0, maxLength) + '...';
  }

  /**
   * 格式化时间标签
   */
  private formatTimeLabel(timestamp: number): string {
    const date = new Date(timestamp);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  /**
   * 按天分组事件
   */
  private groupEventsByDay(events: TimelineEvent[]): TimelineGroup[] {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

    const groups: TimelineGroup[] = [];
    const todayEvents: TimelineEvent[] = [];
    const yesterdayEvents: TimelineEvent[] = [];
    const olderEvents: TimelineEvent[] = [];

    events.forEach(event => {
      const eventDate = new Date(event.timestamp);
      const eventDay = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());

      if (eventDay.getTime() === today.getTime()) {
        todayEvents.push(event);
      } else if (eventDay.getTime() === yesterday.getTime()) {
        yesterdayEvents.push(event);
      } else {
        olderEvents.push(event);
      }
    });

    if (todayEvents.length > 0) {
      groups.push({ label: '今天', events: todayEvents });
    }
    if (yesterdayEvents.length > 0) {
      groups.push({ label: '昨天', events: yesterdayEvents });
    }
    if (olderEvents.length > 0) {
      groups.push({ label: '更早', events: olderEvents });
    }

    return groups;
  }

  /**
   * 模拟网络延迟（仅用于演示）
   * 在测试模式下，如果检测到超时测试标志，则等待更长时间以触发超时
   */
  private async simulateNetworkDelay(): Promise<void> {
    // 检查是否是超时测试模式（通过全局标志）
    const isTimeoutTest = (typeof window !== 'undefined') && (window as any).__TIMEOUT_TEST_MODE__;

    if (isTimeoutTest) {
      // 超时测试模式：等待足够长的时间以触发超时（6秒，超过5秒超时）
      return new Promise(resolve => setTimeout(resolve, 6000));
    }

    // 正常模式：等待100ms
    return new Promise(resolve => setTimeout(resolve, 100));
  }
}
