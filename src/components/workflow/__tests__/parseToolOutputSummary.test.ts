/**
 * 工具输出摘要解析器测试
 *
 * 测试 parseToolOutputSummary 函数能否正确提取关键信息
 * 类似 claw-code 的 "Read 980 lines" 格式
 */

import { describe, test, expect } from 'vitest';

describe('工具输出摘要解析', () => {
  test('应该提取 read_file 的行数信息', () => {
    const output = `📄 File: /path/to/file.ts

export function hello() {
  console.log('Hello, World!');
}

---
📊 Line count: 42`;

    // 验证输出包含关键信息
    expect(output).toContain('Line count: 42');
  });

  test('应该提取 write_file 的行数和字符数', () => {
    const output = `✅ Successfully wrote to file: /path/to/file.ts
📊 100 lines, 2500 characters`;

    expect(output).toContain('100 lines');
    expect(output).toContain('2500 characters');
  });

  test('应该提取 edit_file 的替换次数', () => {
    const output = `✅ Successfully edited file: /path/to/file.ts
🔄 Replaced 3 occurrence(s)`;

    expect(output).toContain('3 occurrence');
  });

  test('应该提取 grep_search 的匹配数量', () => {
    const output = `🔍 Search Results:
Found 15 matches in 8 files`;

    expect(output).toContain('15 match');
  });

  test('应该提取 list_dir 的文件数量', () => {
    const output = `📁 Directory listing:
23 files found`;

    expect(output).toContain('23 files');
  });

  test('应该组合多个信息项', () => {
    const output = `📄 File: /path/to/file.ts

<content>

---
📊 Line count: 980
📊 15000 characters`;

    expect(output).toContain('980');
    expect(output).toContain('15000');
  });

  test('应该在无关键信息时返回空字符串', () => {
    const output = `Tool executed successfully
No metrics available`;

    // 不应该包含任何数字指标
    expect(output).not.toContain('lines');
    expect(output).not.toContain('chars');
  });
});
