/**
 * Tauri Mock 测试环境设置
 *
 * 这个文件在测试文件的最顶部导入，确保 Mock 在所有其他导入之前生效
 */

import { vi } from 'vitest';
import { setupTauriMockPipeline } from './TauriMockPipeline';

// ==================== 初始化 Mock 管线 ====================

export const mockHelpers = setupTauriMockPipeline();

// ==================== 导出便捷函数 ====================

/**
 * 发送工作流进度事件
 */
export function emitWorkflowProgressEvent(data: {
  event_type: 'node_started' | 'node_progress' | 'node_completed' | 'tool_call';
  node_id?: string;
  message?: string;
  timestamp: number;
}) {
  mockHelpers.emitEvent('workflow:progress', data);
}

/**
 * 发送工作流完成事件
 */
export function emitWorkflowCompletedEvent(data: {
  workflow_id: string;
  status: string;
  node_results: Array<{
    node_id: string;
    status: string;
    output?: string;
    error?: string;
  }>;
  started_at?: number;
  completed_at?: number;
}) {
  mockHelpers.emitEvent('workflow:completed', data);
}

/**
 * 发送工作流错误事件
 */
export function emitWorkflowErrorEvent(data: {
  workflow_id: string;
  error: string;
}) {
  mockHelpers.emitEvent('workflow:error', data);
}

/**
 * 清除所有事件监听器
 */
export function clearAllListeners() {
  mockHelpers.clearListeners();
}

// ==================== Vitest 配置 ====================

// 设置全局变量
declare global {
  const __TAURI__: any;
}

// 自动清理（在每个测试后）
afterEach(() => {
  clearAllListeners();
});

// ==================== 导出测试用的 listen 函数 ====================

/**
 * 测试用的 listen 函数
 * 使用 Mock 管线的事件总线
 */
export const testListen = async <T>(
  event: string,
  handler: (event: { payload: T }) => void
): Promise<() => void> => {
  // 使用全局测试事件总线
  const { testEventBus } = await import('./TauriMockPipeline');
  return Promise.resolve(testEventBus.on<T>(event, handler));
};

