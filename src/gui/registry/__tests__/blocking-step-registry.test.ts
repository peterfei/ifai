import { describe, it, expect, beforeEach } from 'vitest';
import { blockingStepRegistry } from '../blocking-step-registry';
import type { BlockingStepHandler, BlockingStepData, BlockingStepResult } from '../blocking-step-registry';

// 测试用 handler
const approvalHandler: BlockingStepHandler = {
  type: 'approval',
  render: (data: BlockingStepData) => `approval:${data.id}`,
  resolve: (data: BlockingStepData, choice: string): BlockingStepResult => ({
    confirmed: choice === 'approve',
    data,
  }),
};

const interactionHandler: BlockingStepHandler = {
  type: 'interaction',
  render: (data: BlockingStepData) => `interaction:${data.id}`,
  resolve: (data: BlockingStepData, choice: string): BlockingStepResult => ({
    confirmed: choice === 'submit',
    data,
  }),
};

describe('BlockingStepRegistry', () => {
  beforeEach(() => {
    blockingStepRegistry.clear();
  });

  it('注册并查询 approval handler', () => {
    blockingStepRegistry.register('approval', approvalHandler);
    const handler = blockingStepRegistry.get('approval');
    expect(handler).toBeDefined();
    expect(handler?.type).toBe('approval');
  });

  it('注册并查询 interaction handler', () => {
    blockingStepRegistry.register('interaction', interactionHandler);
    const handler = blockingStepRegistry.get('interaction');
    expect(handler).toBeDefined();
    expect(handler?.type).toBe('interaction');
  });

  it('render 分发到正确的 handler', () => {
    blockingStepRegistry.register('approval', approvalHandler);
    const handler = blockingStepRegistry.get('approval')!;
    const result = handler.render({ id: 'test-1', payload: {} });
    expect(result).toBe('approval:test-1');
  });

  it('resolve 返回正确的结果', () => {
    blockingStepRegistry.register('approval', approvalHandler);
    const handler = blockingStepRegistry.get('approval')!;
    const result = handler.resolve({ id: 'test-1', payload: {} }, 'approve');
    expect(result.confirmed).toBe(true);
  });

  it('reject 操作 resolve 返回 confirmed=false', () => {
    blockingStepRegistry.register('approval', approvalHandler);
    const handler = blockingStepRegistry.get('approval')!;
    const result = handler.resolve({ id: 'test-1', payload: {} }, 'reject');
    expect(result.confirmed).toBe(false);
  });

  it('未注册类型返回 undefined', () => {
    const handler = blockingStepRegistry.get('nonexistent');
    expect(handler).toBeUndefined();
  });

  it('entries 列出所有已注册 handler', () => {
    blockingStepRegistry.register('approval', approvalHandler);
    blockingStepRegistry.register('interaction', interactionHandler);
    const entries = blockingStepRegistry.entries();
    expect(entries.length).toBe(2);
  });

  it('新 handler 只需 register 即可扩展', () => {
    const customHandler: BlockingStepHandler = {
      type: 'custom',
      render: (data) => `custom:${data.id}`,
      resolve: (data, choice) => ({ confirmed: true, data }),
    };
    blockingStepRegistry.register('custom', customHandler);
    const handler = blockingStepRegistry.get('custom');
    expect(handler?.type).toBe('custom');
    expect(handler?.render({ id: 'x', payload: {} })).toBe('custom:x');
  });
});
