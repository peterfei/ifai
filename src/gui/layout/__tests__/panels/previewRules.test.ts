/**
 * previewRules 表驱动测试
 *
 * 测试用例即数据——每行定义 (输入, 期望输出)
 * 添加新规则 = 加一行，不改测试代码
 */

import { describe, it, expect } from 'vitest';
import {
  isWriteTool,
  isHtmlFile,
  hasHtmlOutput,
  evaluateTriggers,
} from '../../panels/previewRules';
import type { ToolCall } from '../../../../stores/useChatStore';
import type { FileChangeData } from '../../panels/useArtifactData';

// =============================================================
// 6.2.1 isWriteTool(toolCall) → boolean
// =============================================================
const IS_WRITE_TOOL_CASES: [Partial<ToolCall>, boolean][] = [
  [{ tool: 'agent_write_file' }, true],
  [{ tool: 'write_file' }, true],
  [{ tool: 'edit_file' }, false],
  [{ tool: 'read_file' }, false],
  [{ tool: 'glob' }, false],
  [{ tool: 'bash' }, false],
  [{ tool: 'create_file' }, false],
];

describe('isWriteTool', () => {
  it.each(IS_WRITE_TOOL_CASES)('isWriteTool({ tool: %s }) → %s', (input, expected) => {
    expect(isWriteTool(input as ToolCall)).toBe(expected);
  });
});

// =============================================================
// 6.2.2 isHtmlFile(fileName) → boolean
// =============================================================
const IS_HTML_CASES: [string, boolean][] = [
  ['index.html', true],
  ['game.html', true],
  ['sub/page.htm', true],
  ['main.js', false],
  ['style.css', false],
  ['data.json', false],
  ['image.png', false],
];

describe('isHtmlFile', () => {
  it.each(IS_HTML_CASES)('isHtmlFile(%s) → %s', (input, expected) => {
    expect(isHtmlFile(input)).toBe(expected);
  });
});

// =============================================================
// 6.2.3 hasHtmlOutput(artifacts) → boolean
// =============================================================
const HAS_HTML_CASES: [FileChangeData[], boolean][] = [
  [[{ name: 'index.html', type: 'html', path: '', size: '', additions: 0, deletions: 0 }], true],
  [[
    { name: 'index.html', type: 'html', path: '', size: '', additions: 0, deletions: 0 },
    { name: 'app.js', type: 'js', path: '', size: '', additions: 0, deletions: 0 },
  ], true],
  [[{ name: 'app.js', type: 'js', path: '', size: '', additions: 0, deletions: 0 }], false],
  [[], false],
];

describe('hasHtmlOutput', () => {
  it.each(HAS_HTML_CASES)('hasHtmlOutput(%j) → %s', (input, expected) => {
    expect(hasHtmlOutput(input)).toBe(expected);
  });
});

// =============================================================
// 6.2.4 evaluateTriggers(event, ctx) → Action[]
// =============================================================
const TRIGGER_CASES: [string, Record<string, any>, string[]][] = [
  // workflow:completed + 有 HTML → auto:open
  ['workflow:completed', { artifacts: [{ name: 'game.html', type: 'html', path: '', size: '', additions: 0, deletions: 0 }] }, ['auto:open']],
  // workflow:completed + 无 HTML → 空
  ['workflow:completed', { artifacts: [] }, []],
  ['workflow:completed', { artifacts: [{ name: 'app.js', type: 'js', path: '', size: '', additions: 0, deletions: 0 }] }, []],
  // artifact:clicked + 是 HTML → open
  ['artifact:clicked', { file: { name: 'index.html', type: 'html', path: '', size: '', additions: 0, deletions: 0 } }, ['open']],
  ['artifact:clicked', { file: { name: 'main.js', type: 'js', path: '', size: '', additions: 0, deletions: 0 } }, []],
  // workflow:completed + artifact:clicked（复合）
  ['workflow:completed', { artifacts: [{ name: 'a.html', type: 'html', path: '', size: '', additions: 0, deletions: 0 }], file: { name: 'b.html', type: 'html', path: '', size: '', additions: 0, deletions: 0 } }, ['auto:open']],
  // 未知事件 → 空
  ['unknown:event', {}, []],
];

describe('evaluateTriggers', () => {
  it.each(TRIGGER_CASES)('evaluateTriggers(%s, ctx) → %j', (event, ctx, expected) => {
    expect(evaluateTriggers(event, ctx)).toEqual(expected);
  });
});
