/**
 * useArtifactData 测试 — 产出物面板数据提取
 *
 * 测试覆盖：
 * - Parser 单元测试（AP-1 ~ AP-3b）：三种工具的 result 解析
 * - Hook 集成测试（AP-6, AP-8, AP-9）：多消息遍历 + 去重
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { useChatStore } from '../../../../stores/useChatStore';
import type { ToolCall } from '../../../../stores/useChatStore';
import { _extractFileChange, _computeArtifacts } from '../useArtifactData';

/** 快捷构造 ToolCall */
function makeTC(name: string, result: any, id = `tc-${Math.random().toString(36).slice(2, 8)}`): ToolCall {
  return {
    id,
    type: 'function',
    function: { name, arguments: '{}' },
    status: 'completed',
    result,
  };
}

/** 快捷构造 assistant 消息 */
function makeMsg(toolCalls: ToolCall[], id = `msg-${Math.random().toString(36).slice(2, 8)}`) {
  return {
    id,
    role: 'assistant' as const,
    content: '',
    toolCalls,
    timestamp: Date.now(),
  };
}

/** 快捷构造 user 消息 */
function makeUserMsg(content = 'hello', id = `user-${Math.random().toString(36).slice(2, 8)}`) {
  return {
    id,
    role: 'user' as const,
    content,
    timestamp: Date.now(),
  };
}

// ============================================================================
// 第一层：Parser 单元测试
// ============================================================================

describe('useArtifactData — Parser', () => {

  // ── agent_write_file ──

  test('AP-1: agent_write_file 正常 JSON（覆盖文件）', () => {
    const result = JSON.stringify({
      success: true,
      message: 'File written successfully',
      originalContent: 'line1\nline2\nline3',
      newContent: 'line1\nline2\nline3\nline4\nline5',
      filePath: 'src/components/App.tsx',
      timestamp: 1234567890,
    });
    const tc = makeTC('agent_write_file', result);

    // 通过 hook 验证：先构造消息，再检查产出物
    const file = _extractFileChange(tc);

    expect(file).not.toBeNull();
    expect(file!.path).toBe('src/components/App.tsx');
    expect(file!.name).toBe('App.tsx');
    expect(file!.type).toBe('tsx');
    expect(file!.additions).toBe(5);  // newContent 5 行
    expect(file!.deletions).toBe(3);  // originalContent 3 行
  });

  test('AP-1b: agent_write_file 新文件（originalContent 为 null）', () => {
    const result = JSON.stringify({
      success: true,
      message: 'File written successfully',
      originalContent: null,
      newContent: 'import React',
      filePath: 'src/new-module.ts',
      timestamp: 1234567890,
    });
    const tc = makeTC('agent_write_file', result);

    const file = _extractFileChange(tc);

    expect(file).not.toBeNull();
    expect(file!.path).toBe('src/new-module.ts');
    expect(file!.deletions).toBe(0);  // 新文件，0 删除行
    expect(file!.additions).toBe(1);
  });

  test('AP-3b: agent_write_file JSON 无 filePath → return null', () => {
    const result = JSON.stringify({
      success: true,
      message: 'ok',
    });
    const tc = makeTC('agent_write_file', result);

    const file = _extractFileChange(tc);

    expect(file).toBeNull();
  });

  // ── write_file ──

  test('AP-2: write_file 纯文本正常', () => {
    const result = 'Successfully wrote to file: README.md\n42 lines, 1234 characters';
    const tc = makeTC('write_file', result);

    const file = _extractFileChange(tc);

    expect(file).not.toBeNull();
    expect(file!.path).toBe('README.md');
    expect(file!.name).toBe('README.md');
    expect(file!.type).toBe('md');
    expect(file!.additions).toBe(42);
    expect(file!.deletions).toBe(0);
  });

  test('AP-2b: write_file 空文件（0 lines）', () => {
    const result = 'Successfully wrote to file: src/empty.ts\n0 lines, 0 characters';
    const tc = makeTC('write_file', result);

    const file = _extractFileChange(tc);

    expect(file).not.toBeNull();
    expect(file!.path).toBe('src/empty.ts');
    expect(file!.additions).toBe(0);
  });

  // ── edit_file ──

  test('AP-3: edit_file 纯文本正常', () => {
    const result = 'Successfully edited file: src/utils.ts\nReplaced 2 occurrence(s)';
    const tc = makeTC('edit_file', result);

    const file = _extractFileChange(tc);

    expect(file).not.toBeNull();
    expect(file!.path).toBe('src/utils.ts');
    expect(file!.name).toBe('utils.ts');
    expect(file!.type).toBe('ts');
  });

  // ── 负向 / 边界 ──

  test('AP-4: 非 write 工具 → return null', () => {
    const tc = makeTC('agent_read_file', '{"success":true}');
    expect(_extractFileChange(tc)).toBeNull();
  });

  test('AP-5: result = undefined → return null', () => {
    const tc = makeTC('write_file', undefined);
    expect(_extractFileChange(tc)).toBeNull();
  });

  test('AP-7: 无效文本（非 JSON，无路径）→ return null', () => {
    const tc = makeTC('agent_write_file', 'some random text without path info');
    expect(_extractFileChange(tc)).toBeNull();
  });

  test('AP-10: write_file 路径不包含换行后的内容（回归真实 result）', () => {
    // 真实 result 格式：路径后跟换行 + 行数 + 可能的 JSON 残留
    const result = 'Successfully wrote to file: README.md\n176 lines, 6136 characters","status":"success"}';
    const tc = makeTC('write_file', result);

    const file = _extractFileChange(tc);

    expect(file).not.toBeNull();
    expect(file!.path).toBe('README.md');
    expect(file!.name).toBe('README.md');
    expect(file!.additions).toBe(176);
  });
});

