/**
 * utils 单元测试
 *
 * 测试覆盖：
 * - highlightText 搜索高亮
 * - formatCompactNumber 数字格式化
 */

import { describe, it, expect } from 'vitest';
import { highlightText } from '../utils';

describe('highlightText', () => {
  // #14: 完全匹配
  it('完全匹配时整个文本标记为高亮', () => {
    const result = highlightText('hello', 'hello');
    expect(result).toEqual([{ text: 'hello', isMatch: true }]);
  });

  // #15: 大小写不敏感
  it('大小写不敏感匹配', () => {
    const result = highlightText('Hello World', 'hello');
    expect(result).toEqual([
      { text: 'Hello', isMatch: true },
      { text: ' World', isMatch: false },
    ]);
  });

  // #16: 无匹配返回原文
  it('无匹配时返回原文且 isMatch 为 false', () => {
    const result = highlightText('hello', 'xyz');
    expect(result).toEqual([{ text: 'hello', isMatch: false }]);
  });

  // #17: 空查询返回原文
  it('空查询返回原文', () => {
    const result = highlightText('hello', '');
    expect(result).toEqual([{ text: 'hello', isMatch: false }]);
  });

  // #18: 多处匹配
  it('多处匹配返回多个高亮段', () => {
    const result = highlightText('ab ab ab', 'ab');
    expect(result).toEqual([
      { text: 'ab', isMatch: true },
      { text: ' ', isMatch: false },
      { text: 'ab', isMatch: true },
      { text: ' ', isMatch: false },
      { text: 'ab', isMatch: true },
    ]);
  });

  // #19: 注入安全 — 特殊字符不破坏结果
  it('特殊字符不产生异常', () => {
    const result = highlightText('<script>alert("xss")</script>', '<script>');
    expect(result).toEqual([
      { text: '<script>', isMatch: true },
      { text: 'alert("xss")</script>', isMatch: false },
    ]);
  });

  it('空文本返回空数组', () => {
    const result = highlightText('', 'test');
    expect(result).toEqual([]);
  });
});
