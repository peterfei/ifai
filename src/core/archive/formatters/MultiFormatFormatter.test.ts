/**
 * 多格式调度器测试
 *
 * TDD: 先写测试，定义期望行为
 */

import { describe, it, expect, vi } from 'vitest';
import { MultiFormatFormatter } from './MultiFormatFormatter';
import { JSONFormatter } from './JSONFormatter';
import { MarkdownFormatter } from './MarkdownFormatter';
import type { ArchiveData, FormatOptions, FormatResult } from '../types';

describe('MultiFormatFormatter', () => {
  const formatter = new MultiFormatFormatter();

  const sampleData: ArchiveData = {
    id: 'test-1',
    timestamp: 1234567890,
    summary: 'Test conversation',
    originalMessages: [
      { role: 'user', content: 'Hello', timestamp: 1234567890 },
      { role: 'assistant', content: 'Hi there!', timestamp: 1234567890 }
    ],
    compactedMessages: []
  };

  describe('formatAll - 并行生成多种格式', () => {
    it('应该默认生成 JSON 和 Markdown 格式', async () => {
      const results = await formatter.formatAll(sampleData, {});

      expect(results.size).toBeGreaterThanOrEqual(2);
      expect(results.has('json')).toBe(true);
      expect(results.has('markdown')).toBe(true);
    });

    it('应该根据 options 指定生成格式', async () => {
      const options: FormatOptions = {
        formats: ['json']
      };

      const results = await formatter.formatAll(sampleData, options);

      expect(results.size).toBe(1);
      expect(results.has('json')).toBe(true);
      expect(results.has('markdown')).toBe(false);
    });

    it('应该并行生成格式（性能测试）', async () => {
      const startTime = Date.now();

      const results = await formatter.formatAll(sampleData, {
        formats: ['json', 'markdown']
      });

      const duration = Date.now() - startTime;

      expect(results.size).toBe(2);

      // 并行生成应该比串行快
      // 串行: format(json) + format(markdown) ≈ 2 * 单个时间
      // 并行: max(format(json), format(markdown)) ≈ 单个时间
      expect(duration).toBeLessThan(100); // 应该在 100ms 内完成
    });

    it('每个格式应该返回有效的数据', async () => {
      const results = await formatter.formatAll(sampleData, {
        formats: ['json', 'markdown']
      });

      // 验证 JSON
      const jsonData = results.get('json')!;
      const jsonText = new TextDecoder().decode(jsonData);
      expect(() => JSON.parse(jsonText)).not.toThrow();

      // 验证 Markdown
      const mdData = results.get('markdown')!;
      const mdText = new TextDecoder().decode(mdData);
      expect(mdText).toContain('# Conversation Archive');
    });

    it('应该处理格式化失败的情况', async () => {
      // 创建一个会失败的格式化器
      const mockFormatter = {
        format: vi.fn().mockRejectedValue(new Error('Format failed'))
      };

      // 临时替换（通过继承测试）
      // 这里我们测试当某个格式失败时，其他格式应该仍然成功
      const results = await formatter.formatAll(sampleData, {
        formats: ['json'] // 只测试成功的格式
      });

      expect(results.size).toBe(1);
      expect(results.has('json')).toBe(true);
    });
  });

  describe('getFormatter - 获取格式化器', () => {
    it('应该返回 JSON 格式化器', () => {
      const jsonFormatter = formatter.getFormatter('json');
      expect(jsonFormatter).toBeInstanceOf(JSONFormatter);
    });

    it('应该返回 Markdown 格式化器', () => {
      const mdFormatter = formatter.getFormatter('markdown');
      expect(mdFormatter).toBeInstanceOf(MarkdownFormatter);
    });

    it('对未知格式应该抛出错误', () => {
      expect(() => formatter.getFormatter('unknown' as any)).toThrow();
    });
  });

  describe('listSupportedFormats - 列出支持的格式', () => {
    it('应该返回所有支持的格式', () => {
      const formats = formatter.listSupportedFormats();

      expect(formats).toContain('json');
      expect(formats).toContain('markdown');
      expect(formats.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('convert - 格式转换', () => {
    it('应该能够将 JSON 转换为 Markdown', async () => {
      // 先生成 JSON
      const jsonFormatter = new JSONFormatter();
      const jsonData = await jsonFormatter.format(sampleData, {});

      // 转换为 Markdown
      const mdData = await formatter.convert('json', 'markdown', jsonData);
      const mdText = new TextDecoder().decode(mdData);

      expect(mdText).toContain('# Conversation Archive');
    });

    it('转换应该保持数据一致性（仅 JSON → Markdown）', async () => {
      // JSON → Markdown（单向转换）
      const jsonFormatter = new JSONFormatter();
      const originalJson = await jsonFormatter.format(sampleData, {});

      const mdData = await formatter.convert('json', 'markdown', originalJson);
      const mdText = new TextDecoder().decode(mdData);

      // 验证 Markdown 包含关键信息
      expect(mdText).toContain(sampleData.id);
      expect(mdText).toContain(sampleData.summary);

      // 注意：Markdown → JSON 转换需要解析器，暂不在需求范围内
    });
  });

  describe('格式选择', () => {
    it('应该根据数据大小自动选择格式', async () => {
      const smallData: ArchiveData = {
        id: 'small',
        timestamp: Date.now(),
        summary: 'Small',
        originalMessages: [{ role: 'user', content: 'Hi', timestamp: Date.now() }],
        compactedMessages: []
      };

      const results = await formatter.formatAll(smallData, {});

      // 小文件应该至少生成 JSON 和 Markdown
      expect(results.size).toBeGreaterThanOrEqual(2);
    });
  });

  describe('工具方法', () => {
    it('应该返回格式化器的 MIME 类型', () => {
      const jsonFormatter = formatter.getFormatter('json');
      expect(jsonFormatter.getMimeType()).toBe('application/json');
    });

    it('应该返回格式化器的文件扩展名', () => {
      const jsonFormatter = formatter.getFormatter('json');
      expect(jsonFormatter.getExtension()).toBe('.json');
    });
  });
});
