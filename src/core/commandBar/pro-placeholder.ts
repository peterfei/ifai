/**
 * 私有库占位模块
 *
 * 此文件仅用于让 Vite 能够解析 @ifai/core/commandBar 导入。
 * 实际运行时，bridge.ts 会尝试动态导入这个路径，失败后降级到 Mock。
 *
 * 这个文件不应该被直接使用，仅作为构建时的类型占位。
 */

/**
 * 此抛出错误确保：如果 Vite 意外地静态解析了这个导入，
 * 运行时会立即失败，从而触发 bridge.ts 的降级逻辑。
 */
export class CommandLineCore {
  constructor() {
    throw new Error(
      'CommandLineCore placeholder was instantiated directly. ' +
      'This should only be dynamically imported via bridge.ts, ' +
      'and the import should fail to trigger Mock fallback.'
    );
  }

  async initialize() {
    throw new Error('Not implemented');
  }

  async execute() {
    throw new Error('Not implemented');
  }

  async getSuggestions() {
    throw new Error('Not implemented');
  }

  dispose() {
    throw new Error('Not implemented');
  }
}
