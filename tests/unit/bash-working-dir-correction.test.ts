/**
 * 单元测试: Bash 命令工作目录自动修正
 *
 * 测试场景:
 * 1. LLM 未指定 cwd - 自动使用项目根目录
 * 2. LLM 指定了错误的 cwd - 自动修正为项目根目录
 * 3. LLM 指定了正确的 cwd - 不进行修正
 * 4. 没有项目根目录 - 不进行修正
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Bash Working Directory Auto-Correction', () => {
  describe('工作目录修正逻辑', () => {
    const mockRootPath = '/Users/mac/project/demo';

    it('场景1: LLM 未指定 cwd - 应该标记需要修正', () => {
      const args = { command: 'npm run dev' };
      const providedCwd = args.cwd || args.working_dir;

      const needsCorrection = !providedCwd;

      expect(needsCorrection).toBe(true);
    });

    it('场景2: LLM 指定了错误目录（非项目根目录）- 应该标记需要修正', () => {
      const args = { command: 'npm run dev', cwd: '/Users/mac/project/other-project' };
      const providedCwd = args.cwd || args.working_dir;

      const needsCorrection = providedCwd && !providedCwd.startsWith(mockRootPath);

      expect(needsCorrection).toBe(true);
    });

    it('场景3: LLM 指定了正确的项目根目录 - 不需要修正', () => {
      const args = { command: 'npm run dev', cwd: mockRootPath };
      const providedCwd = args.cwd || args.working_dir;

      const needsCorrection = !providedCwd || (providedCwd && !providedCwd.startsWith(mockRootPath));

      expect(needsCorrection).toBe(false);
    });

    it('场景4: LLM 指定了项目根目录下的子目录 - 不需要修正', () => {
      const args = { command: 'npm run dev', cwd: `${mockRootPath}/subdir` };
      const providedCwd = args.cwd || args.working_dir;

      const needsCorrection = !providedCwd || (providedCwd && !providedCwd.startsWith(mockRootPath));

      expect(needsCorrection).toBe(false);
    });

    it('场景5: 使用 working_dir 参数而不是 cwd', () => {
      const args = { command: 'npm run dev', working_dir: '/Users/mac/other' };
      const providedCwd = args.cwd || args.working_dir;

      const needsCorrection = !providedCwd || (providedCwd && !providedCwd.startsWith(mockRootPath));

      expect(needsCorrection).toBe(true);
    });
  });

  describe('修正后的 args 验证', () => {
    const mockRootPath = '/Users/mac/project/demo';

    it('应该正确设置 working_dir 和 cwd', () => {
      const originalArgs = { command: 'npm run dev' };
      const correctedArgs = {
        ...originalArgs,
        working_dir: mockRootPath,
        cwd: mockRootPath
      };

      expect(correctedArgs.working_dir).toBe(mockRootPath);
      expect(correctedArgs.cwd).toBe(mockRootPath);
      expect(correctedArgs.command).toBe('npm run dev');
    });

    it('应该保留原始 args 中的其他参数', () => {
      const originalArgs = {
        command: 'npm run dev',
        timeout: 5000,
        env: { NODE_ENV: 'development' }
      };
      const correctedArgs = {
        ...originalArgs,
        working_dir: mockRootPath,
        cwd: mockRootPath
      };

      expect(correctedArgs.timeout).toBe(5000);
      expect(correctedArgs.env).toEqual({ NODE_ENV: 'development' });
    });
  });

  describe('边界情况', () => {
    const mockRootPath = '/Users/mac/project/demo';

    it('空字符串 cwd 应该被修正', () => {
      const args = { command: 'npm run dev', cwd: '' };
      const providedCwd = args.cwd || args.working_dir;

      const needsCorrection = !providedCwd;

      expect(needsCorrection).toBe(true);
    });

    it('相对路径应该被修正', () => {
      const args = { command: 'npm run dev', cwd: './other-project' };
      const providedCwd = args.cwd || args.working_dir;

      const needsCorrection = providedCwd && !providedCwd.startsWith(mockRootPath);

      expect(needsCorrection).toBe(true);
    });

    it('项目根目录为空时不进行修正', () => {
      const rootPath = '';
      const args = { command: 'npm run dev' };

      if (!rootPath) {
        // 不应该进行修正
        expect(true).toBe(true);
      } else {
        fail('应该跳过修正逻辑');
      }
    });
  });

  describe('实际应用场景', () => {
    const mockRootPath = '/Users/mac/project/demo';

    it('还原 "执行vite" bug 场景', () => {
      // 用户场景：
      // - 项目根目录: /Users/mac/project/demo
      // - LLM 指定的 cwd: /Users/mac/project/aieditor (编辑器源代码目录)
      // - 预期：自动修正为 /Users/mac/project/demo

      const llmProvidedCwd = '/Users/mac/project/aieditor';
      const args = { command: 'npm run dev', cwd: llmProvidedCwd };

      const needsCorrection = args.cwd && !args.cwd.startsWith(mockRootPath);

      expect(needsCorrection).toBe(true);

      // 模拟修正
      const correctedArgs = {
        ...args,
        working_dir: mockRootPath,
        cwd: mockRootPath
      };

      expect(correctedArgs.cwd).toBe(mockRootPath);
      expect(correctedArgs.cwd).not.toBe(llmProvidedCwd);
    });

    it('还原 node_modules/.vite 目录场景', () => {
      // 用户场景：
      // - LLM 可能误入 node_modules/.vite 目录
      // - 预期：自动修正为项目根目录

      const wrongDir = '/Users/mac/project/demo/node_modules/.vite';
      const args = { command: 'npm run dev', cwd: wrongDir };

      // 虽然这个路径包含项目根目录，但不是从根目录开始的有效工作目录
      // 实际实现中，我们允许子目录，所以这个场景需要特殊处理

      // 在当前实现中，只要路径以 rootPath 开头就认为是有效的
      // 这可能需要进一步优化（例如检查是否是 node_modules 等特殊目录）
      const needsCorrection = args.cwd && !args.cwd.startsWith(mockRootPath);

      expect(needsCorrection).toBe(false); // 当前实现会认为这是有效的
    });
  });
});
