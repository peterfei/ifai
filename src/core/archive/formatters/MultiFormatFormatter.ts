/**
 * 多格式调度器
 *
 * 核心功能：
 * - 并行生成多种格式
 * - 格式转换管道
 * - 格式化器注册表
 */

import type { Formatter, ArchiveData, FormatOptions, ArchiveFormat } from '../types';
import { JSONFormatter } from './JSONFormatter';
import { MarkdownFormatter } from './MarkdownFormatter';

export class MultiFormatFormatter {
  private formatters = new Map<ArchiveFormat, Formatter>();

  constructor() {
    // 🪝 自动注册所有格式化器
    this.registerFormatter('json', new JSONFormatter());
    this.registerFormatter('markdown', new MarkdownFormatter());
    // Parquet 暂不实现（需要额外依赖）
  }

  /**
   * 注册格式化器
   */
  private registerFormatter(format: ArchiveFormat, formatter: Formatter): void {
    this.formatters.set(format, formatter);
  }

  /**
   * 获取格式化器
   */
  getFormatter(format: ArchiveFormat): Formatter {
    const formatter = this.formatters.get(format);
    if (!formatter) {
      throw new Error(`Unknown format: ${format}`);
    }
    return formatter;
  }

  /**
   * 并行生成所有格式
   *
   * @returns Map<format, output>
   */
  async formatAll(
    data: ArchiveData,
    options: FormatOptions = {}
  ): Promise<Map<ArchiveFormat, Uint8Array>> {
    const formats = options.formats || this.getDefaultFormats();
    const results = new Map<ArchiveFormat, Uint8Array>();

    // 🪝 并行序列化
    const tasks = formats.map(format => ({
      format,
      promise: this.getFormatter(format).format(data, options)
    }));

    // 等待所有格式完成
    const settled = await Promise.allSettled(
      tasks.map(t => t.promise)
    );

    // 收集成功结果
    tasks.forEach((task, index) => {
      if (settled[index].status === 'fulfilled') {
        results.set(task.format, settled[index].value);
      } else {
        console.error(`[Archive] Format ${task.format} failed:`, settled[index].reason);
      }
    });

    return results;
  }

  /**
   * 格式转换管道
   *
   * 示例：JSON → Markdown（用于生成 PR 描述）
   */
  async convert(
    from: ArchiveFormat,
    to: ArchiveFormat,
    input: Uint8Array
  ): Promise<Uint8Array> {
    // 🪝 先反序列化，再序列化
    const fromFormatter = this.getFormatter(from);
    const toFormatter = this.getFormatter(to);

    const data = await fromFormatter.parse(input);
    return toFormatter.format(data, {});
  }

  /**
   * 获取默认格式列表
   */
  private getDefaultFormats(): ArchiveFormat[] {
    // 默认生成 JSON 和 Markdown（Parquet 需要额外依赖）
    return ['json', 'markdown'];
  }

  /**
   * 列出所有支持的格式
   */
  listSupportedFormats(): ArchiveFormat[] {
    return Array.from(this.formatters.keys());
  }

  /**
   * 根据用途获取最佳格式
   */
  getBestFormatFor(purpose: 'machine' | 'human' | 'analytics'): ArchiveFormat {
    switch (purpose) {
      case 'machine':
        return 'json';
      case 'human':
        return 'markdown';
      case 'analytics':
        return 'json'; // 暂时返回 JSON，未来返回 Parquet
      default:
        return 'json';
    }
  }
}
