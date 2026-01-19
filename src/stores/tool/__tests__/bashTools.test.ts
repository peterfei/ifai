import { describe, it, expect, beforeEach, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { toolRegistry } from '../builtinTools';
import type { BashArgs, BashResult } from '@/types/toolTypes';

vi.mock('@tauri-apps/api/core');

describe('Bash 工具', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('agent_bash', () => {
    it('应该注册 agent_bash 工具', () => {
      expect(toolRegistry.has('agent_bash')).toBe(true);
    });

    it('工具应该有正确的属性', () => {
      const tool = toolRegistry.get('agent_bash');

      expect(tool?.name).toBe('agent_bash');
      expect(tool?.category).toBe('bash');
      expect(tool?.description).toBe('Execute shell commands');
      expect(tool?.requiresApproval).toBe(true);
      expect(tool?.isDangerous).toBe(true);
    });

    it('应该调用 Tauri 命令执行 bash', async () => {
      (invoke as any).mockResolvedValue('output from command');

      const result = await toolRegistry.execute<BashArgs, BashResult>(
        'agent_bash',
        { command: 'ls -la', cwd: '/tmp' },
        { messageId: 'msg1', threadId: 't1', projectRoot: '/tmp' }
      );

      expect(invoke).toHaveBeenCalledWith('agent_bash', {
        messageId: 'msg1',
        command: 'ls -la',
        cwd: '/tmp',
        env: undefined
      });
      expect(result.success).toBe(true);
      expect(result.output).toBe('output from command');
    });

    it('应该使用 projectRoot 作为默认 cwd', async () => {
      (invoke as any).mockResolvedValue('output');

      const result = await toolRegistry.execute<BashArgs, BashResult>(
        'agent_bash',
        { command: 'pwd' },
        { messageId: 'msg1', threadId: 't1', projectRoot: '/project' }
      );

      expect(invoke).toHaveBeenCalledWith('agent_bash', {
        messageId: 'msg1',
        command: 'pwd',
        cwd: '/project',
        env: undefined
      });
      expect(result.success).toBe(true);
    });

    it('应该传递环境变量', async () => {
      (invoke as any).mockResolvedValue('output');

      const env = { NODE_ENV: 'test', DEBUG: 'true' };

      const result = await toolRegistry.execute<BashArgs, BashResult>(
        'agent_bash',
        { command: 'echo $NODE_ENV', env },
        { messageId: 'msg1', threadId: 't1', projectRoot: '/tmp' }
      );

      expect(invoke).toHaveBeenCalledWith('agent_bash', {
        messageId: 'msg1',
        command: 'echo $NODE_ENV',
        cwd: '/tmp',
        env
      });
      expect(result.success).toBe(true);
    });

    it('应该处理 Tauri 错误', async () => {
      (invoke as any).mockRejectedValue(new Error('Command not found'));

      const result = await toolRegistry.execute<BashArgs, BashResult>(
        'agent_bash',
        { command: 'invalid_command' },
        { messageId: 'msg1', threadId: 't1', projectRoot: '/tmp' }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Command not found');
    });

    it('应该返回正确的输出类型', async () => {
      const mockOutput = 'file1.txt\nfile2.txt\nfile3.txt';
      (invoke as any).mockResolvedValue(mockOutput);

      const result = await toolRegistry.execute<BashArgs, BashResult>(
        'agent_bash',
        { command: 'ls' },
        { messageId: 'msg1', threadId: 't1', projectRoot: '/tmp' }
      );

      expect(result.success).toBe(true);
      expect(result.output).toBe(mockOutput);
    });
  });

  describe('工具分类', () => {
    it('bash 工具应该属于 bash 分类', () => {
      const bashTools = toolRegistry.list('bash');

      expect(bashTools).toHaveLength(1);
      expect(bashTools[0].name).toBe('agent_bash');
    });

    it('应该列出所有 bash 工具', () => {
      const bashTools = toolRegistry.list('bash');

      expect(bashTools.every(t => t.category === 'bash')).toBe(true);
    });
  });
});
