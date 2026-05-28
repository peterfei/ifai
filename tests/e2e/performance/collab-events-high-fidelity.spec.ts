/**
 * Agent 协作事件 E2E 高保真测试
 *
 * 测试策略：
 * - 使用 E2E mock 环境加载应用（Tauri IPC mock、localStorage 等）
 * - 直接通过 page.evaluate 注册事件监听器（避免 AIChat 组件挂载依赖）
 * - 通过 window.__TAURI__.event.emit 模拟后端 CollabEvent 发射
 * - 验证 agentCollabStore 状态正确流转
 *
 * 数据流（与生产环境一致）：
 *   tauri-mocks/api/event.listen() → handler → agentCollabStore.setAgentDots()
 *
 * @version 2.0.0
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

/**
 * 在浏览器侧注册 useCollabEvents 同等的监听器逻辑。
 * 使用真实 tauri-mocks 的 listen() 和真实的 agentCollabStore。
 */
async function setupCollabListeners(page: any): Promise<void> {
  await page.evaluate(async () => {
    // 动态导入 tauri-mocks 的 listen（与 useCollabEvents 相同的路径）
    const { listen } = await import('/src/tauri-mocks/api/event.ts');
    const { useAgentCollabStore } = await import('/src/stores/agentCollabStore.ts');

    // ====== AGENT_DOT_MAP（与 useCollabEvents 完全一致） ======
    const AGENT_DOT_MAP: Record<string, { label: string; gradient: string }> = {
      explore:           { label: 'EX', gradient: 'from-purple-400 to-purple-600' },
      review:            { label: 'RV', gradient: 'from-pink-400 to-pink-600' },
      refactor:          { label: 'RF', gradient: 'from-emerald-400 to-emerald-600' },
      test:              { label: 'TS', gradient: 'from-sky-400 to-sky-600' },
      doc:               { label: 'DC', gradient: 'from-amber-400 to-amber-600' },
      debug:             { label: 'DB', gradient: 'from-red-400 to-red-600' },
      proposal_generator:{ label: 'PG', gradient: 'from-brand-400 to-brand-600' },
      websearch:         { label: 'WS', gradient: 'from-cyan-400 to-cyan-600' },
      git_commit:        { label: 'GC', gradient: 'from-slate-400 to-slate-500' },
      react:             { label: 'RE', gradient: 'from-orange-400 to-orange-600' },
      general_purpose:   { label: 'GP', gradient: 'from-gray-400 to-gray-600' },
      task_breakdown:    { label: 'TB', gradient: 'from-brand-400 to-brand-600' },
    };

    function getDotConfig(agentType: string): { label: string; gradient: string } {
      return AGENT_DOT_MAP[agentType] || {
        label: agentType.slice(0, 2).toUpperCase(),
        gradient: 'from-brand-400 to-brand-600',
      };
    }

    // agent:spawn:begin
    await listen('agent:spawn:begin', (event: any) => {
      const payload = event.payload;
      const store = useAgentCollabStore.getState();
      const existingIndex = store.agentDots.findIndex((dot: any) => dot.id === payload.agent_id);
      const newDot = {
        id: payload.agent_id,
        ...getDotConfig(payload.agent_type),
        isActive: true,
      };
      const updatedDots =
        existingIndex >= 0
          ? store.agentDots.map((dot: any, i: number) => (i === existingIndex ? newDot : dot))
          : [...store.agentDots, newDot];
      store.setAgentDots(updatedDots, `${payload.agent_type} 正在 ${payload.task.slice(0, 40)}`);
    });

    // agent:spawn:end
    await listen('agent:spawn:end', (event: any) => {
      const payload = event.payload;
      const store = useAgentCollabStore.getState();
      const updatedDots = store.agentDots.map((dot: any) =>
        dot.id === payload.agent_id ? { ...dot, isActive: false } : dot,
      );
      const resultText = payload.result === 'completed' ? '已完成' : '执行失败';
      store.setAgentDots(updatedDots, resultText);
    });

    // agent:close
    await listen('agent:close', (event: any) => {
      const payload = event.payload;
      const store = useAgentCollabStore.getState();
      const remainingDots = store.agentDots.filter((dot: any) => dot.id !== payload.agent_id);
      const hasActive = remainingDots.some((dot: any) => dot.isActive);
      store.setAgentDots(
        remainingDots,
        hasActive ? `${remainingDots.filter((d: any) => d.isActive).length} Agent 活跃` : '',
      );
    });

    // agent:interaction:begin
    await listen('agent:interaction:begin', (event: any) => {
      const payload = event.payload;
      const store = useAgentCollabStore.getState();
      const updatedDots = store.agentDots.map((dot: any) =>
        dot.id === payload.agent_id ? { ...dot, isActive: true } : dot,
      );
      store.setAgentDots(updatedDots, `等待用户输入: ${payload.question.slice(0, 30)}`);
    });

    // agent:interaction:end
    await listen('agent:interaction:end', (event: any) => {
      const payload = event.payload;
      const store = useAgentCollabStore.getState();
      const updatedDots = store.agentDots.map((dot: any) =>
        dot.id === payload.agent_id ? { ...dot, isActive: false } : dot,
      );
      const hasActive = updatedDots.some((dot: any) => dot.isActive);
      store.setAgentDots(
        updatedDots,
        hasActive ? `${updatedDots.filter((d: any) => d.isActive).length} Agent 活跃` : '已收到反馈',
      );
    });
  });
}

