/**
 * Tauri API Mock - @tauri-apps/api/core
 *
 * 提供核心 API 的 Mock 实现，包括 invoke 函数
 */

/**
 * SERIALIZE_TO_IPC_FN 符号 - 必须在类定义之前
 */
export const SERIALIZE_TO_IPC_FN = Symbol('SERIALIZE_TO_IPC_FN');

// 全局 invoke 处理器
let invokeHandler: ((cmd: string, args?: any) => any) | null = null;

/**
 * 设置 invoke 处理器
 */
export function setInvokeHandler(handler: (cmd: string, args?: any) => any) {
  invokeHandler = handler;
}

/**
 * transformCallback 函数 - Mock 实现
 */
export function transformCallback<T = unknown>(callback?: (response: T) => void, once?: boolean): number {
  return Date.now();
}

/**
 * invoke 函数 - 调用 Tauri 命令
 */
export async function invoke<T = any>(cmd: string, args?: any): Promise<T> {
  console.log('[tauri-mocks/core] invoke called:', cmd, 'hasHandler:', !!invokeHandler);

  if (invokeHandler) {
    return invokeHandler(cmd, args);
  }

  // 默认返回空对象
  return {} as T;
}

/**
 * convertFileSrc 函数 - 转换文件源路径
 */
export function convertFileSrc(filePath: string): string {
  return filePath;
}

/**
 * Channel 类 - Mock 实现
 */
export class Channel<T = unknown> {
  id: number;
  private cleanupCallback: (() => void) | null = null;
  private _onmessage: ((response: T) => void) | null = null;

  constructor(onmessage?: (response: T) => void) {
    this.id = transformCallback(onmessage);
    this._onmessage = onmessage || null;
  }

  set onmessage(handler: (response: T) => void) {
    this._onmessage = handler;
  }

  get onmessage(): (response: T) => void {
    return this._onmessage!;
  }

  [SERIALIZE_TO_IPC_FN](): string {
    return String(this.id);
  }

  toJSON(): string {
    return String(this.id);
  }
}

/**
 * Resource 类 - Mock 实现
 */
export class Resource {
  private _rid: number;

  constructor(rid: number) {
    this._rid = rid;
  }

  get rid(): number {
    return this._rid;
  }

  /**
   * Destroys and cleans up this resource from memory
   */
  async close(): Promise<void> {
    // Mock implementation - do nothing
  }

  [SERIALIZE_TO_IPC_FN](): string {
    return String(this._rid);
  }
}

// 其他导出（空实现）
export const PluginListener = Object.freeze({});
export function addPluginListener() {}
export const PermissionState = Object.freeze({});
export function checkPermissions() { return {}; }
export function requestPermissions() { return {}; }

/**
 * isTauri 函数 - Mock 实现
 */
export function isTauri(): boolean {
  return false;
}

/**
 * 其他可能的导出
 */
export const Command = Object.freeze({});

export const LinuxDesktopEnvironment = Object.freeze({});

export const Theme = Object.freeze({});
