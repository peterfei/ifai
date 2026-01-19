import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  handleProposalGeneratorResult,
  shouldHandleProposalResult,
  validateProposalResult,
} from '../proposalResultHandler';

// Mock dependencies
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('@/utils/proposalMarkdownParser', () => ({
  parseProposalFromMarkdown: vi.fn(),
}));

vi.mock('@/stores/proposalStore', () => ({
  useProposalStore: {
    getState: vi.fn(),
  },
}));

describe('ProposalResultHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('shouldHandleProposalResult', () => {
    it('当 agent 类型为 proposal-generator 且有结果时应返回 true', () => {
      expect(shouldHandleProposalResult('proposal-generator', 'some result')).toBe(true);
    });

    it('当 agent 类型不是 proposal-generator 时应返回 false', () => {
      expect(shouldHandleProposalResult('explore', 'some result')).toBe(false);
      expect(shouldHandleProposalResult('task-breakdown', 'some result')).toBe(false);
    });

    it('当结果为空时应返回 false', () => {
      expect(shouldHandleProposalResult('proposal-generator', '')).toBe(false);
      expect(shouldHandleProposalResult('proposal-generator', undefined as any)).toBe(false);
    });
  });

  describe('validateProposalResult', () => {
    it('应该验证有效的 proposal 结果', () => {
      const validResult = `# Proposal Title

## Why
This is the reason

## What Changes
- Change 1
- Change 2

## Impact
Impact description`;

      const result = validateProposalResult(validResult);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('应该拒绝空结果', () => {
      const result = validateProposalResult('');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Result is empty');
    });

    it('应该拒绝过短的结果', () => {
      const result = validateProposalResult('short');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Result is too short to be a valid proposal');
    });

    it('应该拒绝缺少 Markdown 结构的结果', () => {
      // 使用足够长但缺少 Markdown 结构的文本
      const plainText = 'This is just plain text without any structure. '.repeat(5);
      const result = validateProposalResult(plainText);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Result does not appear to be a valid proposal format');
    });
  });

  describe('handleProposalGeneratorResult', () => {
    it('应该成功处理有效的 proposal 结果', async () => {
      const mockProposalData = {
        changeId: 'prop-123',
        why: 'Reason',
        whatChanges: [],
        impact: '',
        tasks: [],
        specDeltas: [],
      };

      const { parseProposalFromMarkdown } = await import('@/utils/proposalMarkdownParser');
      (parseProposalFromMarkdown as any).mockReturnValue(mockProposalData);

      const mockProposalStore = {
        createProposal: vi.fn().mockResolvedValue({ id: 'prop-123' }),
        openReviewModal: vi.fn(),
      };

      const { useProposalStore } = await import('@/stores/proposalStore');
      (useProposalStore as any).getState = vi.fn().mockReturnValue(mockProposalStore);

      const result = await handleProposalGeneratorResult('# Proposal\nContent', 'agent-1');

      expect(result.success).toBe(true);
      expect(result.proposalId).toBe('prop-123');
      expect(mockProposalStore.createProposal).toHaveBeenCalled();
    });

    it('应该处理解析失败的情况', async () => {
      const { parseProposalFromMarkdown } = await import('@/utils/proposalMarkdownParser');
      (parseProposalFromMarkdown as any).mockReturnValue(null);

      const result = await handleProposalGeneratorResult('invalid content', 'agent-1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to parse proposal from Markdown');
    });

    it('应该处理异常情况', async () => {
      const { parseProposalFromMarkdown } = await import('@/utils/proposalMarkdownParser');
      (parseProposalFromMarkdown as any).mockImplementation(() => {
        throw new Error('Parse error');
      });

      const result = await handleProposalGeneratorResult('content', 'agent-1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Parse error');
    });
  });
});
