/**
 * toolResultFormatter 测试
 * 测试各种类型的结果格式化，防止类型错误导致黑屏
 */

import { describe, it, expect } from 'vitest';
import { formatToolResultToMarkdown } from '@/utils/toolResultFormatter';

describe('toolResultFormatter - 防止类型错误导致黑屏', () => {

  describe('数组类型处理', () => {
    it('应该正确处理字符串数组', () => {
      const result = ['file1.ts', 'file2.ts', 'src/index.ts'];
      const output = formatToolResultToMarkdown(result);

      expect(output).toContain('📁');
      expect(output).toContain('file1.ts');
      expect(output).toContain('(3)');
    });

    it('应该正确处理数字数组（不应报错）', () => {
      const result = [1, 2, 3, 4, 5];
      // 这不应该抛出 "item.includes is not a function" 错误
      expect(() => formatToolResultToMarkdown(result)).not.toThrow();
      const output = formatToolResultToMarkdown(result);

      expect(output).toBeDefined();
      expect(typeof output).toBe('string');
    });

    it('应该正确处理混合类型数组（不应报错）', () => {
      const result = ['string', 123, { key: 'value' }, true, null];
      // 这不应该抛出 "item.includes is not a function" 错误
      expect(() => formatToolResultToMarkdown(result)).not.toThrow();
      const output = formatToolResultToMarkdown(result);

      expect(output).toBeDefined();
      expect(typeof output).toBe('string');
      expect(output).toContain('json');
    });

    it('应该正确处理对象数组（不应报错）', () => {
      const result = [{ name: 'file1' }, { name: 'file2' }];
      // 这不应该抛出 "item.includes is not a function" 错误
      expect(() => formatToolResultToMarkdown(result)).not.toThrow();
      const output = formatToolResultToMarkdown(result);

      expect(output).toBeDefined();
      expect(typeof output).toBe('string');
    });

    it('应该正确处理空数组', () => {
      const result = [];
      const output = formatToolResultToMarkdown(result);

      expect(output).toContain('No results');
    });
  });

  describe('字符数组检测', () => {
    it('应该检测并拼接字符数组', () => {
      // 模拟 ifainew_core::agent::agent_read_file 的 bug
      // 返回的是字符数组而不是完整字符串
      const charArray = ['H', 'e', 'l', 'l', 'o', ' ', 'W', 'o', 'r', 'l', 'd'];
      const output = formatToolResultToMarkdown(charArray);

      expect(output).toContain('Hello World');
    });

    it('应该处理包含特殊字符的字符数组', () => {
      const charArray = ['{', '"', 'k', 'e', 'y', '"', ':', '"', 'v', 'a', 'l', 'u', 'e', '"', '}'];
      const output = formatToolResultToMarkdown(charArray);

      // 应该检测到这是 JSON 格式
      expect(output).toContain('key');
      expect(output).toContain('value');
    });
  });

  describe('命令执行结果', () => {
    it('应该正确处理成功的命令执行', () => {
      const result = {
        command: 'ls -la',
        stdout: 'file1.ts\nfile2.ts',
        stderr: '',
        exitCode: 0,
        success: true
      };
      const output = formatToolResultToMarkdown(result);

      expect(output).toContain('✅');
      expect(output).toContain('ls -la');
      expect(output).toContain('file1.ts');
    });

    it('应该正确处理失败的命令执行', () => {
      const result = {
        command: 'invalid-command',
        stdout: '',
        stderr: 'command not found',
        exitCode: 127,
        success: false
      };
      const output = formatToolResultToMarkdown(result);

      expect(output).toContain('❌');
      expect(output).toContain('command not found');
    });
  });

  describe('文件写入结果', () => {
    it('应该正确处理文件写入成功', () => {
      const result = {
        filePath: '/test/file.ts',
        success: true,
        message: 'File written successfully'
      };
      const output = formatToolResultToMarkdown(result);

      expect(output).toContain('✅');
      expect(output).toContain('/test/file.ts');
      expect(output).toContain('File written successfully');
    });

    it('应该正确处理新建文件', () => {
      const result = {
        filePath: '/test/new-file.ts',
        success: true,
        originalContent: '',
        newContent: 'console.log("Hello");'
      };
      const output = formatToolResultToMarkdown(result);

      expect(output).toContain('新建文件');
      expect(output).toContain('new-file.ts');
    });

    it('应该正确处理覆盖文件', () => {
      const result = {
        filePath: '/test/existing.ts',
        success: true,
        originalContent: 'old content',
        newContent: 'new content'
      };
      const output = formatToolResultToMarkdown(result);

      expect(output).toContain('覆盖已有文件');
      expect(output).toContain('变更统计');
    });
  });

  describe('边界情况', () => {
    it('应该正确处理 null', () => {
      const output = formatToolResultToMarkdown(null);
      expect(output).toBe('');
    });

    it('应该正确处理 undefined', () => {
      const output = formatToolResultToMarkdown(undefined);
      expect(output).toBe('');
    });

    it('应该正确处理空对象', () => {
      const result = {};
      const output = formatToolResultToMarkdown(result);

      expect(output).toBeDefined();
      expect(typeof output).toBe('string');
    });

    it('应该正确处理纯字符串', () => {
      const result = 'Just a plain string';
      const output = formatToolResultToMarkdown(result);

      expect(output).toContain('Just a plain string');
    });

    it('应该正确处理 JSON 字符串', () => {
      const result = '{"key": "value", "number": 123}';
      const output = formatToolResultToMarkdown(result);

      expect(output).toContain('key');
      expect(output).toContain('value');
    });

    it('应该正确处理无效 JSON 字符串', () => {
      const result = 'Not a valid JSON {but with braces}';
      const output = formatToolResultToMarkdown(result);

      expect(output).toContain('Not a valid JSON');
    });
  });
});
