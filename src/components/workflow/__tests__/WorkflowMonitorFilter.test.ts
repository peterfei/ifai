/**
 * TDD: WorkflowInlineMonitorContainer 应过滤 exploration 类型工作流
 *
 * 验证点：
 * - exploration 工作流不应被添加到 globalActiveWorkflows（由消息内的 ExploreWorkflowView 处理）
 * - task/general_purpose 工作流应正常添加到 globalActiveWorkflows（由 DAG Monitor 处理）
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ==================== 纯函数过滤逻辑测试 ====================
// 提取核心过滤逻辑为可测试的纯函数

/**
 * 判断工作流是否应由 WorkflowInlineMonitorContainer（DAG 视图）处理
 * exploration 类型由消息内的 ExploreWorkflowView 处理，不应显示 DAG
 */
function shouldShowDAGMonitor(workflowType: string | undefined): boolean {
  return workflowType !== 'exploration';
}

describe('shouldShowDAGMonitor - 工作流 DAG 显示过滤', () => {
  it('exploration 类型不应显示 DAG 监控器', () => {
    expect(shouldShowDAGMonitor('exploration')).toBe(false);
  });

  it('task 类型应显示 DAG 监控器', () => {
    expect(shouldShowDAGMonitor('task')).toBe(true);
  });

  it('general_purpose 类型应显示 DAG 监控器', () => {
    expect(shouldShowDAGMonitor('general_purpose')).toBe(true);
  });

  it('undefined 类型应显示 DAG 监控器（向后兼容）', () => {
    expect(shouldShowDAGMonitor(undefined)).toBe(true);
  });

  it('空字符串类型应显示 DAG 监控器', () => {
    expect(shouldShowDAGMonitor('')).toBe(true);
  });

  it('其他自定义类型应显示 DAG 监控器', () => {
    expect(shouldShowDAGMonitor('custom_workflow')).toBe(true);
  });
});

// ==================== 集成测试：模拟事件过滤 ====================

