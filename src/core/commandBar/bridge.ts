/**
 * 命令行核心桥接器
 *
 * 负责动态探测并加载私有库或 Mock 实现。
 * 采用运行时动态加载策略，支持开发时热切换。
 */

import type {
  ICommandLineCore,
  ICommandDiagnostics,
} from './types';

/**
 * 检查是否为商业版
 */
const isCommercial = () => {
  // import.meta.env 是 Vite 提供的环境变量
  const mode = (import.meta as any).env?.MODE;
  const edition = (import.meta as any).env?.APP_EDITION;
  const isE2E = (import.meta as any).env?.VITE_TEST_ENV === 'e2e';
  // E2E 环境强制使用社区模式
  return (mode === 'commercial' || edition === 'commercial') && !isE2E;
};

/**
 * 桥接器单例类
 */
class CommandBridge {
  private static instance: ICommandLineCore | null = null;
  private static coreType: 'mock' | 'pro' | null = null;
  private static loadStartTime = 0;
  private static loadError: Error | null = null;

  /**
   * 获取命令行核心实例（单例）
   *
   * 首次调用时探测并加载核心逻辑，后续返回缓存的实例。
   * 探测失败时自动降级到 Mock 实现。
   */
  static async getInstance(): Promise<ICommandLineCore> {
    if (this.instance) {
      return this.instance;
    }

    this.loadStartTime = performance.now();

    // 社区版直接使用 Mock 实现
    if (!isCommercial()) {
      const { MockCommandLineCore } = await import('./mock');
      this.instance = new MockCommandLineCore();
      this.coreType = 'mock';
      console.info('[CommandBar] Running in Community mode (Mock)');
    } else {
      // 商业版尝试加载私有库
      try {
        // 尝试动态导入私有库
        // @ts-ignore - Vite alias 会在构建时解析此路径
        const module = await import('@ifai/core/commandBar');
        const { CommandLineCore } = module;

        // 验证导出的接口
        if (typeof CommandLineCore !== 'function') {
          throw new Error('Invalid core module: CommandLineCore export is not a constructor');
        }

        // 尝试实例化并初始化
        const instance = new CommandLineCore();
        await instance.initialize();

        // 验证实例是否正常工作（execute 方法应该能被调用）
        try {
          await instance.getSuggestions('');
        } catch (e) {
          throw new Error(`Core initialization failed: ${e}`);
        }

        this.instance = instance;
        this.coreType = 'pro';
        console.info(
          `[CommandBar] Running in Pro mode (load time: ${performance.now() - this.loadStartTime}ms)`
        );
      } catch (error) {
        // 降级到 Mock 实现
        this.loadError = error instanceof Error ? error : new Error(String(error));
        const { MockCommandLineCore } = await import('./mock');
        this.instance = new MockCommandLineCore();
        this.coreType = 'mock';

        console.warn(
          `[CommandBar] Private core not available, running in Community mode (${this.loadError.message})`
        );
      }
    }

    // 初始化核心（对于 Mock 实现也需要初始化）
    if (this.coreType === 'mock') {
      try {
        await this.instance.initialize();
      } catch (error) {
        console.error('[CommandBar] Initialization failed:', error);
      }
    }

    return this.instance;
  }

  /**
   * 获取诊断信息
   *
   * 返回当前加载的核心类型、版本、加载时间等信息。
   */
  static getDiagnostics(): ICommandDiagnostics {
    const coreDiagnostics = this.instance?.getDiagnostics?.();

    return {
      type: this.coreType || 'mock',
      version: coreDiagnostics?.version || 'unknown',
      loadTime: this.loadStartTime > 0 ? performance.now() - this.loadStartTime : 0,
      initialized: coreDiagnostics?.initialized ?? false,
    };
  }

  /**
   * 获取加载错误信息（如果有）
   */
  static getLoadError(): Error | null {
    return this.loadError;
  }

  /**
   * 重置桥接器（主要用于测试）
   *
   * 注意：生产代码不应调用此方法
   */
  static reset(): void {
    if (this.instance) {
      try {
        this.instance.dispose();
      } catch {
        // 忽略 dispose 错误
      }
    }
    this.instance = null;
    this.coreType = null;
    this.loadStartTime = 0;
    this.loadError = null;
  }

  /**
   * 检查当前是否使用 Mock 实现
   */
  static isMock(): boolean {
    return this.coreType === 'mock';
  }

  /**
   * 检查当前是否使用 Pro 版本
   */
  static isPro(): boolean {
    return this.coreType === 'pro';
  }
}

/**
 * 导出便捷函数
 */

/**
 * 获取命令行核心实例
 */
export async function getCommandLineCore(): Promise<ICommandLineCore> {
  return CommandBridge.getInstance();
}

/**
 * 获取诊断信息
 */
export function getCommandLineDiagnostics(): ICommandDiagnostics {
  return CommandBridge.getDiagnostics();
}

/**
 * 检查是否使用 Mock 实现
 */
export function isMockMode(): boolean {
  return CommandBridge.isMock();
}

/**
 * 检查是否使用 Pro 版本
 */
export function isProMode(): boolean {
  return CommandBridge.isPro();
}

/**
 * 重置桥接器（仅用于测试）
 */
export function resetBridge(): void {
  CommandBridge.reset();
}

// 导出类以供测试使用
export { CommandBridge };
