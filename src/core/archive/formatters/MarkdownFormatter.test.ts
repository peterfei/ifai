/**
 * Markdown 格式化器测试
 *
 * TDD: 先写测试，定义期望行为
 */

import { describe, it, expect } from 'vitest';
import { MarkdownFormatter } from './MarkdownFormatter';
import type { ArchiveData } from '../types';

describe('MarkdownFormatter', () => {
  const formatter = new MarkdownFormatter();

  describe('format - 序列化', () => {
    it('应该生成 GitHub 风格的 Markdown', async () => {
      const data: ArchiveData = {
        id: 'test-1',
        timestamp: 1234567890,
        summary: 'Test conversation',
        originalMessages: [
          { role: 'user', content: 'Hello', timestamp: 1234567890 },
          { role: 'assistant', content: 'Hi there!', timestamp: 1234567890 }
        ],
        compactedMessages: []
      };

      const result = await formatter.format(data, {});
      const markdown = new TextDecoder().decode(result);

      // 验证包含 frontmatter
      expect(markdown).toContain('---');
      expect(markdown).toContain('id: test-1');

      // 验证包含标题
      expect(markdown).toContain('# Conversation Archive');

      // 验证包含元数据
      expect(markdown).toContain('**Summary:** Test conversation');

      // 验证包含消息内容
      expect(markdown).toContain('👤 User');
      expect(markdown).toContain('🤖 Assistant');
      expect(markdown).toContain('Hello');
      expect(markdown).toContain('Hi there!');
    });

    it('应该包含统计信息', async () => {
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
      const markdown = new TextDecoder().decode(result);

      expect(markdown).toContain('## Metadata');
      expect(markdown).toContain('**Original Messages:** 10');
      expect(markdown).toContain('**Compacted Messages:** 2');
      expect(markdown).toContain('**Compression Ratio:**');
    });

    it('应该正确转义特殊字符', async () => {
      const data: ArchiveData = {
        id: 'test-1',
        timestamp: 1234567890,
        summary: 'Summary with **bold** and `code`',
        originalMessages: [
          {
            role: 'user',
            content: 'Message with ```code block``` and _italic_',
            timestamp: 1234567890
          }
        ],
        compactedMessages: []
      };

      const result = await formatter.format(data, {});
      const markdown = new TextDecoder().decode(result);

      // Markdown 应该被正确渲染
      expect(markdown).toContain('```');
    });

    it('应该处理空消息列表', async () => {
      const data: ArchiveData = {
        id: 'test-1',
        timestamp: 1234567890,
        summary: 'Empty conversation',
        originalMessages: [],
        compactedMessages: []
      };

      const result = await formatter.format(data, {});
      const markdown = new TextDecoder().decode(result);

      expect(markdown).toContain('# Conversation Archive');
      expect(markdown).toContain('**Original Messages:** 0');
    });

    it('应该支持系统消息', async () => {
      const data: ArchiveData = {
        id: 'test-1',
        timestamp: 1234567890,
        summary: 'Summary',
        originalMessages: [
          { role: 'system', content: 'System instruction', timestamp: 1234567890 }
        ],
        compactedMessages: []
      };

      const result = await formatter.format(data, {});
      const markdown = new TextDecoder().decode(result);

      expect(markdown).toContain('⚙️ System');
      expect(markdown).toContain('System instruction');
    });
  });

  describe('工具方法', () => {
    it('应该返回正确的 MIME 类型', () => {
      expect(formatter.getMimeType()).toBe('text/markdown');
    });

    it('应该返回正确的文件扩展名', () => {
      expect(formatter.getExtension()).toBe('.md');
    });
  });

  describe('格式特性', () => {
    it('应该生成 Git 友好的格式', async () => {
      const data: ArchiveData = {
        id: 'test-1',
        timestamp: 1234567890,
        summary: 'Summary',
        originalMessages: [
          { role: 'user', content: 'Line 1\nLine 2\nLine 3', timestamp: 1234567890 }
        ],
        compactedMessages: []
      };

      const result = await formatter.format(data, {});
      const markdown = new TextDecoder().decode(result);

      // 验证换行被正确处理
      expect(markdown).toContain('Line 1');
      expect(markdown).toContain('Line 2');
      expect(markdown).toContain('Line 3');
    });

    it('应该适合作为 LLM 输入', async () => {
      const data: ArchiveData = {
        id: 'test-1',
        timestamp: 1234567890,
        summary: 'AI conversation about coding',
        originalMessages: [
          { role: 'user', content: 'How do I write a test?', timestamp: 1234567890 },
          {
            role: 'assistant',
            content: 'Here\'s an example:\n```javascript\ntest("example", () => {\n  expect(true).toBe(true);\n});\n```',
            timestamp: 1234567890
          }
        ],
        compactedMessages: []
      };

      const result = await formatter.format(data, {});
      const markdown = new TextDecoder().decode(result);

      // 验证代码块格式
      expect(markdown).toContain('```');
      expect(markdown).toContain('```javascript');
    });
  });
});
