/**
 * workflowStore 测试
 *
 * WF-1 ~ WF-11: 基于 blockingStepRegistry 的工作流引擎
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useWorkflowStore } from '../workflowStore';
import { blockingStepRegistry } from '../../gui/registry/blocking-step-registry';

describe('workflowStore', () => {
  beforeEach(() => {
    useWorkflowStore.setState({ activeWorkflow: null, workflowHistory: [] });
    blockingStepRegistry.clear();
  });

  // WF-1: 初始 activeWorkflow=null
  it('WF-1: 初始无活跃工作流', () => {
    expect(useWorkflowStore.getState().activeWorkflow).toBe(null);
  });

  // WF-2: createWorkflow(steps) 创建并激活
  it('WF-2: createWorkflow 创建并激活工作流', () => {
    const id = useWorkflowStore.getState().createWorkflow([
      { id: 's1', type: 'approval', payload: { title: '审批1' } },
      { id: 's2', type: 'interaction', payload: { question: '确认?' } },
    ]);
    expect(id).toBeTruthy();
    const wf = useWorkflowStore.getState().activeWorkflow!;
    expect(wf.steps.length).toBe(2);
    expect(wf.currentStepIndex).toBe(0);
    expect(wf.status).toBe('running');
  });

  // WF-3: 步骤包含 id/type/payload
  it('WF-3: 步骤结构正确', () => {
    useWorkflowStore.getState().createWorkflow([
      { id: 'step-a', type: 'approval', payload: { risk: 'high' } },
    ]);
    const step = useWorkflowStore.getState().activeWorkflow!.steps[0];
    expect(step.id).toBe('step-a');
    expect(step.type).toBe('approval');
    expect(step.payload.risk).toBe('high');
  });

  // WF-4: advanceStep 推进一步
  it('WF-4: advanceStep 推进一步', () => {
    useWorkflowStore.getState().createWorkflow([
      { id: 's1', type: 'approval', payload: {} },
      { id: 's2', type: 'interaction', payload: {} },
    ]);
    useWorkflowStore.getState().advanceStep();
    expect(useWorkflowStore.getState().activeWorkflow!.currentStepIndex).toBe(1);
  });

  // WF-5: 最后一步后标记 completed
  it('WF-5: 到达最后一步后标记 completed', () => {
    useWorkflowStore.getState().createWorkflow([
      { id: 's1', type: 'approval', payload: {} },
    ]);
    useWorkflowStore.getState().advanceStep();
    const wf = useWorkflowStore.getState().activeWorkflow!;
    expect(wf.status).toBe('completed');
    expect(wf.currentStepIndex).toBe(1);
  });

  // WF-6: resolveBlockingStep 查 registry handler
  it('WF-6: resolveBlockingStep 查 registry handler', () => {
    const mockResolve = vi.fn().mockReturnValue({
      confirmed: true,
      data: { id: 's1', payload: {} },
    });
    blockingStepRegistry.register('approval', {
      type: 'approval',
      render: vi.fn(),
      resolve: mockResolve,
    });

    useWorkflowStore.getState().createWorkflow([
      { id: 's1', type: 'approval', payload: { title: '审批' } },
      { id: 's2', type: 'interaction', payload: {} },
    ]);

    useWorkflowStore.getState().resolveBlockingStep('approve');
    expect(mockResolve).toHaveBeenCalledTimes(1);
  });

  // WF-7: confirmed=true 自动 advance
  it('WF-7: confirmed=true 自动 advance', () => {
    blockingStepRegistry.register('approval', {
      type: 'approval',
      render: vi.fn(),
      resolve: () => ({ confirmed: true, data: { id: 's1', payload: {} } }),
    });

    useWorkflowStore.getState().createWorkflow([
      { id: 's1', type: 'approval', payload: {} },
      { id: 's2', type: 'interaction', payload: {} },
    ]);

    useWorkflowStore.getState().resolveBlockingStep('approve');
    expect(useWorkflowStore.getState().activeWorkflow!.currentStepIndex).toBe(1);
  });

  // WF-8: confirmed=false 暂停
  it('WF-8: confirmed=false 暂停', () => {
    blockingStepRegistry.register('approval', {
      type: 'approval',
      render: vi.fn(),
      resolve: () => ({ confirmed: false, data: { id: 's1', payload: {} } }),
    });

    useWorkflowStore.getState().createWorkflow([
      { id: 's1', type: 'approval', payload: {} },
      { id: 's2', type: 'interaction', payload: {} },
    ]);

    useWorkflowStore.getState().resolveBlockingStep('reject');
    expect(useWorkflowStore.getState().activeWorkflow!.status).toBe('paused');
    expect(useWorkflowStore.getState().activeWorkflow!.currentStepIndex).toBe(0);
  });

  // WF-9: cancelWorkflow 清除
  it('WF-9: cancelWorkflow 清除', () => {
    useWorkflowStore.getState().createWorkflow([
      { id: 's1', type: 'approval', payload: {} },
    ]);
    useWorkflowStore.getState().cancelWorkflow();
    expect(useWorkflowStore.getState().activeWorkflow).toBe(null);
  });

  // WF-10: 已完成工作流进入历史
  it('WF-10: 已完成工作流进入历史', () => {
    useWorkflowStore.getState().createWorkflow([
      { id: 's1', type: 'approval', payload: {} },
    ]);
    useWorkflowStore.getState().advanceStep();
    expect(useWorkflowStore.getState().workflowHistory.length).toBe(1);
    expect(useWorkflowStore.getState().workflowHistory[0].status).toBe('completed');
  });

  // WF-11: 未注册 handler 安全降级
  it('WF-11: 未注册 handler 安全降级', () => {
    // 不注册任何 handler
    useWorkflowStore.getState().createWorkflow([
      { id: 's1', type: 'unknown-type', payload: {} },
    ]);

    const result = useWorkflowStore.getState().resolveBlockingStep('approve');
    expect(result).not.toBe(null);
    expect(result!.confirmed).toBe(false);
    // 不崩溃，状态不变
    expect(useWorkflowStore.getState().activeWorkflow!.status).toBe('running');
  });
});
