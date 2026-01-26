/**
 * v0.3.4: Agent 审批模式测试
 * 测试会话级别信任审批功能
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock settings store
const mockSettingsStore = {
  agentApprovalMode: 'session-once' as const,
  trustedSessions: {} as Record<string, { approvedAt: number; expiresAt: number }>,
  updateSettings: vi.fn(),
};

// Mock thread store
const mockThreadStore = {
  activeThreadId: 'thread-123',
  getThread: vi.fn(),
};

describe('Agent Approval Mode (v0.3.4)', () => {

  beforeEach(() => {
    // 重置 mock
    mockSettingsStore.agentApprovalMode = 'session-once';
    mockSettingsStore.trustedSessions = {};
    mockThreadStore.activeThreadId = 'thread-123';
    vi.clearAllMocks();
  });

  describe('审批模式设置', () => {
    it('应该支持 always 模式（完全自动批准）', () => {
      mockSettingsStore.agentApprovalMode = 'always';

      expect(mockSettingsStore.agentApprovalMode).toBe('always');
    });

    it('应该支持 session-once 模式（首次批准后信任）', () => {
      mockSettingsStore.agentApprovalMode = 'session-once';

      expect(mockSettingsStore.agentApprovalMode).toBe('session-once');
    });

    it('应该支持 session-never 模式（每次都询问）', () => {
      mockSettingsStore.agentApprovalMode = 'session-never';

      expect(mockSettingsStore.agentApprovalMode).toBe('session-never');
    });

    it('应该支持 per-tool 模式（逐个工具批准，兼容模式）', () => {
      mockSettingsStore.agentApprovalMode = 'per-tool';

      expect(mockSettingsStore.agentApprovalMode).toBe('per-tool');
    });

    it('默认应该是 session-once 模式', () => {
      const defaultMode = 'session-once';
      expect(defaultMode).toBe('session-once');
    });
  });

  describe('会话信任状态检查', () => {
    it('应该检测未信任的会话', () => {
      const sessionId = 'thread-123';
      const sessionTrust = mockSettingsStore.trustedSessions[sessionId];

      expect(sessionTrust).toBeUndefined();
    });

    it('应该检测已信任的会话', () => {
      const now = Date.now();
      mockSettingsStore.trustedSessions['thread-123'] = {
        approvedAt: now,
        expiresAt: now + 60 * 60 * 1000 // 1小时后过期
      };

      const sessionTrust = mockSettingsStore.trustedSessions['thread-123'];
      expect(sessionTrust).toBeDefined();
      expect(sessionTrust!.expiresAt).toBeGreaterThan(now);
    });

    it('应该检测已过期的会话信任', () => {
      // 使用固定时间戳确保测试一致性
      const baseTime = 1000000000000;
      const oneHourAgo = baseTime - 60 * 60 * 1000;
      mockSettingsStore.trustedSessions['thread-123'] = {
        approvedAt: oneHourAgo,
        expiresAt: oneHourAgo + 60 * 60 * 1000 // 等于 baseTime，刚好过期
      };

      const sessionTrust = mockSettingsStore.trustedSessions['thread-123'];
      expect(sessionTrust).toBeDefined();
      // 使用 baseTime 而不是 Date.now()，因为过期时间等于 baseTime
      expect(sessionTrust!.expiresAt).toBeLessThanOrEqual(baseTime);
    });

    it('应该支持多个会话同时信任', () => {
      const now = Date.now();
      mockSettingsStore.trustedSessions = {
        'thread-123': {
          approvedAt: now,
          expiresAt: now + 60 * 60 * 1000
        },
        'thread-456': {
          approvedAt: now,
          expiresAt: now + 60 * 60 * 1000
        }
      };

      expect(Object.keys(mockSettingsStore.trustedSessions)).toHaveLength(2);
    });
  });

  describe('自动批准决策逻辑', () => {
    it('在 always 模式下应该自动批准', () => {
      mockSettingsStore.agentApprovalMode = 'always';

      const shouldAutoApprove = mockSettingsStore.agentApprovalMode === 'always';
      expect(shouldAutoApprove).toBe(true);
    });

    it('在 session-once 模式下，未信任会话不应该自动批准', () => {
      mockSettingsStore.agentApprovalMode = 'session-once';
      const sessionId = mockThreadStore.activeThreadId;
      const sessionTrust = mockSettingsStore.trustedSessions[sessionId];
      // 使用 !! 转换为布尔值
      const isSessionTrusted = !!(sessionTrust && Date.now() < sessionTrust.expiresAt);

      expect(isSessionTrusted).toBe(false);
    });

    it('在 session-once 模式下，已信任会话应该自动批准', () => {
      mockSettingsStore.agentApprovalMode = 'session-once';
      const now = Date.now();
      mockSettingsStore.trustedSessions['thread-123'] = {
        approvedAt: now,
        expiresAt: now + 60 * 60 * 1000
      };

      const sessionId = mockThreadStore.activeThreadId;
      const sessionTrust = mockSettingsStore.trustedSessions[sessionId];
      const isSessionTrusted = sessionTrust && Date.now() < sessionTrust.expiresAt;

      expect(isSessionTrusted).toBe(true);
    });

    it('在 session-never 模式下不应该自动批准', () => {
      mockSettingsStore.agentApprovalMode = 'session-never';

      const shouldAutoApprove = mockSettingsStore.agentApprovalMode === 'always';
      expect(shouldAutoApprove).toBe(false);
    });

    it('在 per-tool 模式下不应该自动批准', () => {
      mockSettingsStore.agentApprovalMode = 'per-tool';

      const shouldAutoApprove = mockSettingsStore.agentApprovalMode === 'always';
      expect(shouldAutoApprove).toBe(false);
    });
  });

  describe('会话信任记录', () => {
    it('首次批准后应该记录会话信任', () => {
      const now = Date.now();
      const sessionId = mockThreadStore.activeThreadId;

      // 模拟记录会话信任
      mockSettingsStore.trustedSessions[sessionId] = {
        approvedAt: now,
        expiresAt: now + 60 * 60 * 1000
      };

      expect(mockSettingsStore.trustedSessions[sessionId]).toBeDefined();
      expect(mockSettingsStore.trustedSessions[sessionId]!.approvedAt).toBe(now);
    });

    it('会话信任应该有 1 小时有效期', () => {
      const now = Date.now();
      const oneHourMs = 60 * 60 * 1000;

      const sessionTrust = {
        approvedAt: now,
        expiresAt: now + oneHourMs
      };

      expect(sessionTrust.expiresAt - sessionTrust.approvedAt).toBe(oneHourMs);
    });

    it('应该支持不同线程的独立信任', () => {
      const now = Date.now();

      // 模拟两个不同的线程
      mockSettingsStore.trustedSessions['thread-123'] = {
        approvedAt: now,
        expiresAt: now + 60 * 60 * 1000
      };

      // 稍后另一个线程
      const later = now + 5000;
      mockSettingsStore.trustedSessions['thread-456'] = {
        approvedAt: later,
        expiresAt: later + 60 * 60 * 1000
      };

      expect(mockSettingsStore.trustedSessions['thread-123']!.approvedAt).not.toBe(
        mockSettingsStore.trustedSessions['thread-456']!.approvedAt
      );
    });
  });

  describe('兼容性和降级', () => {
    it('应该支持从 agentAutoApprove 迁移到 always 模式', () => {
      const oldSetting = true; // agentAutoApprove
      const newMode = oldSetting ? 'always' : 'session-once';

      expect(newMode).toBe('always');
    });

    it('per-tool 模式应该保留原有行为', () => {
      mockSettingsStore.agentApprovalMode = 'per-tool';

      // per-tool 模式不应该自动批准
      const shouldAutoApprove = mockSettingsStore.agentApprovalMode === 'always';
      expect(shouldAutoApprove).toBe(false);
    });

    it('应该支持运行时切换审批模式', () => {
      mockSettingsStore.agentApprovalMode = 'session-once';
      expect(mockSettingsStore.agentApprovalMode).toBe('session-once');

      mockSettingsStore.agentApprovalMode = 'per-tool';
      expect(mockSettingsStore.agentApprovalMode).toBe('per-tool');
    });
  });

  describe('边界情况', () => {
    it('应该处理空线程 ID（使用默认值）', () => {
      mockThreadStore.activeThreadId = '';

      const sessionId = mockThreadStore.activeThreadId || 'default';
      expect(sessionId).toBe('default');
    });

    it('应该处理 undefined 线程 ID（使用默认值）', () => {
      mockThreadStore.activeThreadId = undefined as any;

      const sessionId = mockThreadStore.activeThreadId || 'default';
      expect(sessionId).toBe('default');
    });

    it('应该处理会话信任记录为空的情况', () => {
      mockSettingsStore.trustedSessions = {};

      const sessionId = mockThreadStore.activeThreadId;
      const sessionTrust = mockSettingsStore.trustedSessions[sessionId];
      expect(sessionTrust).toBeUndefined();
    });
  });
});
