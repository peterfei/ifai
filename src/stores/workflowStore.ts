/**
 * workflowStore — 基于 blockingStepRegistry 的工作流引擎
 *
 * 核心设计：
 * - createWorkflow(steps) 创建工作流，steps 数组定义步骤顺序
 * - resolveBlockingStep(choice) 查表 dispatch：blockingStepRegistry.get(step.type)
 * - confirmed=true 自动推进，confirmed=false 暂停
 * - 零 if-else：步骤类型通过 registry 查表，新增类型只需注册 handler
 */

import { create } from 'zustand';
import { blockingStepRegistry } from '../gui/registry/blocking-step-registry';
import type { BlockingStepData, BlockingStepResult } from '../gui/registry/blocking-step-registry';

export interface WorkflowStep {
  id: string;
  type: string;
  payload: Record<string, unknown>;
}

export type WorkflowStatus = 'running' | 'paused' | 'completed' | 'cancelled' | 'blocked';

export interface Workflow {
  id: string;
  steps: WorkflowStep[];
  currentStepIndex: number;
  status: WorkflowStatus;
  results: BlockingStepResult[];
}

interface WorkflowState {
  activeWorkflow: Workflow | null;
  workflowHistory: Workflow[];

  createWorkflow: (steps: WorkflowStep[]) => string;
  advanceStep: () => void;
  resolveBlockingStep: (choice: string) => BlockingStepResult | null;
  cancelWorkflow: () => void;
}

function finishWorkflow(wf: Workflow): Workflow {
  return { ...wf, status: 'completed' as const, currentStepIndex: wf.steps.length };
}

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  activeWorkflow: null,
  workflowHistory: [],

  createWorkflow: (steps) => {
    const id = `wf-${Date.now()}`;
    const workflow: Workflow = {
      id,
      steps,
      currentStepIndex: 0,
      status: steps.length > 0 ? 'running' : 'completed',
      results: [],
    };
    set({ activeWorkflow: workflow });
    return id;
  },

  advanceStep: () => {
    const wf = get().activeWorkflow;
    if (!wf) return;
    const nextIndex = wf.currentStepIndex + 1;
    if (nextIndex >= wf.steps.length) {
      const completed = finishWorkflow(wf);
      set({
        activeWorkflow: completed,
        workflowHistory: [...get().workflowHistory, completed],
      });
    } else {
      set({ activeWorkflow: { ...wf, currentStepIndex: nextIndex, status: 'running' } });
    }
  },

  resolveBlockingStep: (choice) => {
    const wf = get().activeWorkflow;
    if (!wf || wf.status !== 'running') return null;

    const step = wf.steps[wf.currentStepIndex];
    const handler = blockingStepRegistry.get(step.type);

    if (!handler) {
      // 未注册 handler → 安全降级，不崩溃
      return {
        confirmed: false,
        data: { id: step.id, payload: { error: `Unknown step type: ${step.type}` } },
      };
    }

    const data: BlockingStepData = { id: step.id, payload: step.payload };
    const result = handler.resolve(data, choice);
    const updatedWf = { ...wf, results: [...wf.results, result] };

    if (result.confirmed) {
      const nextIndex = wf.currentStepIndex + 1;
      if (nextIndex >= wf.steps.length) {
        const completed = finishWorkflow(updatedWf);
        set({
          activeWorkflow: completed,
          workflowHistory: [...get().workflowHistory, completed],
        });
      } else {
        set({ activeWorkflow: { ...updatedWf, currentStepIndex: nextIndex, status: 'running' } });
      }
    } else {
      set({ activeWorkflow: { ...updatedWf, status: 'paused' } });
    }

    return result;
  },

  cancelWorkflow: () => {
    const wf = get().activeWorkflow;
    if (wf) {
      set({
        activeWorkflow: null,
        workflowHistory: [...get().workflowHistory, { ...wf, status: 'cancelled' }],
      });
    }
  },
}));
