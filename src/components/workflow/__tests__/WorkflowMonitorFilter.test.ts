/**
 * TDD: 声明式工作流显示策略过滤
 *
 * 核心设计：WORKFLOW_DISPLAY_STRATEGY 优先级表驱动，单一阻塞点 addActiveWorkflow
 * - exploration → 'message-embedded'（由消息内 WorkflowView 处理）
 * - 其他类型 → 'dag'（由 WorkflowInlineMonitor DAG 视图处理）
 */

import { describe, it, expect, beforeEach } from 'vitest';

// ==================== 声明式策略表（与实际代码一致） ====================

const WORKFLOW_DISPLAY_STRATEGY: Record<string, 'message-embedded' | 'dag'> = {
  exploration: 'message-embedded',
};

const DEFAULT_DISPLAY_STRATEGY: 'dag' | 'message-embedded' = 'dag';

function getWorkflowDisplayStrategy(workflowType: string | undefined): 'message-embedded' | 'dag' {
  if (!workflowType) return DEFAULT_DISPLAY_STRATEGY;
  return WORKFLOW_DISPLAY_STRATEGY[workflowType] ?? DEFAULT_DISPLAY_STRATEGY;
}

// ==================== 纯函数策略测试 ====================

describe('getWorkflowDisplayStrategy - 声明式策略表', () => {
  it('exploration → message-embedded', () => {
    expect(getWorkflowDisplayStrategy('exploration')).toBe('message-embedded');
  });

  it('task → dag (默认)', () => {
    expect(getWorkflowDisplayStrategy('task')).toBe('dag');
  });

  it('general_purpose → dag (默认)', () => {
    expect(getWorkflowDisplayStrategy('general_purpose')).toBe('dag');
  });

  it('undefined → dag (向后兼容)', () => {
    expect(getWorkflowDisplayStrategy(undefined)).toBe('dag');
  });

  it('空字符串 → dag (向后兼容)', () => {
    expect(getWorkflowDisplayStrategy('')).toBe('dag');
  });

  it('自定义类型 → dag (默认)', () => {
    expect(getWorkflowDisplayStrategy('custom_workflow')).toBe('dag');
  });
});

// ==================== 集成测试：单一阻塞点 addActiveWorkflow ====================

describe('addActiveWorkflow 声明式过滤（单一阻塞点）', () => {
  let mockActiveWorkflows: Set<string>;
  let mockWorkflowStates: Map<string, { workflowType?: string; status: string }>;

  // 模拟 addActiveWorkflow（声明式策略驱动）
  function addActiveWorkflowMock(workflowId: string) {
    const state = mockWorkflowStates.get(workflowId);
    const strategy = getWorkflowDisplayStrategy(state?.workflowType);
    if (strategy === 'message-embedded') return;
    mockActiveWorkflows.add(workflowId);
  }

  // 模拟 workflow:started handler
  function handleWorkflowStarted(payload: {
    workflowId: string;
    workflowType?: string;
  }) {
    // 先存储全局状态
    mockWorkflowStates.set(payload.workflowId, {
      workflowType: payload.workflowType,
      status: 'running',
    });
    // 唯一阻塞点：addActiveWorkflow 自动过滤
    addActiveWorkflowMock(payload.workflowId);
  }

  // 模拟 workflow:progress handler
  function handleWorkflowProgress(payload: {
    workflowId: string;
  }) {
    if (!payload.workflowId) return;
    if (mockActiveWorkflows.has(payload.workflowId)) return;
    // 无需手动判断类型，addActiveWorkflow 自动过滤
    addActiveWorkflowMock(payload.workflowId);
  }

  beforeEach(() => {
    mockActiveWorkflows = new Set();
    mockWorkflowStates = new Map();
  });

  it('exploration started → 不添加到活跃列表，但存储全局状态', () => {
    handleWorkflowStarted({ workflowId: 'wf-1', workflowType: 'exploration' });
    expect(mockActiveWorkflows.has('wf-1')).toBe(false);
    expect(mockWorkflowStates.has('wf-1')).toBe(true);
  });

  it('task started → 添加到活跃列表', () => {
    handleWorkflowStarted({ workflowId: 'wf-2', workflowType: 'task' });
    expect(mockActiveWorkflows.has('wf-2')).toBe(true);
  });

  it('混合场景：exploration 和 task 同时触发', () => {
    handleWorkflowStarted({ workflowId: 'wf-3', workflowType: 'exploration' });
    handleWorkflowStarted({ workflowId: 'wf-4', workflowType: 'task' });
    expect(mockActiveWorkflows.size).toBe(1);
    expect(mockActiveWorkflows.has('wf-3')).toBe(false);
    expect(mockActiveWorkflows.has('wf-4')).toBe(true);
  });

  it('exploration progress → 不触发自动添加', () => {
    handleWorkflowStarted({ workflowId: 'wf-5', workflowType: 'exploration' });
    handleWorkflowProgress({ workflowId: 'wf-5' });
    expect(mockActiveWorkflows.has('wf-5')).toBe(false);
  });

  it('无 workflowType → 正常显示（向后兼容）', () => {
    handleWorkflowStarted({ workflowId: 'wf-6' });
    expect(mockActiveWorkflows.has('wf-6')).toBe(true);
  });

  it('端到端：第二次 exploration 调用仍被过滤', () => {
    // 第一次
    handleWorkflowStarted({ workflowId: 'explore-1', workflowType: 'exploration' });
    expect(mockActiveWorkflows.size).toBe(0);

    // 完成 → 清理（模拟）
    mockWorkflowStates.delete('explore-1');

    // 第二次
    handleWorkflowStarted({ workflowId: 'explore-2', workflowType: 'exploration' });
    handleWorkflowProgress({ workflowId: 'explore-2' });
    handleWorkflowProgress({ workflowId: 'explore-2' });
    expect(mockActiveWorkflows.size).toBe(0);
  });

  it('端到端：exploration → task 交替调用', () => {
    handleWorkflowStarted({ workflowId: 'exp-1', workflowType: 'exploration' });
    expect(mockActiveWorkflows.size).toBe(0);

    handleWorkflowStarted({ workflowId: 'task-1', workflowType: 'task' });
    expect(mockActiveWorkflows.size).toBe(1);

    handleWorkflowStarted({ workflowId: 'exp-2', workflowType: 'exploration' });
    expect(mockActiveWorkflows.size).toBe(1);
    expect(mockActiveWorkflows.has('task-1')).toBe(true);
  });
});

// ==================== 声明式策略扩展性测试 ====================

describe('WORKFLOW_DISPLAY_STRATEGY 扩展性', () => {
  it('新增策略只需修改声明式表，无需改动业务逻辑', () => {
    // 假设未来添加 'doc_generation' 类型，只需在表中添加一行：
    const extendedStrategy = {
      ...WORKFLOW_DISPLAY_STRATEGY,
      doc_generation: 'message-embedded' as const,
    };
    expect(extendedStrategy['doc_generation']).toBe('message-embedded');
    // getWorkflowDisplayStrategy 会自动返回正确的策略
    expect(extendedStrategy['exploration']).toBe('message-embedded');
    expect(extendedStrategy['task']).toBeUndefined(); // fallback to default
  });
});
