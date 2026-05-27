/**
 * wrapBareFilenames 单元测试
 *
 * 测试覆盖：
 * - 裸文件名被包裹反引号
 * - 路径前缀文件名被包裹
 * - 已反引号包裹的文件名不被二次包裹
 * - URL 不被包裹
 * - 代码块内文件名不被包裹
 * - 各类扩展名
 * - 标点符号边界
 */
import { describe, it, expect } from 'vitest';
import { wrapBareFilenames } from '../MarkdownRenderer';

describe('wrapBareFilenames', () => {
  // WF-1: 裸文件名被包裹
  it('WF-1: 裸文件名被包裹反引号', () => {
    const result = wrapBareFilenames('请修改 index.html 文件');
    expect(result).toBe('请修改 `index.html` 文件');
  });

  // WF-2: 路径前缀文件名被包裹
  it('WF-2: 路径前缀文件名被包裹', () => {
    const result = wrapBareFilenames('更新 src/components/App.tsx 文件');
    expect(result).toBe('更新 `src/components/App.tsx` 文件');
  });

  // WF-3: 相对路径被包裹
  it('WF-3: 相对路径被包裹', () => {
    const result = wrapBareFilenames('看 ./utils/helper.js 文件');
    expect(result).toBe('看 `./utils/helper.js` 文件');
  });

  // WF-4: 上级路径被包裹
  it('WF-4: 上级路径被包裹', () => {
    const result = wrapBareFilenames('引入 ../config.yaml');
    expect(result).toBe('引入 `../config.yaml`');
  });

  // WF-5: 已在反引号内的不变
  it('WF-5: 已在反引号内的文件名不被二次包裹', () => {
    const result = wrapBareFilenames('修改 `index.html` 文件');
    expect(result).toBe('修改 `index.html` 文件');
  });

  // WF-6: URL 不被包裹
  it('WF-6: URL 不被包裹', () => {
    const result = wrapBareFilenames('访问 https://example.com/page.html');
    expect(result).toBe('访问 https://example.com/page.html');
  });

  // WF-7: 代码块内文件名不变
  it('WF-7: 代码块内文件名不处理', () => {
    const result = wrapBareFilenames('代码：```\nconst x = require("./config.js");\n```');
    // 代码块内 ./config.js 不被额外包裹
    expect(result).toContain('./config.js');
    expect(result).not.toContain('`./config.js`');
  });

  // WF-8: 多种扩展名
  it('WF-8: 多种扩展名都被识别', () => {
    const input = '处理 main.py 和 style.css 和 data.json';
    const result = wrapBareFilenames(input);
    expect(result).toContain('`main.py`');
    expect(result).toContain('`style.css`');
    expect(result).toContain('`data.json`');
  });

  // WF-9: 逗号后缀的边界
  it('WF-9: 逗号后缀正确包裹', () => {
    const result = wrapBareFilenames('修改 index.html, 然后更新');
    expect(result).toBe('修改 `index.html`, 然后更新');
  });

  // WF-10: 句号后缀的边界
  it('WF-10: 句号后缀正确包裹', () => {
    const result = wrapBareFilenames('查看 readme.md.');
    expect(result).toBe('查看 `readme.md`.');
  });

  // WF-11: 括号内文件名
  it('WF-11: 括号内文件名被包裹', () => {
    const result = wrapBareFilenames('（参考 index.html）');
    expect(result).toBe('（参考 `index.html`）');
  });

  // WF-12: 无文件名不变
  it('WF-12: 无文件名文本不变', () => {
    const result = wrapBareFilenames('这是一段普通文本');
    expect(result).toBe('这是一段普通文本');
  });

  // WF-13: 空字符串不变
  it('WF-13: 空字符串不变', () => {
    expect(wrapBareFilenames('')).toBe('');
  });

  // WF-14: 下划线路径
  it('WF-14: 下划线路径文件名', () => {
    const result = wrapBareFilenames('更新 __tests__/foo.test.tsx');
    expect(result).toBe('更新 `__tests__/foo.test.tsx`');
  });

  // WF-15: 混合行内代码和裸文件名
  it('WF-15: 混合行内代码和裸文件名', () => {
    const result = wrapBareFilenames('先看 `readme.md`，再修改 index.html');
    expect(result).toBe('先看 `readme.md`，再修改 `index.html`');
  });
});