/**
 * 通过动态导入获取 agentCollabStore 状态
 */
async function getCollabStoreState(page: any): Promise<any> {
  return page.evaluate(async () => {
    const mod = await import('/src/stores/agentCollabStore.ts');
    return mod.useAgentCollabStore.getState();
  });
}

/**
 * 发射 Tauri CollabEvent
 */
async function emitCollabEvent(page: any, event: string, payload: any): Promise<void> {
  await page.evaluate(({ event, payload }) => {
    (window as any).__TAURI__.event.emit(event, payload);
  }, { event, payload });
}

// ============================================================
// 测试用例
// ============================================================

test.describe('Agent Collab Events 高保真 E2E 测试', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page, {
      useRealAI: false,
      skipWelcome: true,
    });
    // 加载应用（让 Vite 模块系统就绪）
    await page.goto('/');
    // 等待 React 挂载和 store 暴露
    await page.waitForFunction(() => {
      const root = document.querySelector('#root');
      return root && root.children.length > 0;
    }, { timeout: 30000 });
    await page.waitForTimeout(500);

    // 注册 Collab 事件监听器（替代 useCollabEvents hook）
    await setupCollabListeners(page);
    await page.waitForTimeout(200);
  });

  /* ============================================================
   * 场景 1: Agent 启动 → 完成 → 关闭（完整生命周期）
   * ============================================================ */

  test('HF-1: agent:spawn:begin → end → close 完整生命周期', async ({ page }) => {
    let state = await getCollabStoreState(page);
    expect(state.agentDots).toHaveLength(0);
    expect(state.hasActiveAgents).toBe(false);

    // begin → agent dot 创建
    await emitCollabEvent(page, 'agent:spawn:begin', {
      agent_id: 'explore', agent_type: 'explore', task: '探索代码结构',
    });
    state = await getCollabStoreState(page);
    expect(state.agentDots).toHaveLength(1);
    expect(state.agentDots[0].id).toBe('explore');
    expect(state.agentDots[0].label).toBe('EX');
    expect(state.agentDots[0].isActive).toBe(true);
    expect(state.hasActiveAgents).toBe(true);
    expect(state.compactText).toContain('explore 正在');

    // end → dot 非活跃
    await emitCollabEvent(page, 'agent:spawn:end', {
      agent_id: 'explore', result: 'completed', duration_ms: 1500,
    });
    state = await getCollabStoreState(page);
    expect(state.agentDots[0].isActive).toBe(false);
    expect(state.hasActiveAgents).toBe(false);
    expect(state.compactText).toBe('已完成');

    // close → dot 移除
    await emitCollabEvent(page, 'agent:close', { agent_id: 'explore' });
    state = await getCollabStoreState(page);
    expect(state.agentDots).toHaveLength(0);
    expect(state.compactText).toBe('');
  });

  /* ============================================================
   * 场景 2: /review 三节点工作流
   * ============================================================ */

  test('HF-2: /review 三节点工作流完整流转', async ({ page }) => {
    const nodes = [
      { agent_id: 'explore', agent_type: 'explore', task: '探索代码结构，分析项目文件分布' },
      { agent_id: 'review', agent_type: 'review', task: '审查代码质量和潜在问题' },
      { agent_id: 'refactor', agent_type: 'refactor', task: '提供重构建议并优化代码' },
    ];

    for (const node of nodes) {
      await emitCollabEvent(page, 'agent:spawn:begin', node);
      let s = await getCollabStoreState(page);
      expect(s.agentDots).toHaveLength(1);
      expect(s.agentDots[0].id).toBe(node.agent_id);
      expect(s.agentDots[0].isActive).toBe(true);

      await emitCollabEvent(page, 'agent:spawn:end', {
        agent_id: node.agent_id, result: 'completed', duration_ms: 3000,
      });
      await emitCollabEvent(page, 'agent:close', { agent_id: node.agent_id });
    }

    const finalState = await getCollabStoreState(page);
    expect(finalState.agentDots).toHaveLength(0);
    expect(finalState.compactText).toBe('');
    expect(finalState.hasActiveAgents).toBe(false);
  });

  /* ============================================================
   * 场景 3: 多 Agent 并行活跃
   * ============================================================ */

  test('HF-3: 多 Agent 并行活跃 dots 累积', async ({ page }) => {
    await emitCollabEvent(page, 'agent:spawn:begin', { agent_id: 'explore', agent_type: 'explore', task: '探索' });
    await emitCollabEvent(page, 'agent:spawn:begin', { agent_id: 'review', agent_type: 'review', task: '审查' });
    await emitCollabEvent(page, 'agent:spawn:begin', { agent_id: 'refactor', agent_type: 'refactor', task: '重构' });

    let state = await getCollabStoreState(page);
    expect(state.agentDots).toHaveLength(3);
    expect(state.agentDots.every((d: any) => d.isActive)).toBe(true);

    await emitCollabEvent(page, 'agent:spawn:end', { agent_id: 'explore', result: 'completed', duration_ms: 1000 });
    state = await getCollabStoreState(page);
    expect(state.agentDots[0].isActive).toBe(false);

    await emitCollabEvent(page, 'agent:close', { agent_id: 'explore' });
    state = await getCollabStoreState(page);
    expect(state.agentDots).toHaveLength(2);

    await emitCollabEvent(page, 'agent:spawn:end', { agent_id: 'review', result: 'completed', duration_ms: 2000 });
    await emitCollabEvent(page, 'agent:spawn:end', { agent_id: 'refactor', result: 'completed', duration_ms: 3000 });
    await emitCollabEvent(page, 'agent:close', { agent_id: 'review' });
    await emitCollabEvent(page, 'agent:close', { agent_id: 'refactor' });

    state = await getCollabStoreState(page);
    expect(state.agentDots).toHaveLength(0);
  });

  /* ============================================================
   * 场景 4: Agent 颜色映射验证
   * ============================================================ */

  test('HF-4: 各 Agent 颜色和标签正确映射', async ({ page }) => {
    const configs = [
      { type: 'explore',  expect: { label: 'EX', gradient: 'from-purple-400 to-purple-600' } },
      { type: 'review',   expect: { label: 'RV', gradient: 'from-pink-400 to-pink-600' } },
      { type: 'refactor', expect: { label: 'RF', gradient: 'from-emerald-400 to-emerald-600' } },
      { type: 'test',     expect: { label: 'TS', gradient: 'from-sky-400 to-sky-600' } },
      { type: 'doc',      expect: { label: 'DC', gradient: 'from-amber-400 to-amber-600' } },
      { type: 'debug',    expect: { label: 'DB', gradient: 'from-red-400 to-red-600' } },
    ];

    for (const cfg of configs) {
      await emitCollabEvent(page, 'agent:spawn:begin', {
        agent_id: cfg.type, agent_type: cfg.type, task: '工作中',
      });
      const state = await getCollabStoreState(page);
      const dot = state.agentDots.find((d: any) => d.id === cfg.type);
      expect(dot).toBeDefined();
      expect(dot.label).toBe(cfg.expect.label);
      expect(dot.gradient).toBe(cfg.expect.gradient);
      await emitCollabEvent(page, 'agent:close', { agent_id: cfg.type });
    }
  });

  /* ============================================================
   * 场景 5: 执行失败
   * ============================================================ */

  test('HF-5: spawn:end with result=failed 显示"执行失败"', async ({ page }) => {
    await emitCollabEvent(page, 'agent:spawn:begin', {
      agent_id: 'explore', agent_type: 'explore', task: '探索',
    });
    await emitCollabEvent(page, 'agent:spawn:end', {
      agent_id: 'explore', result: 'failed', duration_ms: 500,
    });
    const state = await getCollabStoreState(page);
    expect(state.compactText).toBe('执行失败');
    expect(state.agentDots[0].isActive).toBe(false);
  });

  /* ============================================================
   * 场景 6: 交互事件
   * ============================================================ */

  test('HF-6: interaction:begin/end 切换 dot 活跃态', async ({ page }) => {
    await emitCollabEvent(page, 'agent:spawn:begin', {
      agent_id: 'explore', agent_type: 'explore', task: '探索',
    });
    await emitCollabEvent(page, 'agent:spawn:end', {
      agent_id: 'explore', result: 'completed', duration_ms: 1000,
    });
    let state = await getCollabStoreState(page);
    expect(state.agentDots[0].isActive).toBe(false);

    await emitCollabEvent(page, 'agent:interaction:begin', {
      agent_id: 'explore', question: '请确认是否继续？', options: ['是', '否'],
    });
    state = await getCollabStoreState(page);
    expect(state.agentDots[0].isActive).toBe(true);
    expect(state.compactText).toContain('等待用户输入');

    await emitCollabEvent(page, 'agent:interaction:end', {
      agent_id: 'explore', response: '是',
    });
    state = await getCollabStoreState(page);
    expect(state.agentDots[0].isActive).toBe(false);
    expect(state.compactText).toContain('已收到反馈');
  });

  /* ============================================================
   * 场景 7: compactText 动态更新
   * ============================================================ */

  test('HF-7: compactText 随事件动态变化', async ({ page }) => {
    await emitCollabEvent(page, 'agent:spawn:begin', {
      agent_id: 'explore', agent_type: 'explore', task: '探索代码结构',
    });
    let state = await getCollabStoreState(page);
    expect(state.compactText).toBe('explore 正在 探索代码结构');

    await emitCollabEvent(page, 'agent:spawn:end', {
      agent_id: 'explore', result: 'completed', duration_ms: 1000,
    });
    state = await getCollabStoreState(page);
    expect(state.compactText).toBe('已完成');

    await emitCollabEvent(page, 'agent:close', { agent_id: 'explore' });
    state = await getCollabStoreState(page);
    expect(state.compactText).toBe('');

    await emitCollabEvent(page, 'agent:spawn:begin', {
      agent_id: 'review', agent_type: 'review', task: '审查代码质量',
    });
    state = await getCollabStoreState(page);
    expect(state.compactText).toBe('review 正在 审查代码质量');
  });

  /* ============================================================
   * 场景 8: 未知 agent_type 回退
   * ============================================================ */

  test('HF-8: 未知 agent_type 回退到首字母缩写 + brand 渐变色', async ({ page }) => {
    await emitCollabEvent(page, 'agent:spawn:begin', {
      agent_id: 'custom_agent', agent_type: 'custom_agent', task: '特殊任务',
    });
    const state = await getCollabStoreState(page);
    expect(state.agentDots[0].label).toBe('CU');
    expect(state.agentDots[0].gradient).toBe('from-brand-400 to-brand-600');
  });
});
