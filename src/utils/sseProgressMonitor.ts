/**
 * SSE Progress Event 监听器
 *
 * 监听 HTTP API 的 SSE progress 事件流，用于 E2E 测试环境
 * 在真实 Tauri 环境中，使用 Tauri IPC 事件；在 E2E 测试环境中，使用 SSE
 *
 * @version v1.0.0
 */

interface WorkflowProgressEvent {
  event_type: string;
  workflow_id?: string;
  node_id?: string;
  message?: string;
  timestamp: number;
  tool_details?: any;
  /** 🔥 流式内容增量（用于 Doc agent 的渐进式输出） */
  content_delta?: string;
  /** 🔥 流式输出是否完成 */
  content_finished?: boolean;
}

type ProgressEventListener = (event: WorkflowProgressEvent) => void;

/**
 * SSE Progress 监听器类
 */
export class SSEProgressMonitor {
  private eventSource: EventSource | null = null;
  private listeners: Map<string, ProgressEventListener[]> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;
  private reconnectDelay = 1000;

  /**
   * 连接到 SSE progress 流
   */
  connect(url: string = 'http://localhost:3333/api/workflow/progress'): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        console.log('[SSEProgressMonitor] 🔄 Connecting to SSE stream:', url);

        this.eventSource = new EventSource(url);

        this.eventSource.onopen = () => {
          console.log('[SSEProgressMonitor] ✅ SSE connection opened');
          this.reconnectAttempts = 0;
          resolve();
        };

        this.eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            this.dispatchEvent(data);
          } catch (error) {
            console.error('[SSEProgressMonitor] ❌ Failed to parse SSE event:', error);
          }
        };

        this.eventSource.onerror = (error) => {
          console.error('[SSEProgressMonitor] ⚠️ SSE error:', error);

          // 尝试重连
          if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`[SSEProgressMonitor] 🔄 Reconnecting... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

            setTimeout(() => {
              this.close();
              this.connect(url).catch(err => {
                console.error('[SSEProgressMonitor] ❌ Reconnect failed:', err);
                reject(err);
              });
            }, this.reconnectDelay * this.reconnectAttempts);
          } else {
            console.error('[SSEProgressMonitor] ❌ Max reconnect attempts reached');
            this.close();
            reject(new Error('Failed to connect to SSE stream'));
          }
        };

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 添加事件监听器
   */
  on(eventType: string, listener: ProgressEventListener): void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, []);
    }
    this.listeners.get(eventType)!.push(listener);
  }

  /**
   * 移除事件监听器
   */
  off(eventType: string, listener: ProgressEventListener): void {
    const listeners = this.listeners.get(eventType);
    if (listeners) {
      const index = listeners.indexOf(listener);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
    }
  }

  /**
   * 分发事件到监听器
   */
  private dispatchEvent(event: WorkflowProgressEvent): void {
    const eventType = event.event_type;
    const listeners = this.listeners.get(eventType);

    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(event);
        } catch (error) {
          console.error(`[SSEProgressMonitor] ❌ Error in listener for ${eventType}:`, error);
        }
      });
    }

    // 同时分发到通配符监听器
    const allListeners = this.listeners.get('*');
    if (allListeners) {
      allListeners.forEach(listener => {
        try {
          listener(event);
        } catch (error) {
          console.error('[SSEProgressMonitor] ❌ Error in * listener:', error);
        }
      });
    }
  }

  /**
   * 关闭 SSE 连接
   */
  close(): void {
    if (this.eventSource) {
      console.log('[SSEProgressMonitor] 🔌 Closing SSE connection');
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  /**
   * 检查连接状态
   */
  isConnected(): boolean {
    return this.eventSource !== null && this.eventSource.readyState === EventSource.OPEN;
  }
}

/**
 * 全局 SSE Progress 监听器实例
 */
let globalSSEMonitor: SSEProgressMonitor | null = null;

/**
 * 获取或创建全局 SSE Progress 监听器
 */
export function getSSEProgressMonitor(): SSEProgressMonitor {
  if (!globalSSEMonitor) {
    globalSSEMonitor = new SSEProgressMonitor();
  }
  return globalSSEMonitor;
}

/**
 * 启动 SSE Progress 监听（自动检测是否需要）
 *
 * 在 E2E 测试环境中自动启动 SSE 监听
 * 在真实 Tauri 环境中不启动（使用 Tauri IPC）
 */
export async function startSSEProgressMonitoringIfNeeded(): Promise<boolean> {
  // 检测是否在 E2E 测试环境
  const isE2E = (window as any).__E2E__ === true;

  if (!isE2E) {
    console.log('[SSEProgressMonitor] ℹ️ Not in E2E mode, skipping SSE monitoring');
    return false;
  }

  // 🔥 FIX: 检测是否是真实 Tauri（非 mock）
  // 通过检查 invoke 函数的属性来判断是否是 mock
  const invoke = (window as any).__TAURI_INTERNALS__?.invoke ||
                 (window as any).__TAURI__?.core?.invoke;

  let isRealTauri = false;
  if (invoke && typeof invoke === 'function') {
    // 🔥 FIX: 检查 interceptor 标记
    const isMock = (invoke as any).isE2EMock === true;

    if (!isMock) {
      // 如果没有标记，检查源代码（向后兼容）
      const invokeStr = invoke.toString();
      isRealTauri = !invokeStr.includes('PIVO3-Mock') &&
                    !invokeStr.includes('E2E Mock') &&
                    !invokeStr.includes('E2E Tauri Mock');
    }
  }

  if (isRealTauri) {
    console.log('[SSEProgressMonitor] ℹ️ Real Tauri IPC available, skipping SSE monitoring');
    return false;
  }

  // 🔥 FIX: 即使有 mock Tauri IPC，在 E2E 环境中也要启动 SSE 监听
  // 因为 mock IPC 不会触发真实的工作流事件
  console.log('[SSEProgressMonitor] 🔄 E2E environment with mock Tauri, starting SSE monitoring...');

  try {
    const monitor = getSSEProgressMonitor();
    await monitor.connect();
    console.log('[SSEProgressMonitor] ✅ SSE monitoring started for E2E environment');
    return true;
  } catch (error) {
    console.error('[SSEProgressMonitor] ❌ Failed to start SSE monitoring:', error);
    return false;
  }
}

/**
 * 停止 SSE Progress 监听
 */
export function stopSSEProgressMonitoring(): void {
  if (globalSSEMonitor) {
    globalSSEMonitor.close();
    globalSSEMonitor = null;
  }
}
