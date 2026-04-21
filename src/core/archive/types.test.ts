/**
 * 归档类型定义测试
 *
 * TDD Step 1: 先写测试，定义我们想要的类型接口
 */

import { describe, it, expect } from 'vitest';

describe('ArchiveTypes - 基础类型定义', () => {
  describe('ArchiveFormat', () => {
    it('应该支持 JSON 格式', () => {
      const format: ArchiveFormat = 'json';
      expect(format).toBe('json');
    });

    it('应该支持 Markdown 格式', () => {
      const format: ArchiveFormat = 'markdown';
      expect(format).toBe('markdown');
    });

    it('应该支持 Parquet 格式', () => {
      const format: ArchiveFormat = 'parquet';
      expect(format).toBe('parquet');
    });

    it('应该列出所有支持的格式', () => {
      const formats: ArchiveFormat[] = ['json', 'markdown', 'parquet'];
      expect(formats).toHaveLength(3);
    });
  });

  describe('ArchiveData', () => {
    it('应该创建完整的归档数据', () => {
      const data: ArchiveData = {
        id: 'test-archive-1',
        timestamp: Date.now(),
        summary: 'Test conversation summary',
        originalMessages: [
          { role: 'user', content: 'Hello', timestamp: Date.now() },
          { role: 'assistant', content: 'Hi there!', timestamp: Date.now() }
        ],
        compactedMessages: [
          { role: 'user', content: 'Hello', timestamp: Date.now() },
          { role: 'assistant', content: 'Hi there!', timestamp: Date.now() }
        ]
      };

      expect(data.id).toBe('test-archive-1');
      expect(data.originalMessages).toHaveLength(2);
      expect(data.compactedMessages).toHaveLength(2);
    });

    it('应该计算压缩率', () => {
      const data: ArchiveData = {
        id: 'test-1',
        timestamp: Date.now(),
        summary: 'Summary',
        originalMessages: Array(100).fill(null).map((_, i) => ({
          role: 'user' as const,
          content: `Message ${i}`,
          timestamp: Date.now()
        })),
        compactedMessages: Array(10).fill(null).map((_, i) => ({
          role: 'user' as const,
          content: `Message ${i}`,
          timestamp: Date.now()
        }))
      };

      const originalLength = JSON.stringify(data.originalMessages).length;
      const compactedLength = JSON.stringify(data.compactedMessages).length;
      const ratio = ((originalLength - compactedLength) / originalLength) * 100;

      expect(ratio).toBeGreaterThan(80); // 至少压缩 80%
    });
  });

  describe('FormatOptions', () => {
    it('应该支持格式选项配置', () => {
      const options: FormatOptions = {
        formats: ['json', 'markdown'],
        compression: 'gzip',
        pretty: true
      };

      expect(options.formats).toContain('json');
      expect(options.compression).toBe('gzip');
      expect(options.pretty).toBe(true);
    });

    it('应该支持默认选项', () => {
      const options: FormatOptions = {};

      expect(options.formats).toBeUndefined();
      expect(options.compression).toBeUndefined();
    });
  });
});
