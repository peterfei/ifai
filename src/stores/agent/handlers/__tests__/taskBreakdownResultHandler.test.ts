import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  handleTaskBreakdownResult,
  shouldHandleTaskBreakdownResult,
  validateTaskBreakdownResult,
} from '../taskBreakdownResultHandler';

// Mock dependencies
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('@/stores/taskBreakdownStore', () => ({
  useTaskBreakdownStore: {
    getState: vi.fn(),
  },
}));

vi.mock('@/stores/fileStore', () => ({
  useFileStore: {
    getState: vi.fn(),
  },
}));

vi.mock('@/utils/fileActions', () => ({
  openFileFromPath: vi.fn(),
}));

describe('TaskBreakdownResultHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('shouldHandleTaskBreakdownResult', () => {
    it('当 agent 类型为 task-breakdown 且有结果时应返回 true', () => {
      expect(shouldHandleTaskBreakdownResult('task-breakdown', 'some result')).toBe(true);
    });

    it('当 agent 类型不是 task-breakdown 时应返回 false', () => {
      expect(shouldHandleTaskBreakdownResult('explore', 'some result')).toBe(false);
      expect(shouldHandleTaskBreakdownResult('proposal-generator', 'some result')).toBe(false);
    });

    it('当结果为空时应返回 false', () => {
      expect(shouldHandleTaskBreakdownResult('task-breakdown', '')).toBe(false);
      expect(shouldHandleTaskBreakdownResult('task-breakdown', undefined as any)).toBe(false);
    });
  });

  describe('validateTaskBreakdownResult', () => {
    it('应该验证有效的 task breakdown 结果', () => {
      const validResult = JSON.stringify({
        id: 'tb-123',
        title: 'Test Task',
        taskTree: { title: 'Root', children: [] },
      });

      const result = validateTaskBreakdownResult(validResult);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('应该拒绝空结果', () => {
      const result = validateTaskBreakdownResult('');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Result is empty');
    });

    it('应该拒绝过短的结果', () => {
      const result = validateTaskBreakdownResult('short');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Result is too short');
    });
  });

  describe('handleTaskBreakdownResult', () => {
    it('应该成功处理带有代码块的 JSON 结果', async () => {
      const jsonData = {
        id: 'tb-123',
        title: 'Test Task',
        description: 'Test description',
        taskTree: {
          title: 'Root',
          description: 'Root description',
          children: [
            { title: 'Child 1', description: 'Child 1 description' },
            { title: 'Child 2', description: 'Child 2 description' },
          ],
        },
      };

      const resultWithCodeBlock = `\`\`\`json\n${JSON.stringify(jsonData, null, 2)}\n\`\`\``;

      const mockBreakdownStore = {
        saveBreakdown: vi.fn().mockResolvedValue(undefined),
        setCurrentBreakdown: vi.fn(),
        setPanelOpen: vi.fn(),
      };

      const { useTaskBreakdownStore } = await import('@/stores/taskBreakdownStore');
      (useTaskBreakdownStore as any).getState = vi.fn().mockReturnValue(mockBreakdownStore);

      const { openFileFromPath } = await import('@/utils/fileActions');
      (openFileFromPath as any).mockResolvedValue(false);

      const result = await handleTaskBreakdownResult(resultWithCodeBlock, 'agent-1');

      expect(result.success).toBe(true);
      expect(result.breakdownId).toBe('tb-123');
      expect(mockBreakdownStore.saveBreakdown).toHaveBeenCalled();
    });

    it('应该规范化缺失的字段', async () => {
      const incompleteData = {
        taskTree: {
          title: 'Root Task',
          description: 'Root description',
          children: [],
        },
      };

      const mockBreakdownStore = {
        saveBreakdown: vi.fn().mockResolvedValue(undefined),
        setCurrentBreakdown: vi.fn(),
        setPanelOpen: vi.fn(),
      };

      const { useTaskBreakdownStore } = await import('@/stores/taskBreakdownStore');
      (useTaskBreakdownStore as any).getState = vi.fn().mockReturnValue(mockBreakdownStore);

      const { openFileFromPath } = await import('@/utils/fileActions');
      (openFileFromPath as any).mockResolvedValue(false);

      const result = await handleTaskBreakdownResult(JSON.stringify(incompleteData), 'agent-1');

      expect(result.success).toBe(true);
      expect(result.breakdownId).toBeDefined(); // 应该生成 ID

      // 验证保存时数据被规范化
      const savedData = mockBreakdownStore.saveBreakdown.mock.calls[0][0];
      expect(savedData.id).toBeDefined();
      expect(savedData.title).toBe('Root Task'); // 从 taskTree.title 提取
      expect(savedData.description).toBeDefined();
      expect(savedData.originalPrompt).toBeDefined();
    });

    it('应该处理没有代码块的结果', async () => {
      const jsonData = {
        id: 'tb-456',
        title: 'Test Without Code Block',
        taskTree: { title: 'Root', children: [] },
      };

      const mockBreakdownStore = {
        saveBreakdown: vi.fn().mockResolvedValue(undefined),
        setCurrentBreakdown: vi.fn(),
        setPanelOpen: vi.fn(),
      };

      const { useTaskBreakdownStore } = await import('@/stores/taskBreakdownStore');
      (useTaskBreakdownStore as any).getState = vi.fn().mockReturnValue(mockBreakdownStore);

      const { openFileFromPath } = await import('@/utils/fileActions');
      (openFileFromPath as any).mockResolvedValue(false);

      const result = await handleTaskBreakdownResult(JSON.stringify(jsonData), 'agent-1');

      expect(result.success).toBe(true);
      expect(result.breakdownId).toBe('tb-456');
    });

    it('应该拒绝无效的数据结构', async () => {
      const invalidData = {
        id: 'tb-789',
        title: 'Invalid Task',
        // 缺少 taskTree
      };

      const mockBreakdownStore = {
        saveBreakdown: vi.fn().mockResolvedValue(undefined),
        setCurrentBreakdown: vi.fn(),
        setPanelOpen: vi.fn(),
      };

      const { useTaskBreakdownStore } = await import('@/stores/taskBreakdownStore');
      (useTaskBreakdownStore as any).getState = vi.fn().mockReturnValue(mockBreakdownStore);

      const result = await handleTaskBreakdownResult(JSON.stringify(invalidData), 'agent-1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid breakdown data structure');
      expect(mockBreakdownStore.saveBreakdown).not.toHaveBeenCalled();
    });

    it('应该处理解析错误', async () => {
      const invalidJson = '{ invalid json }';

      const result = await handleTaskBreakdownResult(invalidJson, 'agent-1');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('应该处理空结果', async () => {
      const result = await handleTaskBreakdownResult('', 'agent-1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('AI 返回结果为空或过短，无法解析任务拆解');
    });

    it('当有提案关联时应该打开提案文件', async () => {
      const jsonData = {
        id: 'tb-999',
        title: 'Task With Proposal',
        taskTree: { title: 'Root', children: [] },
        proposalReference: { proposalId: 'prop-123' },
      };

      const mockBreakdownStore = {
        saveBreakdown: vi.fn().mockResolvedValue(undefined),
        setCurrentBreakdown: vi.fn(),
        setPanelOpen: vi.fn(),
      };

      const { useTaskBreakdownStore } = await import('@/stores/taskBreakdownStore');
      (useTaskBreakdownStore as any).getState = vi.fn().mockReturnValue(mockBreakdownStore);

      const mockFileStore = {
        rootPath: '/project',
      };

      const { useFileStore } = await import('@/stores/fileStore');
      (useFileStore as any).getState = vi.fn().mockReturnValue(mockFileStore);

      const { openFileFromPath } = await import('@/utils/fileActions');
      (openFileFromPath as any).mockResolvedValue(true);

      const result = await handleTaskBreakdownResult(JSON.stringify(jsonData), 'agent-1');

      expect(result.success).toBe(true);
      expect(openFileFromPath).toHaveBeenCalledWith('/project/.ifai/changes/prop-123/proposal.md');
    });
  });
});
