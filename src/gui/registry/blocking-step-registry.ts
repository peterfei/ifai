import { Registry } from './registry';

/** 阻塞步骤的数据输入 */
export interface BlockingStepData {
  id: string;
  payload: Record<string, unknown>;
}

/** 阻塞步骤的处理结果 */
export interface BlockingStepResult {
  confirmed: boolean;
  data: BlockingStepData;
}

/** 阻塞步骤 handler 接口 */
export interface BlockingStepHandler {
  type: string;
  render: (data: BlockingStepData) => unknown;
  resolve: (data: BlockingStepData, choice: string) => BlockingStepResult;
}

/** 阻塞步骤注册表：审批/交互统一 dispatch */
export const blockingStepRegistry = new Registry<BlockingStepHandler>();
