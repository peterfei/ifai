/**
 * JSON 格式化器
 *
 * 将 ArchiveData 序列化为 JSON 格式
 * 机器可读优先，支持结构化查询和索引
 */

import type { Formatter, ArchiveData, FormatOptions } from '../types';

export class JSONFormatter implements Formatter {
  /**
   * 序列化为 JSON
   */
  async format(data: ArchiveData, options: FormatOptions = {}): Promise<Uint8Array> {
    // 计算派生字段
    const messageCount = data.originalMessages.length;
    const originalSize = JSON.stringify(data.originalMessages).length;
    const compactedSize = JSON.stringify(data.compactedMessages).length;
    const compressionRatio = originalSize > 0
      ? ((originalSize - compactedSize) / originalSize) * 100
      : 0;

    // 构建输出对象
    const output = {
      // 核心数据
      ...data,

      // 计算字段
      messageCount,
      compressionRatio: Math.round(compressionRatio * 100) / 100,

      // 自定义元数据
      ...(options.metadata && { metadata: options.metadata })
    };

    // 序列化
    const jsonString = options.pretty
      ? JSON.stringify(output, null, 2)
      : JSON.stringify(output);

    return new TextEncoder().encode(jsonString);
  }

  /**
   * 从 JSON 反序列化
   */
  async parse(input: Uint8Array): Promise<ArchiveData> {
    const jsonString = new TextDecoder().decode(input);
    const parsed = JSON.parse(jsonString);

    // 验证必需字段
    this.validate(parsed);

    // 返回核心数据（忽略计算字段）
    return {
      id: parsed.id,
      timestamp: parsed.timestamp,
      summary: parsed.summary,
      originalMessages: parsed.originalMessages,
      compactedMessages: parsed.compactedMessages
    };
  }

  /**
   * 验证数据完整性
   */
  private validate(data: any): asserts data is ArchiveData {
    if (typeof data !== 'object' || data === null) {
      throw new Error('Invalid JSON: not an object');
    }

    const requiredFields = ['id', 'timestamp', 'summary', 'originalMessages', 'compactedMessages'];
    for (const field of requiredFields) {
      if (!(field in data)) {
        throw new Error(`Invalid JSON: missing required field '${field}'`);
      }
    }

    if (!Array.isArray(data.originalMessages)) {
      throw new Error('Invalid JSON: originalMessages is not an array');
    }

    if (!Array.isArray(data.compactedMessages)) {
      throw new Error('Invalid JSON: compactedMessages is not an array');
    }
  }

  getMimeType(): string {
    return 'application/json';
  }

  getExtension(): string {
    return '.json';
  }
}
