/**
 * Agent 协作集成测试 — /review 三节点工作流场景
 *
 * 模拟真实 `/review .` 命令的执行过程：
 *   explore → review → refactor（3 个节点链式执行）
 *
 * 每个节点经历 begin → (end/close) 生命周期，
 * 验证 AgentCompactBar 依赖的 agentCollabStore 状态在每个阶段正确。
 *
 * 数据流：
 *   后端 executor.rs → CollabEvent → Tauri window.emit() →
 *   frontend listen() → useCollabEvents → agentCollabStore.setAgentDots()
 *
 * 这里通过直接 emit Tauri 事件绕过后端，专注前端 hook + store 集成。
 *
 * 注意：GlobalTestEventBus.emit()（vitestSetup.ts:34）内部已做 { payload: data } 包装，
 * 因此测试中 emit() 直接传入原始 payload 即可。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useCollabEvents } from '../useCollabEvents';
import { useAgentCollabStore } from '../../stores/agentCollabStore';
import { emit } from '@tauri-apps/api/event';

/** 等待 hook 的 async setupListeners 完成 */
async function waitForListeners(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

// ============================================================
// /review 三节点工作流定义
// ============================================================

const WORKFLOW = {
  nodes: [
    { agent_id: 'explore',  agent_type: 'explore',  task: '探索代码结构，分析项目文件分布' },
    { agent_id: 'review',   agent_type: 'review',   task: '审查代码质量和潜在问题' },
    { agent_id: 'refactor', agent_type: 'refactor', task: '提供重构建议并优化代码' },
  ],
} as const;

describe('/review 三节点工作流集成测试', () => {
  beforeEach(() => {
    useAgentCollabStore.setState({
      agentDots: [],
      compactText: '',
      hasActiveAgents: false,
    });
  });

  /* ============================================================
   * 场景 1: 完整 3 节点顺序执行
   *   验证 dots 累积 → 逐一切换活跃态 → 最终全部清除
   * ============================================================ */

  it('RV-IT-1: /review 三节点完整生命周期 dots 状态正确流转', async () => {
    renderHook(() => useCollabEvents());
    await waitForListeners();

    const { nodes } = WORKFLOW;

    // ── Phase 1: explore 执行 ──────────────────────────────
    act(() => {
      emit('agent:spawn:begin', nodes[0]);
    });
    expect(useAgentCollabStore.getState().agentDots).toHaveLength(1);
    expect(useAgentCollabStore.getState().agentDots[0].id).toBe('explore');
    expect(useAgentCollabStore.getState().agentDots[0].isActive).toBe(true);
    expect(useAgentCollabStore.getState().hasActiveAgents).toBe(true);

    // explore 完成
    act(() => {
      emit('agent:spawn:end', { agent_id: 'explore', result: 'completed', duration_ms: 3200 });
    });
    expect(useAgentCollabStore.getState().agentDots[0].isActive).toBe(false);

    // explore 关闭
    act(() => {
      emit('agent:close', { agent_id: 'explore' });
    });
    expect(useAgentCollabStore.getState().agentDots).toHaveLength(0);
    expect(useAgentCollabStore.getState().hasActiveAgents).toBe(false);

    // ── Phase 2: review 执行 ─────────────────────────────────
    act(() => {
      emit('agent:spawn:begin', nodes[1]);
    });
    expect(useAgentCollabStore.getState().agentDots).toHaveLength(1);
    expect(useAgentCollabStore.getState().agentDots[0].id).toBe('review');
    expect(useAgentCollabStore.getState().agentDots[0].isActive).toBe(true);

    act(() => {
      emit('agent:spawn:end', { agent_id: 'review', result: 'completed', duration_ms: 5100 });
    });
    expect(useAgentCollabStore.getState().agentDots[0].isActive).toBe(false);

    act(() => {
      emit('agent:close', { agent_id: 'review' });
    });
    expect(useAgentCollabStore.getState().agentDots).toHaveLength(0);
    expect(useAgentCollabStore.getState().hasActiveAgents).toBe(false);

    // ── Phase 3: refactor 执行 ───────────────────────────────
    act(() => {
      emit('agent:spawn:begin', nodes[2]);
    });
    expect(useAgentCollabStore.getState().agentDots).toHaveLength(1);
    expect(useAgentCollabStore.getState().agentDots[0].id).toBe('refactor');
    expect(useAgentCollabStore.getState().agentDots[0].isActive).toBe(true);

    act(() => {
      emit('agent:spawn:end', { agent_id: 'refactor', result: 'completed', duration_ms: 4800 });
    });
    act(() => {
      emit('agent:close', { agent_id: 'refactor' });
    });

    // 最终状态：全空
    const finalState = useAgentCollabStore.getState();
    expect(finalState.agentDots).toHaveLength(0);
    expect(finalState.compactText).toBe('');
    expect(finalState.hasActiveAgents).toBe(false);
  });

  /* ============================================================
   * 场景 2: 多节点并行 active
   *   验证 begin → begin → ... → end → close 的累积行为
   * ============================================================ */

  it('RV-IT-2: 多节点重叠 active 时 dots 累积且紧凑文本准确', async () => {
    renderHook(() => useCollabEvents());
    await waitForListeners();

    const { nodes } = WORKFLOW;

    // 并发 begin：3 个 agent 同时活跃
    act(() => {
      emit('agent:spawn:begin', nodes[0]); // explore
    });
    act(() => {
      emit('agent:spawn:begin', nodes[1]); // review
    });
    act(() => {
      emit('agent:spawn:begin', nodes[2]); // refactor
    });

    // dots 累积为 3 个，全部活跃
    let state = useAgentCollabStore.getState();
    expect(state.agentDots).toHaveLength(3);
    expect(state.agentDots.every((d) => d.isActive)).toBe(true);
    expect(state.compactText).toContain('refactor 正在');
    expect(state.hasActiveAgents).toBe(true);

    // explore 完成
    act(() => {
      emit('agent:spawn:end', { agent_id: 'explore', result: 'completed', duration_ms: 1200 });
    });
    state = useAgentCollabStore.getState();
    expect(state.agentDots[0].isActive).toBe(false);
    expect(state.agentDots[1].isActive).toBe(true);
    expect(state.agentDots[2].isActive).toBe(true);

    // explore 关闭 → 剩 2 个
    act(() => {
      emit('agent:close', { agent_id: 'explore' });
    });
    expect(useAgentCollabStore.getState().agentDots).toHaveLength(2);

    // 全部完成
    act(() => {
      emit('agent:spawn:end', { agent_id: 'review', result: 'completed', duration_ms: 2000 });
    });
    act(() => {
      emit('agent:spawn:end', { agent_id: 'refactor', result: 'completed', duration_ms: 3000 });
    });
    act(() => {
      emit('agent:close', { agent_id: 'review' });
    });
    act(() => {
      emit('agent:close', { agent_id: 'refactor' });
    });

    expect(useAgentCollabStore.getState().agentDots).toHaveLength(0);
  });

  /* ============================================================
   * 场景 3: Agent 颜色配置验证
   *   每个 agent_type 映射到正确的颜色和缩写
   * ============================================================ */

  it('RV-IT-3: 各 Agent 颜色和标签配置正确', async () => {
    renderHook(() => useCollabEvents());
    await waitForListeners();

    const agentTypes = [
      { agent_id: 'explore',  agent_type: 'explore',  expectedLabel: 'EX', expectedGradient: 'from-purple-400 to-purple-600' },
      { agent_id: 'review',   agent_type: 'review',   expectedLabel: 'RV', expectedGradient: 'from-pink-400 to-pink-600' },
      { agent_id: 'refactor', agent_type: 'refactor', expectedLabel: 'RF', expectedGradient: 'from-emerald-400 to-emerald-600' },
    ];

    for (const at of agentTypes) {
      act(() => {
        emit('agent:spawn:begin', { agent_id: at.agent_id, agent_type: at.agent_type, task: '工作中' });
      });

      const dot = useAgentCollabStore.getState().agentDots.find(
        (d) => d.id === at.agent_id,
      );
      expect(dot).toBeDefined();
      expect(dot!.label).toBe(at.expectedLabel);
      expect(dot!.gradient).toBe(at.expectedGradient);

      // 清理
      act(() => {
        emit('agent:close', { agent_id: at.agent_id });
      });
    }
  });

  /* ============================================================
   * 场景 4: compactText 在流程中的变化
   *   验证文本内容随事件类型动态更新
   * ============================================================ */

  it('RV-IT-4: compactText 随事件动态变化', async () => {
    renderHook(() => useCollabEvents());
    await waitForListeners();

    // begin → "explore 正在 探索代码结构..."
    act(() => {
      emit('agent:spawn:begin', WORKFLOW.nodes[0]);
    });
    expect(useAgentCollabStore.getState().compactText).toBe(
      'explore 正在 探索代码结构，分析项目文件分布',
    );

    // end → "已完成"
    act(() => {
      emit('agent:spawn:end', { agent_id: 'explore', result: 'completed', duration_ms: 1000 });
    });
    expect(useAgentCollabStore.getState().compactText).toBe('已完成');

    // close → 空（无活跃 agent）
    act(() => {
      emit('agent:close', { agent_id: 'explore' });
    });
    expect(useAgentCollabStore.getState().compactText).toBe('');

    // 第二个 agent begin → 新文本
    act(() => {
      emit('agent:spawn:begin', WORKFLOW.nodes[1]);
    });
    expect(useAgentCollabStore.getState().compactText).toBe(
      'review 正在 审查代码质量和潜在问题',
    );
  });

  /* ============================================================
   * 场景 5: 工作流失败场景
   *   模拟 review 节点执行失败
   * ============================================================ */

  it('RV-IT-5: 节点失败时显示"执行失败"', async () => {
    renderHook(() => useCollabEvents());
    await waitForListeners();

    // explore 成功
    act(() => {
      emit('agent:spawn:begin', WORKFLOW.nodes[0]);
    });
    act(() => {
      emit('agent:spawn:end', { agent_id: 'explore', result: 'completed', duration_ms: 1000 });
    });

    // review 失败
    act(() => {
      emit('agent:spawn:begin', WORKFLOW.nodes[1]);
    });
    expect(useAgentCollabStore.getState().compactText).toContain('review 正在');

    act(() => {
      emit('agent:spawn:end', { agent_id: 'review', result: 'failed', duration_ms: 2000 });
    });
    expect(useAgentCollabStore.getState().compactText).toBe('执行失败');
  });
});
