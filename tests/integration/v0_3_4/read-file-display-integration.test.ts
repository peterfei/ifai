/**
 * v0.3.4 集成测试: 读文件简洁显示
 */

import { describe, it, expect } from 'vitest';
import { formatToolResultToMarkdown } from '@/utils/toolResultFormatter';

describe('集成测试: 读文件简洁显示 (v0.3.4)', () => {

  describe('实际使用场景', () => {
    it('TypeScript 文件应该简洁显示', () => {
      const tsContent = `
import { useState } from 'react';
export function Component() {
  const [count, setCount] = useState(0);
  return <div>{count}</div>;
}
`.trim();

      const result = {
        path: '/src/components/Component.tsx',
        content: tsContent
      };
      const toolCall = { tool: 'agent_read_file', id: 'test-1' };

      const output = formatToolResultToMarkdown(result, toolCall);

      expect(output).toContain('已读取文件');
      expect(output).toContain('/src/components/Component.tsx');
      expect(output).toMatch(/\d+\s*行/);
      expect(output).not.toContain('useState'); // 不显示内容
    });

    it('大文件应该只显示统计信息', () => {
      const largeContent = Array.from({ length: 1000 }, (_, i) =>
        `const line${i} = 'content';`
      ).join('\n');

      const result = {
        path: '/src/large-file.ts',
        content: largeContent
      };
      const toolCall = { tool: 'agent_read_file', id: 'test-2' };

      const output = formatToolResultToMarkdown(result, toolCall);

      expect(output).toContain('1000 行');
      expect(output).not.toContain('const line0');
    });

    it('JSON 文件应该简洁显示', () => {
      const jsonContent = JSON.stringify({
        name: 'test',
        version: '1.0.0'
      }, null, 2);

      const result = {
        path: '/package.json',
        content: jsonContent
      };
      const toolCall = { tool: 'agent_read_file', id: 'test-3' };

      const output = formatToolResultToMarkdown(result, toolCall);

      expect(output).toContain('package.json');
      expect(output).not.toContain('name');
    });
  });

  describe('特殊路径处理', () => {
    it('应该处理特殊字符路径', () => {
      const result = {
        path: '/src/data [v2].ts',
        content: 'export const data = {};'
      };
      const toolCall = { tool: 'agent_read_file', id: 'test-4' };

      const output = formatToolResultToMarkdown(result, toolCall);

      expect(output).toContain('data [v2].ts');
    });

    it('应该处理深层嵌套路径', () => {
      const deepPath = '/src/modules/user/components/profile/Profile.tsx';
      const result = {
        path: deepPath,
        content: 'export function Profile() {}'
      };
      const toolCall = { tool: 'agent_read_file', id: 'test-5' };

      const output = formatToolResultToMarkdown(result, toolCall);

      expect(output).toContain(deepPath);
    });
  });

  describe('与其他工具区分', () => {
    it('读文件不应该与写入文件混淆', () => {
      const readResult = {
        path: '/test.ts',
        content: 'old content'
      };
      const writeResult = {
        filePath: '/test.ts',
        originalContent: 'old',
        newContent: 'new',
        success: true
      };

      const readOutput = formatToolResultToMarkdown(readResult, { tool: 'agent_read_file', id: 'test' });
      const writeOutput = formatToolResultToMarkdown(writeResult, { tool: 'agent_write_file', id: 'test' });

      expect(readOutput).toContain('已读取文件');
      expect(writeOutput).toContain('文件写入成功');
    });
  });

  describe('性能测试', () => {
    it('处理大文件应该快速（<10ms）', () => {
      const largeContent = 'x'.repeat(100000); // 100KB
      const result = {
        path: '/large.txt',
        content: largeContent
      };
      const toolCall = { tool: 'agent_read_file', id: 'test-perf' };

      const start = performance.now();
      const output = formatToolResultToMarkdown(result, toolCall);
      const duration = performance.now() - start;

      expect(output).toBeDefined();
      expect(duration).toBeLessThan(10);
    });
  });
});
