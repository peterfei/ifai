import { describe, it, expect, beforeEach, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { toolRegistry } from '../builtinTools';

vi.mock('@tauri-apps/api/core');

describe('内置工具 - agent_write_file', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应该注册 agent_write_file 工具', () => {
    expect(toolRegistry.has('agent_write_file')).toBe(true);

    const tool = toolRegistry.get('agent_write_file');
    expect(tool?.name).toBe('agent_write_file');
    expect(tool?.category).toBe('fs');
    expect(tool?.requiresApproval).toBe(true);
    expect(tool?.isDangerous).toBe(true);
  });

  it('应该调用 Tauri 命令写入文件', async () => {
    (invoke as any).mockResolvedValue(undefined);

    const result = await toolRegistry.execute(
      'agent_write_file',
      { path: '/tmp/test.txt', content: 'hello' },
      { messageId: 'msg1', threadId: 't1', projectRoot: '/tmp' }
    );

    expect(invoke).toHaveBeenCalledWith('agent_write_file', {
      messageId: 'msg1',
      path: '/tmp/test.txt',
      content: 'hello'
    });
    expect(result.success).toBe(true);
    expect(result.output).toBe('File written: /tmp/test.txt');
  });

  it('应该处理 Tauri 错误', async () => {
    (invoke as any).mockRejectedValue(new Error('Permission denied'));

    const result = await toolRegistry.execute(
      'agent_write_file',
      { path: '/root/test.txt', content: 'hello' },
      { messageId: 'msg1', threadId: 't1', projectRoot: '/tmp' }
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Permission denied');
  });
});

describe('内置工具 - agent_read_file', () => {
  it('应该注册 agent_read_file 工具', () => {
    expect(toolRegistry.has('agent_read_file')).toBe(true);

    const tool = toolRegistry.get('agent_read_file');
    expect(tool?.name).toBe('agent_read_file');
    expect(tool?.category).toBe('fs');
    expect(tool?.requiresApproval).toBe(false);
  });

  it('应该调用 Tauri 命令读取文件', async () => {
    (invoke as any).mockResolvedValue('file content');

    const result = await toolRegistry.execute(
      'agent_read_file',
      { path: '/tmp/test.txt' },
      { messageId: 'msg1', threadId: 't1', projectRoot: '/tmp' }
    );

    expect(invoke).toHaveBeenCalledWith('agent_read_file', {
      messageId: 'msg1',
      path: '/tmp/test.txt'
    });
    expect(result.success).toBe(true);
    expect(result.output).toBe('file content');
  });
});

describe('内置工具 - agent_list_dir', () => {
  it('应该注册 agent_list_dir 工具', () => {
    expect(toolRegistry.has('agent_list_dir')).toBe(true);

    const tool = toolRegistry.get('agent_list_dir');
    expect(tool?.name).toBe('agent_list_dir');
    expect(tool?.category).toBe('fs');
    expect(tool?.requiresApproval).toBe(false);
  });

  it('应该调用 Tauri 命令列出目录', async () => {
    (invoke as any).mockResolvedValue('file1.txt\nfile2.txt');

    const result = await toolRegistry.execute(
      'agent_list_dir',
      { path: '/tmp' },
      { messageId: 'msg1', threadId: 't1', projectRoot: '/tmp' }
    );

    expect(invoke).toHaveBeenCalledWith('agent_list_dir', {
      messageId: 'msg1',
      path: '/tmp'
    });
    expect(result.success).toBe(true);
    expect(result.output).toBe('file1.txt\nfile2.txt');
  });
});

describe('内置工具 - agent_delete_file', () => {
  it('应该注册 agent_delete_file 工具', () => {
    expect(toolRegistry.has('agent_delete_file')).toBe(true);

    const tool = toolRegistry.get('agent_delete_file');
    expect(tool?.name).toBe('agent_delete_file');
    expect(tool?.category).toBe('fs');
    expect(tool?.requiresApproval).toBe(true);
    expect(tool?.isDangerous).toBe(true);
  });

  it('应该调用 Tauri 命令删除文件', async () => {
    (invoke as any).mockResolvedValue(undefined);

    const result = await toolRegistry.execute(
      'agent_delete_file',
      { path: '/tmp/test.txt' },
      { messageId: 'msg1', threadId: 't1', projectRoot: '/tmp' }
    );

    expect(invoke).toHaveBeenCalledWith('agent_delete_file', {
      messageId: 'msg1',
      path: '/tmp/test.txt'
    });
    expect(result.success).toBe(true);
    expect(result.output).toBe('File deleted: /tmp/test.txt');
  });
});
