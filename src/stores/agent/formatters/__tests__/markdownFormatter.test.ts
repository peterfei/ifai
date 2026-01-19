import { describe, it, expect } from 'vitest';
import { formatStreamToMarkdown } from '../markdownFormatter';

describe('formatStreamToMarkdown', () => {
  it('应该将简单任务格式化为 Markdown', () => {
    const buffer = '{"title": "Task 1", "description": "First task"}';

    const result = formatStreamToMarkdown(buffer);

    expect(result).toContain('**Task 1**');
    expect(result).toContain('> First task');
  });

  it('应该移除 markdown 代码块标记', () => {
    const buffer = '```json\n{"title": "Task", "description": "Desc"}\n```';

    const result = formatStreamToMarkdown(buffer);

    expect(result).toContain('**Task**');
    expect(result).not.toContain('```');
  });

  it('应该处理多个任务', () => {
    const buffer = '{"title": "Task 1", "description": "Desc 1"} {"title": "Task 2", "description": "Desc 2"}';

    const result = formatStreamToMarkdown(buffer);

    expect(result).toContain('**Task 1**');
    expect(result).toContain('> Desc 1');
    expect(result).toContain('**Task 2**');
    expect(result).toContain('> Desc 2');
  });

  it('应该处理没有 description 的任务', () => {
    const buffer = '{"title": "Task Only"}';

    const result = formatStreamToMarkdown(buffer);

    expect(result).toContain('**Task Only**');
    expect(result).not.toContain('>');
  });

  it('应该去重已存在的任务（通过 previousContent）', () => {
    const buffer = '{"title": "Task 1", "description": "Desc"} {"title": "Task 2", "description": "Desc"}';
    const previousContent = '{"title": "Task 1", "description": "Old Desc"}';

    const result = formatStreamToMarkdown(buffer, previousContent);

    // Task 1 应该被去重
    expect(result).not.toContain('**Task 1**');
    // Task 2 应该存在
    expect(result).toContain('**Task 2**');
  });

  it('应该在任务之间添加空行分隔', () => {
    const buffer = '{"title": "Task 1", "description": "A"} {"title": "Task 2", "description": "B"}';

    const result = formatStreamToMarkdown(buffer);

    // 检查是否有双换行符（空行）
    expect(result).toMatch(/\n\n/);
  });

  it('应该处理空缓冲区', () => {
    const result = formatStreamToMarkdown('');

    expect(result).toBe('');
  });

  it('应该在解析失败时返回空字符串', () => {
    // 无法解析的内容
    const result = formatStreamToMarkdown('invalid {{ {{{');

    expect(result).toBe('');
  });

  it('应该处理只有 title 没有 description 的多个任务', () => {
    const buffer = '{"title": "Task A"} {"title": "Task B"} {"title": "Task C"}';

    const result = formatStreamToMarkdown(buffer);

    expect(result).toContain('**Task A**');
    expect(result).toContain('**Task B**');
    expect(result).toContain('**Task C**');
    // 应该没有描述行
    expect(result.split('> ').length - 1).toBe(0);
  });

  it('应该匹配 title 和 description 的顺序', () => {
    const buffer = '{"title": "First", "description": "Desc A"} {"title": "Second", "description": "Desc B"}';

    const result = formatStreamToMarkdown(buffer);

    // First 应该匹配 Desc A
    expect(result.indexOf('**First**')).toBeLessThan(result.indexOf('> Desc A'));
    expect(result.indexOf('> Desc A')).toBeLessThan(result.indexOf('**Second**'));
  });

  it('应该处理嵌套的 JSON 结构', () => {
    const buffer = '{"title": "Parent", "children": [{"title": "Child", "description": "Child desc"}]}';

    const result = formatStreamToMarkdown(buffer);

    expect(result).toContain('**Parent**');
    expect(result).toContain('**Child**');
    expect(result).toContain('> Child desc');
  });
});
