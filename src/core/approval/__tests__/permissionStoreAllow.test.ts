/**
 * Phase 3 测试: permission-store-allow 规则
 *
 * 测试覆盖 (来自提案):
 * - TR-1: permission-store-allow 命中 → 应自动审批
 * - TR-2: permission-store-allow 未命中 → 不应自动审批
 * - TR-3: 规则优先级为 0.5（优先于 sandbox-destructive-block）
 * - TR-4: 同步 shouldAutoApprove 正确跳过此规则
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { toolApprovalRegistry, shouldAutoApprove, type ApprovalContext } from '../ToolApprovalRegistry';

describe('permission-store-allow 规则', () => {
  beforeEach(() => {
    // 重置 mock
    (toolApprovalRegistry as any).checkPermissionStore = undefined;
    toolApprovalRegistry.initSandboxDetection();
  });

  /* ===== TR-3: 规则优先级 ===== */

  it('TR-3: permission-store-allow 规则优先级为 0.5（优先于 sandbox-destructive-block）', () => {
    const rules = (toolApprovalRegistry as any).sortedRules as Array<{ name: string; priority: number }>;

    const rule = rules.find((r) => r.name === 'permission-store-allow');
    expect(rule).toBeDefined();
    expect(rule!.priority).toBe(0.5);
  });

  /* ===== TR-1: 命中场景 ===== */

  it('TR-1: permission-store-allow 命中 → 应自动审批', async () => {
    // 模拟 Rust 返回 "true" (白名单命中)
    (toolApprovalRegistry as any).checkPermissionStore = vi.fn().mockResolvedValue(true);

    const ctx: ApprovalContext = {
      settings: { agentAutoApprove: false },
      editorMode: 'standard',
      isSessionTrusted: false,
      toolName: 'agent_write_file', // dangerous 工具
    };

    const result = await toolApprovalRegistry.shouldAutoApproveAsync(ctx);
    expect(result).toBe(true);
    expect((toolApprovalRegistry as any).checkPermissionStore).toHaveBeenCalledWith('agent_write_file');
  });

  /* ===== TR-2: 未命中场景 ===== */

  it('TR-2: permission-store-allow 未命中 → 不应自动审批', async () => {
    // 模拟 Rust 返回 "false" (白名单未命中)
    (toolApprovalRegistry as any).checkPermissionStore = vi.fn().mockResolvedValue(false);

    const ctx: ApprovalContext = {
      settings: { agentAutoApprove: false },
      editorMode: 'standard',
      isSessionTrusted: false,
      toolName: 'agent_write_file', // dangerous 工具
    };

    const result = await toolApprovalRegistry.shouldAutoApproveAsync(ctx);
    expect(result).toBe(false);
  });

  /* ===== TR-4: 同步方法跳过 ===== */

  it('TR-4: 同步 shouldAutoApprove 跳过 permission-store-allow 规则', () => {
    // 即使 checkPermissionStore 设为返回 true，同步方法也不应调用它
    const checkMock = vi.fn().mockResolvedValue(true);
    (toolApprovalRegistry as any).checkPermissionStore = checkMock;

    const ctx: ApprovalContext = {
      settings: { agentAutoApprove: false },
      editorMode: 'standard',
      isSessionTrusted: false,
      toolName: 'agent_write_file',
    };

    const result = shouldAutoApprove(ctx);
    expect(result).toBe(false);
    expect(checkMock).not.toHaveBeenCalled();
  });

  /* ===== 安全工具不触发 permission-store-allow ===== */

  it('safe 工具不触发 permission-store-allow 检查', async () => {
    const checkMock = vi.fn().mockResolvedValue(true);
    (toolApprovalRegistry as any).checkPermissionStore = checkMock;

    const ctx: ApprovalContext = {
      settings: { agentAutoApprove: false },
      editorMode: 'standard',
      isSessionTrusted: false,
      toolName: 'agent_read_file', // safe 工具
    };

    // safe 工具在 standard 模式下不匹配任何规则，但 requiresApproval:false fallback 会自动审批
    const result = await toolApprovalRegistry.shouldAutoApproveAsync(ctx);
    expect(result).toBe(true);
    // permission-store-allow 不应对 safe 工具触发（when.category 不匹配）
    expect(checkMock).not.toHaveBeenCalled();
  });
});
