import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useChatStore } from '../useChatStore';
import { useFileStore } from '../fileStore';
import { toolRegistry } from '../tool/builtinTools';
import { invoke } from '@tauri-apps/api/core';

vi.mock('@tauri-apps/api/core');

describe('ChatStore 工具调用集成', () => {
  beforeEach(() => {
    // 重置 store
    useChatStore.setState({
      messages: [],
      isLoading: false
    });
    useFileStore.setState({ rootPath: '/test/project' });
    vi.clearAllMocks();
  });

  it('toolRegistry 应该导出可用的工具', () => {
    // 验证 toolRegistry 已正确集成
    expect(toolRegistry.has('agent_write_file')).toBe(true);
    expect(toolRegistry.has('agent_read_file')).toBe(true);
    expect(toolRegistry.has('agent_list_dir')).toBe(true);
    expect(toolRegistry.has('agent_delete_file')).toBe(true);
  });

  it('应该通过 toolRegistry 执行 agent_write_file', async () => {
    (invoke as any).mockResolvedValue(undefined);

    const result = await toolRegistry.execute(
      'agent_write_file',
      { path: '/test.txt', content: 'hello' },
      { messageId: 'msg1', threadId: 't1', projectRoot: '/test' }
    );

    expect(result.success).toBe(true);
    expect(result.output).toBe('File written: /test.txt');
  });

  it('toolRegistry 应该处理工具执行错误', async () => {
    (invoke as any).mockRejectedValue(new Error('File not found'));

    const result = await toolRegistry.execute(
      'agent_read_file',
      { path: '/nonexistent.txt' },
      { messageId: 'msg1', threadId: 't1', projectRoot: '/test' }
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('File not found');
  });

  it('应该通过 toolRegistry 列出文件系统工具', () => {
    const fsTools = toolRegistry.list('fs');

    expect(fsTools.length).toBeGreaterThan(0);
    expect(fsTools.every(t => t.category === 'fs')).toBe(true);
    expect(fsTools.map(t => t.name)).toContain('agent_write_file');
  });

  it('toolRegistry 应该支持按分类列出工具', () => {
    const allTools = toolRegistry.list();
    const fsTools = toolRegistry.list('fs');
    const bashTools = toolRegistry.list('bash');

    expect(allTools.length).toBeGreaterThanOrEqual(fsTools.length);
    expect(fsTools.length).toBeGreaterThan(0);
    expect(Array.isArray(bashTools)).toBe(true);
  });
});