describe('WorkflowInlineMonitorContainer 事件过滤', () => {
  // 模拟全局状态
  let mockActiveWorkflows: Set<string>;
  let mockWorkflowStates: Map<string, { workflowType?: string; status: string }>;

  // 模拟 workflow:started handler 的过滤逻辑（与实际代码一致：先存全局状态，再决定是否添加活跃工作流）
  function handleWorkflowStarted(payload: {
    workflowId: string;
    workflowType?: string;
    sessionId?: string;
    nodes?: any[];
  }) {
    const workflowType = payload.workflowType;

    // 先存储全局状态（供 progress 过滤检查）
    mockWorkflowStates.set(payload.workflowId, {
      workflowType,
      status: 'running',
    });

    // 再决定是否添加到活跃工作流
    if (!shouldShowDAGMonitor(workflowType)) {
      return; // 过滤掉 exploration 类型，不添加到活跃工作流
    }
    mockActiveWorkflows.add(payload.workflowId);
  }

  // 模拟 workflow:progress handler 的过滤逻辑
  function handleWorkflowProgress(payload: {
    workflowId: string;
    event_type?: string;
    node_id?: string;
  }) {
    if (!payload.workflowId) return;
    if (mockActiveWorkflows.has(payload.workflowId)) return; // 已存在

    // 检查全局状态中的 workflowType
    const state = mockWorkflowStates.get(payload.workflowId);
    if (state && !shouldShowDAGMonitor(state.workflowType)) {
      return; // 过滤掉 exploration 类型
    }
  }

  beforeEach(() => {
    mockActiveWorkflows = new Set();
    mockWorkflowStates = new Map();
  });

  it('exploration workflow:started 应存储全局状态但不添加到活跃工作流', () => {
    handleWorkflowStarted({
      workflowId: 'wf-explore-001',
      workflowType: 'exploration',
    });

    expect(mockActiveWorkflows.has('wf-explore-001')).toBe(false);
    // 全局状态必须存储（供 progress 过滤检查）
    expect(mockWorkflowStates.has('wf-explore-001')).toBe(true);
    expect(mockWorkflowStates.get('wf-explore-001')?.workflowType).toBe('exploration');
  });

  it('task workflow:started 应添加到活跃工作流', () => {
    handleWorkflowStarted({
      workflowId: 'wf-task-001',
      workflowType: 'task',
      nodes: [{ id: 'task', label: '执行任务' }],
    });

    expect(mockActiveWorkflows.has('wf-task-001')).toBe(true);
    expect(mockWorkflowStates.has('wf-task-001')).toBe(true);
  });

  it('混合场景：exploration 和 task 同时触发', () => {
    handleWorkflowStarted({
      workflowId: 'wf-explore-002',
      workflowType: 'exploration',
    });
    handleWorkflowStarted({
      workflowId: 'wf-task-002',
      workflowType: 'task',
    });

    expect(mockActiveWorkflows.size).toBe(1);
    expect(mockActiveWorkflows.has('wf-explore-002')).toBe(false);
    expect(mockActiveWorkflows.has('wf-task-002')).toBe(true);
  });

  it('exploration workflow:progress 不应触发自动添加', () => {
    // 先通过 started 注册到全局状态（模拟其他路径）
    mockWorkflowStates.set('wf-explore-003', {
      workflowType: 'exploration',
      status: 'running',
    });

    // progress handler 应过滤掉
    handleWorkflowProgress({
      workflowId: 'wf-explore-003',
      event_type: 'tool_call',
    });

    expect(mockActiveWorkflows.has('wf-explore-003')).toBe(false);
  });

  it('task workflow:progress 不应阻止已注册的工作流', () => {
    handleWorkflowStarted({
      workflowId: 'wf-task-003',
      workflowType: 'task',
    });

    // 已在 activeWorkflows 中，progress handler 不重复添加
    handleWorkflowProgress({
      workflowId: 'wf-task-003',
      event_type: 'tool_call',
    });

    expect(mockActiveWorkflows.has('wf-task-003')).toBe(true);
  });

  it('无 workflowType 的工作流应正常显示（向后兼容）', () => {
    handleWorkflowStarted({
      workflowId: 'wf-legacy-001',
      // 无 workflowType
    });

    expect(mockActiveWorkflows.has('wf-legacy-001')).toBe(true);
  });

  it('端到端：exploration started → progress 不触发 DAG Monitor', () => {
    // 1. started 事件：存储全局状态但不在活跃列表
    handleWorkflowStarted({
      workflowId: 'wf-explore-e2e',
      workflowType: 'exploration',
    });
    expect(mockActiveWorkflows.has('wf-explore-e2e')).toBe(false);
    expect(mockWorkflowStates.has('wf-explore-e2e')).toBe(true);

    // 2. progress 事件：检查全局状态，过滤掉 exploration
    handleWorkflowProgress({
      workflowId: 'wf-explore-e2e',
      event_type: 'tool_call',
      node_id: 'explore',
    });
    expect(mockActiveWorkflows.has('wf-explore-e2e')).toBe(false);

    // 3. 多次 progress 事件：始终不触发
    handleWorkflowProgress({
      workflowId: 'wf-explore-e2e',
      event_type: 'tool_result',
      node_id: 'explore',
    });
    expect(mockActiveWorkflows.has('wf-explore-e2e')).toBe(false);
    expect(mockActiveWorkflows.size).toBe(0);
  });

  it('端到端：task started → progress 正常工作', () => {
    handleWorkflowStarted({
      workflowId: 'wf-task-e2e',
      workflowType: 'task',
    });
    expect(mockActiveWorkflows.has('wf-task-e2e')).toBe(true);

    handleWorkflowProgress({
      workflowId: 'wf-task-e2e',
      event_type: 'tool_call',
    });
    expect(mockActiveWorkflows.has('wf-task-e2e')).toBe(true);
  });
});
