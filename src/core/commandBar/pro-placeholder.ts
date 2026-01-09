/**
 * 私有库占位模块
 *
 * 此文件用于让 Vite 能够解析 @ifai/core/commandBar 导入。
 * 在社区版/E2E 测试环境中，此模块可以被成功加载，
 * 但调用任何方法都会抛出错误，触发 bridge.ts 的降级逻辑。
 */
export class CommandLineCore {
  private initialized = false;

  async initialize() {
    // 不立即抛出错误，让模块可以被加载
    // 实际运行时 bridge.ts 会检测错误并降级到 Mock
    this.initialized = true;
  }

  async execute() {
    throw new Error(
      'CommandLineCore is a placeholder. ' +
      'This should trigger Mock fallback in bridge.ts.'
    );
  }

  async getSuggestions() {
    throw new Error('Not implemented - use Mock fallback');
  }

  dispose() {
    // 静默释放，避免错误
  }

  getDiagnostics() {
    return {
      type: 'placeholder' as const,
      version: '0.0.0-placeholder',
      loadTime: 0,
      initialized: this.initialized,
    };
  }
}
