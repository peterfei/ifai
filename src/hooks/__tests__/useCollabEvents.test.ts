/**
 * useCollabEvents hook 测试
 *
 * 测试策略：
 * - 通过 renderHook 挂载 hook，等待 async 监听器注册
 * - 使用 @tauri-apps/api/event 的 mock 模拟后端事件发射
 * - 验证 agentCollabStore 状态正确更新
 *
 * 事件负载格式说明：
 *   GlobalTestEventBus.emit()（vitestSetup.ts:34）内部已做 { payload: data } 包装，
 *   因此测试中 emit() 直接传入原始 payload 即可。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCollabEvents } from '../useCollabEvents';
import { useAgentCollabStore } from '../../stores/agentCollabStore';
import { emit } from '@tauri-apps/api/event';

/** 等待 hook 的 async setupListeners 完成 */
async function waitForListeners(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('useCollabEvents', () => {
  beforeEach(() => {
    useAgentCollabStore.setState({
      agentDots: [],
      compactText: '',
      hasActiveAgents: false,
    });
  });

  /* ===== 初始状态 ===== */

  it('CE-1: 挂载后立即检查，store 无变化', () => {
    renderHook(() => useCollabEvents());

    const state = useAgentCollabStore.getState();
    expect(state.agentDots).toEqual([]);
    expect(state.hasActiveAgents).toBe(false);
  });

  /* ===== spawn:begin → 创建 dot ===== */

  it('CE-2: agent:spawn:begin 创建 agent dot，label/gradient 从 AGENT_DOT_MAP 获取', async () => {
    renderHook(() => useCollabEvents());
    await waitForListeners();

    act(() => {
      emit('agent:spawn:begin', { agent_id: 'explore', agent_type: 'explore', task: '探索项目' });
    });

    const state = useAgentCollabStore.getState();
    expect(state.agentDots).toHaveLength(1);
    expect(state.agentDots[0]).toMatchObject({
      id: 'explore',
      label: 'EX',
      gradient: 'from-purple-400 to-purple-600',
      isActive: true,
    });
    expect(state.compactText).toContain('explore 正在');
    expect(state.hasActiveAgents).toBe(true);
  });

  it('CE-3: 未知 agent_type 回退到首字母缩写 + brand 渐变色', async () => {
    renderHook(() => useCollabEvents());
    await waitForListeners();

    act(() => {
      emit('agent:spawn:begin', { agent_id: 'custom_agent', agent_type: 'custom_agent', task: '特殊任务' });
    });

    const state = useAgentCollabStore.getState();
    expect(state.agentDots[0].label).toBe('CU');
    expect(state.agentDots[0].gradient).toBe('from-brand-400 to-brand-600');
  });

  /* ===== spawn:end → dot 变为非活跃 ===== */

  it('CE-4: agent:spawn:end 标记 dot 为非活跃', async () => {
    renderHook(() => useCollabEvents());
    await waitForListeners();

    act(() => {
      emit('agent:spawn:begin', { agent_id: 'explore', agent_type: 'explore', task: '探索' });
    });
    act(() => {
      emit('agent:spawn:end', { agent_id: 'explore', result: 'completed', duration_ms: 1500 });
    });

    const state = useAgentCollabStore.getState();
    expect(state.agentDots[0].isActive).toBe(false);
    expect(state.compactText).toBe('已完成');
    expect(state.hasActiveAgents).toBe(false);
  });

  it('CE-5: spawn:end result 非 completed 时显示"执行失败"', async () => {
    renderHook(() => useCollabEvents());
    await waitForListeners();

    act(() => {
      emit('agent:spawn:begin', { agent_id: 'explore', agent_type: 'explore', task: '探索' });
    });
    act(() => {
      emit('agent:spawn:end', { agent_id: 'explore', result: 'failed', duration_ms: 500 });
    });

    expect(useAgentCollabStore.getState().compactText).toBe('执行失败');
  });

  /* ===== close → dot 移除 ===== */

  it('CE-6: agent:close 移除对应 dot', async () => {
    renderHook(() => useCollabEvents());
    await waitForListeners();

    act(() => {
      emit('agent:spawn:begin', { agent_id: 'explore', agent_type: 'explore', task: '探索' });
    });
    act(() => {
      emit('agent:close', { agent_id: 'explore' });
    });

    const state = useAgentCollabStore.getState();
    expect(state.agentDots).toHaveLength(0);
    expect(state.hasActiveAgents).toBe(false);
  });

  /* ===== 多 Agent 顺序执行（累积 dots） ===== */

  it('CE-7: 顺序 spawn:begin 累积多个 dots', async () => {
    renderHook(() => useCollabEvents());
    await waitForListeners();

    act(() => {
      emit('agent:spawn:begin', { agent_id: 'explore', agent_type: 'explore', task: '探索' });
    });
    act(() => {
      emit('agent:spawn:begin', { agent_id: 'review', agent_type: 'review', task: '审查' });
    });

    const state = useAgentCollabStore.getState();
    expect(state.agentDots).toHaveLength(2);
    expect(state.agentDots[0].id).toBe('explore');
    expect(state.agentDots[1].id).toBe('review');
    expect(state.agentDots[0].isActive).toBe(true);
    expect(state.agentDots[1].isActive).toBe(true);
  });

  it('CE-8: 重复 spawn:begin 更新已有 dot，不新增', async () => {
    renderHook(() => useCollabEvents());
    await waitForListeners();

    act(() => {
      emit('agent:spawn:begin', { agent_id: 'explore', agent_type: 'explore', task: '第一轮' });
    });
    act(() => {
      emit('agent:spawn:begin', { agent_id: 'explore', agent_type: 'explore', task: '第二轮' });
    });

    const state = useAgentCollabStore.getState();
    expect(state.agentDots).toHaveLength(1);
    expect(state.compactText).toContain('第二轮');
  });

  /* ===== 完整生命周期（begin → end → close） ===== */

  it('CE-9: 完整生命周期 begin → end → close', async () => {
    renderHook(() => useCollabEvents());
    await waitForListeners();

    act(() => {
      emit('agent:spawn:begin', { agent_id: 'explore', agent_type: 'explore', task: '探索' });
    });
    expect(useAgentCollabStore.getState().agentDots).toHaveLength(1);
    expect(useAgentCollabStore.getState().hasActiveAgents).toBe(true);

    act(() => {
      emit('agent:spawn:end', { agent_id: 'explore', result: 'completed', duration_ms: 1000 });
    });
    expect(useAgentCollabStore.getState().agentDots).toHaveLength(1);
    expect(useAgentCollabStore.getState().agentDots[0].isActive).toBe(false);
    expect(useAgentCollabStore.getState().hasActiveAgents).toBe(false);

    act(() => {
      emit('agent:close', { agent_id: 'explore' });
    });
    expect(useAgentCollabStore.getState().agentDots).toHaveLength(0);
  });

  /* ===== 交互事件 ===== */

  it('CE-10: interaction:begin 标记 dot 活跃 + 显示等待提示', async () => {
    renderHook(() => useCollabEvents());
    await waitForListeners();

    act(() => {
      emit('agent:spawn:begin', { agent_id: 'explore', agent_type: 'explore', task: '探索' });
    });
    act(() => {
      emit('agent:spawn:end', { agent_id: 'explore', result: 'completed', duration_ms: 1000 });
    });
    expect(useAgentCollabStore.getState().agentDots[0].isActive).toBe(false);

    act(() => {
      emit('agent:interaction:begin', { agent_id: 'explore', question: '请确认是否继续？', options: ['是', '否'] });
    });
    const state = useAgentCollabStore.getState();
    expect(state.agentDots[0].isActive).toBe(true);
    expect(state.compactText).toContain('等待用户输入');
  });

  it('CE-11: interaction:end 标记 dot 非活跃', async () => {
    renderHook(() => useCollabEvents());
    await waitForListeners();

    act(() => {
      emit('agent:spawn:begin', { agent_id: 'explore', agent_type: 'explore', task: '探索' });
    });
    act(() => {
      emit('agent:interaction:begin', { agent_id: 'explore', question: '确认？', options: ['是'] });
    });
    act(() => {
      emit('agent:interaction:end', { agent_id: 'explore', response: '是' });
    });

    const state = useAgentCollabStore.getState();
    expect(state.agentDots[0].isActive).toBe(false);
    expect(state.compactText).toContain('已收到反馈');
  });

  /* ===== 清理 ===== */

  it('CE-12: 卸载后事件不再更新 store', async () => {
    const { unmount } = renderHook(() => useCollabEvents());
    await waitForListeners();
    unmount();

    act(() => {
      emit('agent:spawn:begin', { agent_id: 'explore', agent_type: 'explore', task: '探索' });
    });

    expect(useAgentCollabStore.getState().agentDots).toEqual([]);
  });

  /* ===== close 后清除所有状态 ===== */

  it('CE-13: 最后一个 agent close 后 compactText 为空', async () => {
    renderHook(() => useCollabEvents());
    await waitForListeners();

    act(() => {
      emit('agent:spawn:begin', { agent_id: 'review', agent_type: 'review', task: '审查' });
    });
    act(() => {
      emit('agent:spawn:begin', { agent_id: 'refactor', agent_type: 'refactor', task: '重构' });
    });

    act(() => {
      emit('agent:spawn:end', { agent_id: 'review', result: 'completed', duration_ms: 500 });
    });
    act(() => {
      emit('agent:close', { agent_id: 'review' });
    });
    act(() => {
      emit('agent:spawn:end', { agent_id: 'refactor', result: 'completed', duration_ms: 800 });
    });
    act(() => {
      emit('agent:close', { agent_id: 'refactor' });
    });

    const state = useAgentCollabStore.getState();
    expect(state.agentDots).toHaveLength(0);
    expect(state.compactText).toBe('');
    expect(state.hasActiveAgents).toBe(false);
  });
});
