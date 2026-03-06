/**
 * Tauri API Mock - @tauri-apps/api/core
 *
 * 提供核心 API 的 Mock 实现，包括 invoke 函数
 */

// 🔥 调试：确认模块被加载
console.log('[tauri-mocks/core] Module loaded');

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

// 🔥 暴露到 window 对象以便 E2E 测试可以访问
if (typeof window !== 'undefined') {
  (window as any).__tauriSetInvokeHandler__ = setInvokeHandler;
  console.log('[tauri-mocks/core] __tauriSetInvokeHandler__ exposed to window');
} else {
  console.log('[tauri-mocks/core] window is undefined, skipping exposure');
}

// 🔥 如果 window 上有 __E2E_REAL_AI_CONFIG__，说明是 E2E 测试环境
// 需要延迟注册 handler，因为 setup-utils 可能在模块加载之后执行
if (typeof window !== 'undefined') {
  setTimeout(() => {
    const config = (window as any).__E2E_REAL_AI_CONFIG__;
    if (config && config.useRealAI) {
      console.log('[tauri-mocks/core] Detected E2E Real AI mode, checking for invoke handler...');
      // 等待 setup-utils 设置 handler
      setTimeout(() => {
        const handler = (window as any).__E2E_INVOKE_HANDLER__;
        if (handler && invokeHandler !== handler) {
          invokeHandler = handler;
          console.log('[tauri-mocks/core] ✅ E2E invoke handler registered from __E2E_INVOKE_HANDLER__');
        }
      }, 200);
    }
  }, 100);
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
  console.log('[tauri-mocks/core] 📞 invoke called:', cmd, 'args:', args ? Object.keys(args) : 'none');
  console.log('[tauri-mocks/core] hasHandler:', !!invokeHandler);
  console.log('[tauri-mocks/core] hasE2EHandler:', !!(window as any).__E2E_INVOKE_HANDLER__);
  console.log('[tauri-mocks/core] hasTauriInternals:', !!(window as any).__TAURI_INTERNALS__);
  console.log('[tauri-mocks/core] hasWindowTauriCoreInvoke:', !!(window as any).__TAURI__?.core?.invoke);

  const handler = (window as any).__E2E_INVOKE_HANDLER__;

  // 🏆 PIVO 3.0: 高保真探测模拟
  if (cmd === 'probe_symbols') {
    if (handler) {
      // 尝试从 E2E 环境获取文件的 Mock 内容并提取符号
      try {
        const content = await handler('agent_read_file', { rel_path: args.path });
        if (content && typeof content === 'string') {
          return mockExtractSymbols(content) as any;
        }
      } catch (e) {}
    }
    // 默认返回基础符号（针对 settingsStore 等核心文件）
    if (args.path?.includes('settingsStore')) {
      return [
        { name: 'SettingsState', kind: 'interface', line: 50, context: 'export interface SettingsState' },
        { name: 'useSettingsStore', kind: 'variable', line: 150, context: 'export const useSettingsStore = ...' }
      ] as any;
    }
    return [] as any;
  }

  if (cmd === 'get_file_metadata') {
    return { size: 1024, mtime: Date.now(), fingerprint: `mock_${Date.now()}` } as any;
  }

  if (invokeHandler) {
    console.log('[tauri-mocks/core] ✅ Using invokeHandler');
    return invokeHandler(cmd, args);
  }

  // 🔥 FIX: Fall back to window.__TAURI__.core.invoke if available
  const windowTauriInvoke = (window as any).__TAURI__?.core?.invoke;
  if (windowTauriInvoke) {
    console.log('[tauri-mocks/core] ✅ Using window.__TAURI__.core.invoke as fallback');
    return windowTauriInvoke(cmd, args);
  }

  if (handler) return handler(cmd, args);

  // 默认兜底
  if (cmd.includes('get_config')) return { providers: [] } as any;
  if (cmd === 'get_git_statuses') return [] as any;

  console.warn('[tauri-mocks/core] ⚠️ No invokeHandler and no window.__TAURI__.core.invoke, returning empty object');
  // 默认返回空对象
  return {} as T;
}

/**
 * 🏆 PIVO 3.0: JS 版高保真符号提取器 (仅用于 Mock)
 */
function mockExtractSymbols(content: string): any[] {
  const lines = content.split('\n');
  const symbols: any[] = [];
  const patterns = [
    { type: 'class', regex: /(?:export\s+)?class\s+([a-zA-Z0-9_]+)/ },
    { type: 'function', regex: /(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z0-9_]+)/ },
    { type: 'interface', regex: /(?:export\s+)?interface\s+([a-zA-Z0-9_]+)/ },
    { type: 'variable', regex: /export\s+(?:const|let)\s+([a-zA-Z0-9_]+)/ }
  ];

  lines.forEach((line, i) => {
    const trimmed = line.trim();
    for (const p of patterns) {
      const match = trimmed.match(p.regex);
      if (match) {
        symbols.push({
          name: match[1],
          kind: p.type,
          line: i + 1,
          context: trimmed
        });
        break;
      }
    }
  });
  return symbols;
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
