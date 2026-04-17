/**
 * JSON 格式化器测试
 *
 * TDD: 先写测试，定义期望行为
 */

import { describe, it, expect } from 'vitest';
import { JSONFormatter } from './JSONFormatter';
import type { ArchiveData, FormatOptions } from '../types';

describe('JSONFormatter', () => {
  const formatter = new JSONFormatter();

  describe('format - 序列化', () => {
    it('应该将 ArchiveData 序列化为 JSON', async () => {
      const data: ArchiveData = {
        id: 'test-1',
        timestamp: 1234567890,
        summary: 'Test summary',
        originalMessages: [
          { role: 'user', content: 'Hello', timestamp: 1234567890 }
        ],
        compactedMessages: []
      };

      const result = await formatter.format(data, {});

      // 验证是有效的 JSON
      const json = new TextDecoder().decode(result);
      const parsed = JSON.parse(json);

      expect(parsed.id).toBe('test-1');
      expect(parsed.summary).toBe('Test summary');
      expect(parsed.originalMessages).toHaveLength(1);
    });

    it('应该支持美化输出（pretty=true）', async () => {
      const data: ArchiveData = {
        id: 'test-1',
        timestamp: 1234567890,
        summary: 'Summary',
        originalMessages: [],
        compactedMessages: []
      };

      const prettyResult = await formatter.format(data, { pretty: true });
      const compactResult = await formatter.format(data, { pretty: false });

      // 美化版本应该更长
      expect(prettyResult.length).toBeGreaterThan(compactResult.length);

      // 美化版本应该包含缩进
      const prettyJson = new TextDecoder().decode(prettyResult);
      expect(prettyJson).toContain('\n');
      expect(prettyJson).toContain('  ');
    });

    it('应该包含计算字段（messageCount, compressionRatio）', async () => {
      const data: ArchiveData = {
        id: 'test-1',
        timestamp: 1234567890,
        summary: 'Summary',
        originalMessages: Array(10).fill(null).map((_, i) => ({
          role: 'user' as const,
          content: `Message ${i}`,
          timestamp: 1234567890
        })),
        compactedMessages: Array(2).fill(null).map((_, i) => ({
          role: 'user' as const,
          content: `Message ${i}`,
          timestamp: 1234567890
        }))
      };

      const result = await formatter.format(data, {});
      const json = new TextDecoder().decode(result);
      const parsed = JSON.parse(json);

      expect(parsed.messageCount).toBeDefined();
      expect(parsed.messageCount).toBe(10);
      expect(parsed.compressionRatio).toBeDefined();
      expect(parsed.compressionRatio).toBeGreaterThan(0);
    });

    it('应该支持自定义元数据', async () => {
      const data: ArchiveData = {
        id: 'test-1',
        timestamp: 1234567890,
        summary: 'Summary',
        originalMessages: [],
        compactedMessages: []
      };

      const result = await formatter.format(data, {
        metadata: { version: '1.0.0', environment: 'test' }
      });

      const json = new TextDecoder().decode(result);
      const parsed = JSON.parse(json);

      expect(parsed.metadata).toBeDefined();
      expect(parsed.metadata.version).toBe('1.0.0');
      expect(parsed.metadata.environment).toBe('test');
    });
  });

  describe('parse - 反序列化', () => {
    it('应该将 JSON 解析为 ArchiveData', async () => {
      const data: ArchiveData = {
        id: 'test-1',
        timestamp: 1234567890,
        summary: 'Summary',
        originalMessages: [
          { role: 'user', content: 'Hello', timestamp: 1234567890 }
        ],
        compactedMessages: []
      };

      // 序列化
      const serialized = await formatter.format(data, {});

      // 反序列化
      const parsed = await formatter.parse(serialized);

      expect(parsed.id).toBe(data.id);
      expect(parsed.timestamp).toBe(data.timestamp);
      expect(parsed.summary).toBe(data.summary);
      expect(parsed.originalMessages).toHaveLength(1);
      expect(parsed.originalMessages[0].content).toBe('Hello');
    });

    it('应该处理美化后的 JSON', async () => {
      const data: ArchiveData = {
        id: 'test-1',
        timestamp: 1234567890,
        summary: 'Summary',
        originalMessages: [],
        compactedMessages: []
      };

      const prettySerialized = await formatter.format(data, { pretty: true });
      const parsed = await formatter.parse(prettySerialized);

      expect(parsed.id).toBe('test-1');
    });
  });

  describe('工具方法', () => {
    it('应该返回正确的 MIME 类型', () => {
      expect(formatter.getMimeType()).toBe('application/json');
    });

    it('应该返回正确的文件扩展名', () => {
      expect(formatter.getExtension()).toBe('.json');
    });
  });

  describe('错误处理', () => {
    it('应该拒绝无效的 JSON', async () => {
      const invalidJson = new TextEncoder().encode('invalid json {{{');

      await expect(formatter.parse(invalidJson)).rejects.toThrow();
    });

    it('应该拒绝缺少必需字段的 JSON', async () => {
      const incomplete = new TextEncoder().encode(
        JSON.stringify({ id: 'test-1' }) // 缺少其他必需字段
      );

      await expect(formatter.parse(incomplete)).rejects.toThrow();
    });
  });
});
