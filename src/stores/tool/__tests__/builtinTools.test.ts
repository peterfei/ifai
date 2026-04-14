import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock ToolService (source code now uses ToolService instead of direct invoke)
const mockWriteFile = vi.fn().mockResolvedValue('File written successfully');
const mockReadFile = vi.fn().mockResolvedValue('file content');
const mockListDir = vi.fn().mockResolvedValue(['file1.txt', 'file2.txt']);
const mockDeleteFile = vi.fn().mockResolvedValue('File deleted successfully');

vi.mock('@/services/toolService', () => ({
  default: {
    writeFile: (...args: any[]) => mockWriteFile(...args),
    readFile: (...args: any[]) => mockReadFile(...args),
    listDir: (...args: any[]) => mockListDir(...args),
    deleteFile: (...args: any[]) => mockDeleteFile(...args),
  },
  ToolService: {
    writeFile: (...args: any[]) => mockWriteFile(...args),
    readFile: (...args: any[]) => mockReadFile(...args),
    listDir: (...args: any[]) => mockListDir(...args),
    deleteFile: (...args: any[]) => mockDeleteFile(...args),
  }
}));

describe('内置工具 - agent_write_file', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWriteFile.mockResolvedValue('File written successfully');
  });

  it('应该注册 agent_write_file 工具', async () => {
    const { toolRegistry } = await import('../builtinTools');
    expect(toolRegistry.has('agent_write_file')).toBe(true);

    const tool = toolRegistry.get('agent_write_file');
    expect(tool?.name).toBe('agent_write_file');
    expect(tool?.category).toBe('fs');
    expect(tool?.requiresApproval).toBe(true);
    expect(tool?.isDangerous).toBe(true);
  });

  it('应该调用 ToolService 写入文件', async () => {
    const { toolRegistry } = await import('../builtinTools');
    const result = await toolRegistry.execute(
      'agent_write_file',
      { path: '/tmp/test.txt', content: 'hello' },
      { messageId: 'msg1', threadId: 't1', projectRoot: '/tmp' }
    );

    expect(result.success).toBe(true);
  });

  it('应该处理 ToolService 错误', async () => {
    mockWriteFile.mockRejectedValueOnce(new Error('Permission denied'));

    const { toolRegistry } = await import('../builtinTools');
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
  it('应该注册 agent_read_file 工具', async () => {
    const { toolRegistry } = await import('../builtinTools');
    expect(toolRegistry.has('agent_read_file')).toBe(true);

    const tool = toolRegistry.get('agent_read_file');
    expect(tool?.name).toBe('agent_read_file');
    expect(tool?.category).toBe('fs');
    expect(tool?.requiresApproval).toBe(false);
  });

  it('应该调用 ToolService 读取文件', async () => {
    const { toolRegistry } = await import('../builtinTools');
    const result = await toolRegistry.execute(
      'agent_read_file',
      { path: '/tmp/test.txt' },
      { messageId: 'msg1', threadId: 't1', projectRoot: '/tmp' }
    );

    expect(result.success).toBe(true);
    expect(result.output).toBe('file content');
  });
});

describe('内置工具 - agent_list_dir', () => {
  it('应该注册 agent_list_dir 工具', async () => {
    const { toolRegistry } = await import('../builtinTools');
    expect(toolRegistry.has('agent_list_dir')).toBe(true);

    const tool = toolRegistry.get('agent_list_dir');
    expect(tool?.name).toBe('agent_list_dir');
    expect(tool?.category).toBe('fs');
    expect(tool?.requiresApproval).toBe(false);
  });

  it('应该调用 ToolService 列出目录', async () => {
    const { toolRegistry } = await import('../builtinTools');
    const result = await toolRegistry.execute(
      'agent_list_dir',
      { path: '/tmp' },
      { messageId: 'msg1', threadId: 't1', projectRoot: '/tmp' }
    );

    expect(result.success).toBe(true);
    // listDir returns array, handler joins with \n
    expect(result.output).toBe('file1.txt\nfile2.txt');
  });
});

describe('内置工具 - agent_delete_file', () => {
  it('应该注册 agent_delete_file 工具', async () => {
    const { toolRegistry } = await import('../builtinTools');
    expect(toolRegistry.has('agent_delete_file')).toBe(true);

    const tool = toolRegistry.get('agent_delete_file');
    expect(tool?.name).toBe('agent_delete_file');
    expect(tool?.category).toBe('fs');
    expect(tool?.requiresApproval).toBe(true);
    expect(tool?.isDangerous).toBe(true);
  });

  it('应该调用 ToolService 删除文件', async () => {
    const { toolRegistry } = await import('../builtinTools');
    const result = await toolRegistry.execute(
      'agent_delete_file',
      { path: '/tmp/test.txt' },
      { messageId: 'msg1', threadId: 't1', projectRoot: '/tmp' }
    );

    expect(result.success).toBe(true);
  });
});
