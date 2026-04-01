/**
 * 批量渲染器 - 保证消息流畅的同时减少 React 重渲染
 *
 * 核心特性：
 * 1. 使用 requestAnimationFrame 批量更新（16ms @ 60fps）
 * 2. 超时机制确保消息不断（最长 50ms 必须刷新）
 * 3. 工具调用立即刷新（保证工具响应及时）
 *
 * @module BatchRenderer
 */

/**
 * 批量渲染器基类
 */
export abstract class BatchRenderer {
  protected buffer: string[] = [];
  protected lastFlush: number = Date.now();
  protected rafId: number | null = null;
  protected timeoutId: number | null = null;

  // 配置参数
  private readonly FLUSH_INTERVAL = 50; // 最长 50ms 必须刷新
  private readonly IMMEDIATE_FLUSH_CHARS = 10; // 遇到标点立即刷新

  /**
   * 添加文本到缓冲区
   * @param text - 要添加的文本
   * @param isToolCall - 是否是工具调用（工具调用立即刷新）
   */
  append(text: string, isToolCall: boolean = false): void {
    this.buffer.push(text);

    // ✅ 保证 1：工具调用立即刷新
    if (isToolCall) {
      this.flush();
      return;
    }

    // ✅ 保证 2：遇到标点符号立即刷新（保持句子完整性）
    if (this.hasSentenceEnding(text)) {
      this.scheduleFlush();
      return;
    }

    // ✅ 保证 3：超时刷新（防止长时间无数据时不更新）
    const now = Date.now();
    if (now - this.lastFlush > this.FLUSH_INTERVAL) {
      this.flush();
      return;
    }

    // ✅ 保证 4：使用 RAF 批量更新（减少 React 重渲染）
    if (!this.rafId) {
      this.rafId = requestAnimationFrame(() => {
        this.flush();
      });
    }
  }

  /**
   * 检查文本是否包含句子结束标点
   */
  private hasSentenceEnding(text: string): boolean {
    // 检查是否包含句子结束标点
    return /[。！？\.!?]/
      .test(text.slice(-this.IMMEDIATE_FLUSH_CHARS));
  }

  /**
   * 调度延迟刷新（一帧后）
   */
  private scheduleFlush(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }
    this.timeoutId = window.setTimeout(() => {
      this.flush();
    }, 16); // 一帧后刷新
  }

  /**
   * 刷新缓冲区
   */
  private flush(): void {
    if (this.buffer.length === 0) return;

    const text = this.buffer.join('');
    this.buffer = [];
    this.lastFlush = Date.now();

    // 清理定时器
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    // 一次性更新 React 状态
    this.onFlush(text);
  }

  /**
   * 子类实现：具体的 React 状态更新
   */
  protected abstract onFlush(text: string): void;

  /**
   * 销毁渲染器
   */
  destroy(): void {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
    }
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }
  }
}

/**
 * 聊天消息渲染器
 */
export class ChatMessageRenderer extends BatchRenderer {
  constructor(
    private messageId: string,
    private updateState: (messageId: string, text: string) => void
  ) {
    super();
  }

  protected onFlush(text: string): void {
    this.updateState(this.messageId, text);
  }
}

/**
 * 使用示例：
 *
 * ```typescript
 * // 创建渲染器
 * const renderer = new ChatMessageRenderer(messageId, (id, text) => {
 *   setMessages(prev => prev.map(msg =>
 *     msg.id === id ? { ...msg, content: text } : msg
 *   ));
 * });
 *
 * // 监听流式事件
 * const unlisten = await listen<StreamEvent>(`stream:${streamId}`, (event) => {
 *   switch (event.payload.type) {
 *     case 'text.delta':
 *       renderer.append(event.payload.text);
 *       break;
 *     case 'tool.start':
 *       renderer.append(event.payload.text, true); // 立即刷新
 *       break;
 *     case 'message.done':
 *       renderer.destroy();
 *       break;
 *   }
 * });
 * ```
 */
