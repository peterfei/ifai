/**
 * DebugLog — 类型定义
 *
 * 前端调试日志系统的类型定义。
 * 用于记录关键运行时信息，供 LLM 或开发者离线分析。
 *
 * @version 1.0.0
 * @proposal 011-per-thread-gui-session-persistence
 */

export type DebugCategory =
  | 'lifecycle'
  | 'store:action'
  | 'stream:start'
  | 'stream:chunk'
  | 'stream:finish'
  | 'thread:switch'
  | 'cross-thread'
  | 'layer2:recovery'
  | 'layer3:recovery'
  | 'error'
  | 'performance'
  | 'event-bus'
  | 'storage'
  | 'user-input';

export type DebugLevel = 'debug' | 'info' | 'warn' | 'error';

export interface DebugLogEntry {
  id: string;
  timestamp: number;
  threadId?: string;
  correlationId?: string;
  category: DebugCategory;
  level: DebugLevel;
  message: string;
  data?: Record<string, any>;
  duration?: number;
}
