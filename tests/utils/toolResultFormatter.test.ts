/**
 * 工具结果格式化器单元测试
 * 验证 JSON 结果转换为 Markdown 格式
 */

import { describe, test, expect } from 'vitest';
import { formatToolResultToMarkdown, extractToolSummary } from '../../src/utils/toolResultFormatter';

describe('Tool Result Formatter', () => {
  test('should format simple success result', () => {
    const result = {
      success: true,
      path: '/tmp/test.js',
      message: 'File created successfully',
    };

    const markdown = formatToolResultToMarkdown(result);

    expect(markdown).toContain('✅');
    expect(markdown).toContain('/tmp/test.js');
    expect(markdown).toContain('File created successfully');
  });

  test('should format result with multiple files', () => {
    const result = {
      success: true,
      paths: ['/tmp/a.js', '/tmp/b.js', '/tmp/c.js'],
      message: 'Created 3 files',
    };

    const markdown = formatToolResultToMarkdown(result);

    expect(markdown).toContain('/tmp/a.js');
    expect(markdown).toContain('/tmp/b.js');
    expect(markdown).toContain('/tmp/c.js');
    expect(markdown).toContain('3');
  });

  test('should format error result', () => {
    const result = {
      success: false,
      error: 'Permission denied',
      path: '/readonly/file.txt',
    };

    const markdown = formatToolResultToMarkdown(result);

    expect(markdown).toContain('❌');
    expect(markdown).toContain('Permission denied');
    expect(markdown).toContain('/readonly/file.txt');
  });

  test('should format command execution result', () => {
    const result = {
      command: 'npm install',
      stdout: 'Installed 123 packages',
      stderr: '',
      exitCode: 0,
    };

    const markdown = formatToolResultToMarkdown(result);

    expect(markdown).toContain('npm install');
    expect(markdown).toContain('Installed 123 packages');
    expect(markdown).toContain('✅');
    expect(markdown).toContain('0');
  });

  test('should format result with content preview', () => {
    const shortContent = 'console.log("Hello");';
    const result = {
      success: true,
      path: '/tmp/test.js',
      content: shortContent,
    };

    const markdown = formatToolResultToMarkdown(result);

    expect(markdown).toContain('console.log("Hello");');
  });

  test('should truncate long content', () => {
    const longContent = 'x'.repeat(300);
    const result = {
      success: true,
      path: '/tmp/large.js',
      content: longContent,
    };

    const markdown = formatToolResultToMarkdown(result);

    expect(markdown).toContain('...'); // 应该有截断标记
    expect(markdown).toContain('KB'); // 应该显示文件大小
  });

  test('should handle empty result', () => {
    const result = {};
    const markdown = formatToolResultToMarkdown(result);

    expect(markdown).toBeTruthy();
    expect(markdown.length).toBeGreaterThan(0);
  });

  test('should handle null result', () => {
    const markdown = formatToolResultToMarkdown(null);

    expect(markdown).toBe('');
  });

  test('should handle string result', () => {
    const result = 'Simple string result';
    const markdown = formatToolResultToMarkdown(result);

    expect(markdown).toBe('Simple string result');
  });

  test('should handle JSON string result', () => {
    const jsonStr = '{"success":true,"path":"/tmp/test.js"}';
    const markdown = formatToolResultToMarkdown(jsonStr);

    expect(markdown).toContain('/tmp/test.js');
  });

  test('should extract summary from file creation result', () => {
    const result = {
      success: true,
      path: '/tmp/demo.js',
    };

    const summary = extractToolSummary(result);

    expect(summary.filesCreated).toEqual(['/tmp/demo.js']);
    expect(summary.errors).toBeUndefined();
  });

  test('should extract summary from multiple files result', () => {
    const result = {
      success: true,
      paths: ['/tmp/a.js', '/tmp/b.js', '/tmp/c.js'],
    };

    const summary = extractToolSummary(result);

    expect(summary.filesCreated?.length).toBe(3);
    expect(summary.filesCreated).toContain('/tmp/a.js');
    expect(summary.filesCreated).toContain('/tmp/c.js');
  });

  test('should extract errors from failed result', () => {
    const result = {
      success: false,
      error: 'Permission denied',
    };

    const summary = extractToolSummary(result);

    expect(summary.errors).toEqual(['Permission denied']);
  });

  test('should count command executions', () => {
    const result = {
      command: 'npm test',
      exitCode: 0,
    };

    const summary = extractToolSummary(result);

    expect(summary.commandCount).toBe(1);
  });

  test.skip('should handle array results', () => {
    const result = ['/tmp/a.js', '/tmp/b.js', '/tmp/c.js'];
    const markdown = formatToolResultToMarkdown(result);

    expect(markdown).toContain('📁');
    expect(markdown).toContain('Generated Files');
    expect(markdown).toContain('/tmp/a.js');
  });

  test('should format complex nested result', () => {
    const result = {
      success: true,
      files: [
        { path: '/tmp/a.js', size: 1024 },
        { path: '/tmp/b.js', size: 2048 },
      ],
      totalCount: 2,
      message: 'Batch operation completed',
    };

    const markdown = formatToolResultToMarkdown(result);

    expect(markdown).toContain('✅');
    expect(markdown).toContain('Batch operation completed');
    expect(markdown).toContain('2'); // totalCount
  });
});
