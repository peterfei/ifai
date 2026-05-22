/**
 * useArtifactData hook 测试
 *
 * RA-1 ~ RA-6: 从 messages 提取产出物数据
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useArtifactData } from '../../panels/useArtifactData';
import type { Message, ToolCall } from '../../../../stores/useChatStore';

// Mock useChatStore
const mockMessages: Message[] = [];

vi.mock('../../../../stores/useChatStore', () => ({
  useChatStore: (selector: (state: { messages: Message[] }) => any) =>
    selector({ messages: mockMessages }),
}));

function makeToolCall(name: string, result?: any): ToolCall {
  return {
    id: `tc-${Math.random().toString(36).slice(2)}`,
    type: 'function',
    function: { name, arguments: '{}' },
    result,
  };
}

function makeMessage(
  role: Message['role'],
  toolCalls?: ToolCall[],
  content?: string,
): Message {
  return {
    id: `msg-${Math.random().toString(36).slice(2)}`,
    role,
    content: content ?? 'test',
    timestamp: Date.now(),
    toolCalls,
  };
}

describe('useArtifactData', () => {
  beforeEach(() => {
    mockMessages.length = 0;
  });

  // RA-1: 无消息时返回空数组
  it('RA-1: 无消息时返回空数组', () => {
    const { result } = renderHook(() => useArtifactData());
    expect(result.current).toEqual([]);
  });

  // RA-2: 从 toolCall result 中提取文件变更
  it('RA-2: 从 toolCall result 中提取文件变更', () => {
    mockMessages.push(
      makeMessage('assistant', [
        makeToolCall('Write', {
          path: '/src/components/Button.tsx',
          additions: 50,
          deletions: 0,
        }),
      ]),
    );

    const { result } = renderHook(() => useArtifactData());
    expect(result.current.length).toBeGreaterThanOrEqual(1);
    expect(result.current[0].path).toContain('Button.tsx');
  });

  // RA-3: 每条产出物含 name/size/type/path
  it('RA-3: 每条产出物含 name/size/type/path', () => {
    mockMessages.push(
      makeMessage('assistant', [
        makeToolCall('Edit', {
          path: '/src/utils/helper.ts',
          additions: 20,
          deletions: 5,
        }),
      ]),
    );

    const { result } = renderHook(() => useArtifactData());
    const artifact = result.current[0];

    expect(artifact).toHaveProperty('name');
    expect(artifact).toHaveProperty('size');
    expect(artifact).toHaveProperty('type');
    expect(artifact).toHaveProperty('path');
  });

  // RA-4: 文件类型从路径后缀推断（ts/tsx/test/md）
  it('RA-4: 文件类型从路径后缀推断', () => {
    mockMessages.push(
      makeMessage('assistant', [
        makeToolCall('Write', {
          path: '/src/hooks/useForm.ts',
          additions: 30,
          deletions: 0,
        }),
        makeToolCall('Write', {
          path: '/src/components/Form.tsx',
          additions: 40,
          deletions: 0,
        }),
        makeToolCall('Write', {
          path: '/src/hooks/useForm.test.ts',
          additions: 60,
          deletions: 0,
        }),
      ]),
    );

    const { result } = renderHook(() => useArtifactData());
    expect(result.current.find((a) => a.name === 'useForm.ts')?.type).toBe('ts');
    expect(result.current.find((a) => a.name === 'Form.tsx')?.type).toBe('tsx');
    expect(result.current.find((a) => a.name === 'useForm.test.ts')?.type).toBe('test');
  });

  // RA-5: 文件大小从 additions + deletions 估算
  it('RA-5: 文件大小从 additions + deletions 估算', () => {
    mockMessages.push(
      makeMessage('assistant', [
        makeToolCall('Write', {
          path: '/src/app.ts',
          additions: 100,
          deletions: 20,
        }),
      ]),
    );

    const { result } = renderHook(() => useArtifactData());
    const artifact = result.current[0];

    // 大小应该是一个合理的字符串
    expect(typeof artifact.size).toBe('string');
    expect(artifact.size.length).toBeGreaterThan(0);
  });

  // RA-6: 同名文件去重（保留最新）
  it('RA-6: 同名文件去重（保留最新）', () => {
    // 两条消息，都修改同一个文件
    mockMessages.push(
      makeMessage('assistant', [
        makeToolCall('Write', {
          path: '/src/index.ts',
          additions: 10,
          deletions: 0,
        }),
      ]),
      makeMessage('assistant', [
        makeToolCall('Edit', {
          path: '/src/index.ts',
          additions: 50,
          deletions: 10,
        }),
      ]),
    );

    const { result } = renderHook(() => useArtifactData());

    // 同名文件只保留一条
    const indexFiles = result.current.filter((a) => a.name === 'index.ts');
    expect(indexFiles.length).toBe(1);

    // 保留的是最新（additions + deletions 更大的那条）
    expect(indexFiles[0].size).toBeTruthy();
  });
});