// ============================================================================
// 第二层：Hook 集成测试
// ============================================================================

describe('useArtifactData — Hook 集成', () => {
  beforeEach(() => {
    useChatStore.setState({ messages: [] });
  });

  test('AP-6: 同名文件去重（保留最新）', () => {
    const tc1 = makeTC('agent_write_file', JSON.stringify({
      success: true, filePath: 'src/App.tsx', originalContent: null, newContent: 'v1',
    }));
    const tc2 = makeTC('agent_write_file', JSON.stringify({
      success: true, filePath: 'src/App.tsx', originalContent: 'v1', newContent: 'v2\nv2',
    }));

    useChatStore.setState({
      messages: [
        makeMsg([tc1]),
        makeMsg([tc2]),
      ] as any,
    });

    const artifacts = _computeArtifacts(useChatStore.getState().messages);

    expect(artifacts).toHaveLength(1);
    expect(artifacts[0].additions).toBe(2); // 保留第二次：'v2\nv2' = 2 lines
  });

  test('AP-8: 多消息多 toolCalls（跨消息提取）', () => {
    const tc1 = makeTC('agent_write_file', JSON.stringify({
      success: true, filePath: 'src/a.ts', originalContent: null, newContent: 'a',
    }));
    const tc2 = makeTC('write_file', 'Successfully wrote to file: src/b.ts\n10 lines, 200 characters');
    const tc3 = makeTC('edit_file', 'Successfully edited file: src/c.ts\nReplaced 1 occurrence(s)');

    useChatStore.setState({
      messages: [
        makeUserMsg('帮我写三个文件'),
        makeMsg([tc1]),
        makeMsg([tc2, tc3]),
      ] as any,
    });

    const artifacts = _computeArtifacts(useChatStore.getState().messages);

    expect(artifacts).toHaveLength(3);
    const paths = artifacts.map(a => a.path).sort();
    expect(paths).toEqual(['src/a.ts', 'src/b.ts', 'src/c.ts']);
  });

  test('AP-9: 只有 user 消息 → 返回空数组', () => {
    useChatStore.setState({
      messages: [
        makeUserMsg('hello'),
        makeUserMsg('world'),
      ] as any,
    });

    const artifacts = _computeArtifacts(useChatStore.getState().messages);

    expect(artifacts).toHaveLength(0);
  });
});
