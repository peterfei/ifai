/**
 * 自动审批策略测试 (TDD)
 *
 * 验证 shouldAutoApprove 规则链在不同条件下的行为：
 *
 * AA-1: vibe 模式 + safe 工具 → 应自动审批
 * AA-2: standard 模式 + safe 工具 + 无 global auto → 不应自动审批
 * AA-3: standard 模式 + safe 工具 + global auto → 应自动审批
 * AA-4: 任何模式 + dangerous 工具 → 不应自动审批（除非特殊条件）
 * AA-5: ReadOnly 工具在 TOOL_PERMISSIONS 中 → needsBackendApproval = false
 * AA-6: WorkspaceWrite 工具在 TOOL_PERMISSIONS 中 → needsBackendApproval = true
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------- Mock ----------

// 在导入 ToolApprovalRegistry 前，需要先 mock 其依赖
vi.mock('../../../stores/settingsStore', () => ({}));

import { toolApprovalRegistry, shouldAutoApprove, ApprovalContext } from '../../../core/approval/ToolApprovalRegistry';
import { TOOL_PERMISSIONS } from '../../../core/stream-schema-generated';

// ---------- Tests ----------

describe('自动审批策略 (shouldAutoApprove)', () => {
  beforeEach(() => {
    // 每次测试前重新初始化沙箱检测
    toolApprovalRegistry.initSandboxDetection();
  });

  // AA-1: vibe 模式 + safe 工具 → 应自动审批
  it('AA-1: vibe 模式 + safe 工具 (agent_read_file) → 应自动审批', () => {
    const ctx: ApprovalContext = {
      settings: { agentAutoApprove: false },
      editorMode: 'vibe',
      isSessionTrusted: false,
      toolName: 'agent_read_file',
    };

    const result = shouldAutoApprove(ctx);
    expect(result).toBe(true);
  });

  // AA-2: standard 模式 + safe 工具 + 无 global auto → 不应自动审批
  it('AA-2: standard 模式 + safe 工具 + 无 global auto → 不应自动审批', () => {
    const ctx: ApprovalContext = {
      settings: { agentAutoApprove: false },
      editorMode: 'standard',
      isSessionTrusted: false,
      toolName: 'agent_read_file',
    };

    const result = shouldAutoApprove(ctx);
    expect(result).toBe(false);
  });

  // AA-3: standard 模式 + safe 工具 + global auto → 应自动审批
  it('AA-3: standard 模式 + safe 工具 + global auto → 应自动审批', () => {
    const ctx: ApprovalContext = {
      settings: { agentAutoApprove: true },
      editorMode: 'standard',
      isSessionTrusted: false,
      toolName: 'agent_read_file',
    };

    const result = shouldAutoApprove(ctx);
    expect(result).toBe(true);
  });

  // AA-4: vibe 模式 + dangerous 工具 → 不应自动审批
  it('AA-4: vibe 模式 + dangerous 工具 (agent_write_file) → 不应自动审批', () => {
    const ctx: ApprovalContext = {
      settings: { agentAutoApprove: false },
      editorMode: 'vibe',
      isSessionTrusted: false,
      toolName: 'agent_write_file',
    };

    const result = shouldAutoApprove(ctx);
    expect(result).toBe(false);
  });

  // AA-5: ReadOnly 工具在 TOOL_PERMISSIONS → needsBackendApproval = false
  it('AA-5: agent_scan_project 在 TOOL_PERMISSIONS 中为 ReadOnly → needsBackendApproval=false', () => {
    const perm = TOOL_PERMISSIONS['agent_scan_project'];
    expect(perm).toBe('ReadOnly');

    const needsBackendApproval = perm !== undefined && perm !== 'ReadOnly';
    expect(needsBackendApproval).toBe(false);
  });

  // AA-6: WorkspaceWrite 工具 → needsBackendApproval = true
  it('AA-6: agent_write_file 在 TOOL_PERMISSIONS 中为 WorkspaceWrite → needsBackendApproval=true', () => {
    const perm = TOOL_PERMISSIONS['agent_write_file'];
    expect(perm).toBe('WorkspaceWrite');

    const needsBackendApproval = perm !== undefined && perm !== 'ReadOnly';
    expect(needsBackendApproval).toBe(true);
  });

  // AA-7: agent_list_dir 为 safe → vibe 模式自动审批
  it('AA-7: agent_list_dir 在 vibe 模式下应自动审批', () => {
    const ctx: ApprovalContext = {
      settings: { agentAutoApprove: false },
      editorMode: 'vibe',
      isSessionTrusted: false,
      toolName: 'agent_list_dir',
    };

    const result = shouldAutoApprove(ctx);
    expect(result).toBe(true);
  });

  // AA-8: read_file 为 safe → vibe 模式自动审批
  it('AA-8: read_file 在 vibe 模式下应自动审批', () => {
    const ctx: ApprovalContext = {
      settings: { agentAutoApprove: false },
      editorMode: 'vibe',
      isSessionTrusted: false,
      toolName: 'read_file',
    };

    const result = shouldAutoApprove(ctx);
    expect(result).toBe(true);
  });
});
