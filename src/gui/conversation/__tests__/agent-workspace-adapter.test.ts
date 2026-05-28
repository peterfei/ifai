/**
 * agentWorkspaceAdapter 测试
 *
 * AW-A-1~8: workflowData / phaseData → AgentWorkspaceData 映射
 */
import { describe, test, expect, beforeEach } from 'vitest';
import { adaptMessageToCard, MessageAdapterRegistry } from '../MessageAdapterRegistry';
import { agentWorkspaceAdapter } from '../adapters/agentWorkspaceAdapter';

/* ===== 辅助函数 ===== */

function makeMessage(overrides: Record<string, any> = {}): any {
  return { id: 'm1', role: 'assistant', content: '', ...overrides };
}

/* ===== 测试 ===== */

describe('agentWorkspaceAdapter', () => {
  beforeEach(() => {
    MessageAdapterRegistry.clear();
    MessageAdapterRegistry.register('agent-workspace', agentWorkspaceAdapter);
  });

  // AW-A-1: 匹配含 workflowData 的多 agent 消息
  test('AW-A-1: workflowData 含 2+ agentType 时匹配', () => {
    const msg = makeMessage({
      metadata: {
        workflowData: {
          workflowId: 'wf-1',
          intent: '重构登录模块',
          nodes: [
            { agentType: 'explore', intent: '扫描代码', status: 'running', tools: [], elapsedSecs: 0, totalTokens: 0 },
            { agentType: 'refactor', intent: '重构代码', status: 'pending', tools: [], elapsedSecs: 0, totalTokens: 0 },
          ],
          totalElapsedSecs: 0, totalTokens: 0, totalTools: 0, status: 'running',
        },
      },
    });
    const result = adaptMessageToCard(msg);
    expect(result).not.toBeNull();
    expect(result?.cardType).toBe('agent_workspace');
  });

  // AW-A-2: 匹配含 phaseData 的多 phase 消息
  test('AW-A-2: phaseData 含 2+ phase 时匹配', () => {
    const msg = makeMessage({
      metadata: {
        phaseData: [
          { nodeId: 'explore_1', mode: 'sequential', intent: '扫描', progress: 100, status: 'done' },
          { nodeId: 'refactor_2', mode: 'sequential', intent: '重构', progress: 50, status: 'running' },
        ],
      },
    });
    const result = adaptMessageToCard(msg);
    expect(result).not.toBeNull();
    expect(result?.cardType).toBe('agent_workspace');
  });

  // AW-A-3: 单 agent workflowData 也匹配（任何 workflow 消息都渲染 AgentWorkspaceCard）
  test('AW-A-3: 单 agent workflowData 时匹配', () => {
    const msg = makeMessage({
      metadata: {
        workflowData: {
          workflowId: 'wf-1',
          intent: '扫描代码',
          nodes: [
            { agentType: 'explore', intent: '扫描', status: 'running', tools: [], elapsedSecs: 0, totalTokens: 0 },
          ],
          totalElapsedSecs: 0, totalTokens: 0, totalTools: 0, status: 'running',
        },
      },
    });
    const result = adaptMessageToCard(msg);
    expect(result).not.toBeNull();
    expect(result?.cardType).toBe('agent_workspace');
  });

  // AW-A-4: 不匹配（无 workflowData/phaseData）
  test('AW-A-4: 无相关元数据时不匹配', () => {
    const msg = makeMessage({ content: 'hello' });
    expect(adaptMessageToCard(msg)).toBeNull();
  });

  // AW-A-5: adapt workflowData → AgentWorkspaceData 结构正确
  test('AW-A-5: workflowData 映射为正确的 AgentWorkspaceData', () => {
    const msg = makeMessage({
      metadata: {
        workflowData: {
          workflowId: 'wf-1',
          intent: '代码重构',
          nodes: [
            { agentType: 'explore', intent: '扫描代码', status: 'done', tools: [{ toolName: 'Read', status: 'done' }], elapsedSecs: 2, totalTokens: 100 },
            { agentType: 'refactor', intent: '重构组件', status: 'running', tools: [{ toolName: 'Edit', status: 'running' }], elapsedSecs: 5, totalTokens: 200 },
          ],
          totalElapsedSecs: 7, totalTokens: 300, totalTools: 2, status: 'running',
        },
      },
    });
    const result = adaptMessageToCard(msg);
    const data = result?.data;

    expect(data.stepLabel).toBe('代码重构');
    expect(data.stepIndex).toBe(1); // refactor is running at index 1
    expect(data.totalSteps).toBe(2);
    expect(data.activeAgents).toContain('RF'); // refactor is running
    expect(data.assignFromPM).toBe(true); // 2 agents
    expect(data.compactMsg).toContain('RF');
    expect(data.compactMsg).toContain('代码重构');
    expect(data.steps).toEqual(['扫描代码', '重构组件']);
    expect(data.progress).toHaveProperty('EX');
    expect(data.progress).toHaveProperty('RF');
  });

  // AW-A-6: adapt phaseData → AgentWorkspaceData
  test('AW-A-6: phaseData 映射为正确的 AgentWorkspaceData', () => {
    const msg = makeMessage({
      metadata: {
        phaseData: [
          { nodeId: 'explore_scan', mode: 'sequential', intent: '扫描项目', progress: 100, status: 'done', sub: [{ name: 'src/main.ts', status: 'done' }] },
          { nodeId: 'refactor_edit', mode: 'sequential', intent: '重构代码', progress: 45, status: 'running', sub: [{ name: 'src/app.ts', status: 'running' }] },
          { nodeId: 'test_verify', mode: 'sequential', intent: '测试验证', progress: 0, status: 'pending', sub: [] },
        ],
      },
    });
    const result = adaptMessageToCard(msg);
    const data = result?.data;

    expect(data.stepLabel).toBe('扫描项目'); // first phase intent
    expect(data.totalSteps).toBe(3);
    expect(data.stepIndex).toBe(1); // index of first running/pending phase
    expect(data.activeAgents).toContain('RF');
    expect(data.activeAgents).toContain('TS');
    expect(data.activeAgents.length).toBe(2); // RF (running) + TS (pending)
    expect(data.progress['RF']).toBe(45);
    expect(data.steps).toEqual(['扫描项目', '重构代码', '测试验证']);
    expect(data.taskBreakdown).toBeDefined();
    // taskBreakdown from sub items
    if (data.taskBreakdown) {
      expect(data.taskBreakdown.length).toBeGreaterThanOrEqual(2);
    }
  });

  // AW-A-7: compactMsg 反映活跃 Agent
  test('AW-A-7: compactMsg 反映正在运行的 Agent', () => {
    const msg = makeMessage({
      metadata: {
        workflowData: {
          workflowId: 'wf-1',
          intent: '性能优化',
          nodes: [
            { agentType: 'explore', intent: '分析', status: 'done', tools: [{ toolName: 'Read', status: 'done' }], elapsedSecs: 1, totalTokens: 50 },
            { agentType: 'refactor', intent: '优化', status: 'running', tools: [{ toolName: 'Edit', status: 'running' }], elapsedSecs: 3, totalTokens: 100 },
            { agentType: 'test', intent: '测试', status: 'pending', tools: [], elapsedSecs: 0, totalTokens: 0 },
          ],
          totalElapsedSecs: 4, totalTokens: 150, totalTools: 2, status: 'running',
        },
      },
    });
    const result = adaptMessageToCard(msg);
    const data = result?.data;

    // RF is running, TS is pending → both are "active" agents
    expect(data.compactMsg).toContain('性能优化');
  });

  // AW-A-8: 单 phase phaseData 也匹配（任何 phase 数据都渲染 AgentWorkspaceCard）
  test('AW-A-8: 单 phase phaseData 时匹配', () => {
    const msg = makeMessage({
      metadata: {
        phaseData: [
          { nodeId: 'explore_1', mode: 'sequential', intent: '扫描', progress: 100, status: 'done' },
        ],
      },
    });
    const result = adaptMessageToCard(msg);
    expect(result).not.toBeNull();
    expect(result?.cardType).toBe('agent_workspace');
  });
});
