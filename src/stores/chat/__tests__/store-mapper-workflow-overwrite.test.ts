/**
 * StoreMapper Workflow phaseData 覆盖测试
 *
 * 验证 workflow:started → chat:message:sent 事件顺序：
 * workflow:started 设置正确的多节点 phaseData，
 * chat:message:sent（合成 phaseData）不应覆盖它。
 *
 * Bug scenario: /review . (code_review) 工作流
 * 1. workflow:started → phaseData = [{explore_0}, {review_0}, {refactor_0}]
 * 2. chat:message:sent → synthetic phaseData = [{task}]
 * 3. 后续 progress 事件 node_id explre_0/review_0/refactor_0 不匹配 'task'
 *    导致 WorkflowView 永久显示 "等待中..."
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock @tauri-apps/api/core（必须放在文件顶部，vitest 会 hoist）
const invokeMock = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: any[]) => invokeMock(...args),
}));

let chatEventBus: any;
let useChatStore: any;
let initStoreMapper: any;

beforeEach(async () => {
  vi.clearAllMocks();
  // 清理 HMR 防护标志，确保 initStoreMapper 能执行
  if (typeof window !== 'undefined') {
    delete (window as any).__STORE_MAPPER_INITIALIZED__;
  }

  const eventBusModule = await import('../eventBus/ChatEventBus');
  chatEventBus = eventBusModule.chatEventBus;

  const storeModule = await import('../CoreStoreProxy');
  useChatStore = storeModule.useChatStore;

  const mapperModule = await import('../StoreMapper');
  initStoreMapper = mapperModule.initStoreMapper;

  // 重置 store
  useChatStore.setState({ messages: [], isLoading: false });
  initStoreMapper();
});

afterEach(() => {
  useChatStore.setState({ messages: [], isLoading: false });
});

/* ==================== */
/* WF phaseData 覆盖测试 */
/* ==================== */

describe('workflow:started → chat:message:sent phaseData 覆盖', () => {
  /* WF-OVERWRITE-1 */
  it('不应用合成 phaseData 覆盖 workflow:started 的多节点 phaseData', async () => {
    const workflowId = 'wf-review-1';
    const correlationId = 'corr-review-1';

    // Step 1: workflow:started 创建 3 个真实节点
    chatEventBus.emit('workflow:started', {
      workflowId,
      nodes: [
        { id: 'explore_0', label: '扫描项目结构' },
        { id: 'review_0', label: '代码审查' },
        { id: 'refactor_0', label: '代码重构' },
      ],
      workflowType: 'code_review',
      correlationId,
    });

    await new Promise(resolve => setTimeout(resolve, 100));

    // 验证: workflow:started 创建了 3 个 phase 的消息
    let state = useChatStore.getState();
    let assistantMsg = state.messages.find(
      (m: any) => m.role === 'assistant' && m.metadata?.workflowId === workflowId
    );
    expect(assistantMsg).toBeDefined();
    expect(assistantMsg.metadata?.phaseData).toHaveLength(3);

    const initialNodeIds = assistantMsg.metadata.phaseData.map((p: any) => p.nodeId);
    expect(initialNodeIds).toEqual(['explore_0', 'review_0', 'refactor_0']);

    // Step 2: chat:message:sent 模拟编排器重新发送
    chatEventBus.emit('chat:message:sent', {
      messageId: `user-${workflowId}`,
      content: '/review .',
      correlationId,
      sessionId: 'test-session',
      timestamp: Date.now(),
      isAssistantOnly: true,
      isWorkflowMessage: true,
      workflowId,
      workflowType: 'code_review',
    });

    await new Promise(resolve => setTimeout(resolve, 100));

    // 验证: phaseData 仍然保持 3 个节点（没有被覆盖为 1 个合成节点）
    state = useChatStore.getState();
    assistantMsg = state.messages.find(
      (m: any) => m.role === 'assistant' && m.metadata?.workflowId === workflowId
    );
    expect(assistantMsg).toBeDefined();
    expect(assistantMsg.metadata?.phaseData).toHaveLength(3);

    const finalNodeIds = assistantMsg.metadata.phaseData.map((p: any) => p.nodeId);
    expect(finalNodeIds).toEqual(['explore_0', 'review_0', 'refactor_0']);
  });

  /* WF-OVERWRITE-2 */
  it('workflow:started 收到前 chat:message:sent 创建合成数据后，workflow:started 应能修正', async () => {
    const workflowId = 'wf-review-2';
    const correlationId = 'corr-review-2';

    // Step 1: chat:message:sent 先到达（无前期 workflow:started）
    chatEventBus.emit('chat:message:sent', {
      messageId: `user-${workflowId}`,
      content: '/review .',
      correlationId,
      sessionId: 'test-session',
      timestamp: Date.now(),
      isAssistantOnly: true,
      isWorkflowMessage: true,
      workflowId,
      workflowType: 'code_review',
    });

    await new Promise(resolve => setTimeout(resolve, 100));

    // 验证: chat:message:sent 创建了 1 个合成 phase（workflow:started 未到）
    let state = useChatStore.getState();
    let assistantMsg = state.messages.find(
      (m: any) => m.role === 'assistant' && m.metadata?.workflowId === workflowId
    );
    expect(assistantMsg).toBeDefined();
    expect(assistantMsg.metadata?.phaseData).toHaveLength(1);
    expect(assistantMsg.metadata?.phaseData[0].nodeId).toBe('task');
    expect(assistantMsg.metadata?.phaseData[0].intent).toBe('执行任务');

    // Step 2: workflow:started 到达，修正 phaseData
    chatEventBus.emit('workflow:started', {
      workflowId,
      nodes: [
        { id: 'explore_0', label: '扫描项目结构' },
        { id: 'review_0', label: '代码审查' },
        { id: 'refactor_0', label: '代码重构' },
      ],
      workflowType: 'code_review',
      correlationId,
    });

    await new Promise(resolve => setTimeout(resolve, 100));

    // 验证: workflow:started 修正了 phaseData 为 3 个节点
    state = useChatStore.getState();
    assistantMsg = state.messages.find(
      (m: any) => m.role === 'assistant' && m.metadata?.workflowId === workflowId
    );
    expect(assistantMsg).toBeDefined();
    expect(assistantMsg.metadata?.phaseData).toHaveLength(3);

    const finalNodeIds = assistantMsg.metadata.phaseData.map((p: any) => p.nodeId);
    expect(finalNodeIds).toEqual(['explore_0', 'review_0', 'refactor_0']);
  });

  /* WF-OVERWRITE-3 */
  it('workflow:progress 事件应用后, phaseData nodeId 应匹配', async () => {
    const workflowId = 'wf-review-3';
    const correlationId = 'corr-review-3';

    // Step 1: workflow:started with 3 nodes
    chatEventBus.emit('workflow:started', {
      workflowId,
      nodes: [
        { id: 'explore_0', label: '扫描项目结构' },
        { id: 'review_0', label: '代码审查' },
        { id: 'refactor_0', label: '代码重构' },
      ],
      workflowType: 'code_review',
      correlationId,
    });

    await new Promise(resolve => setTimeout(resolve, 100));

    // Step 2: chat:message:sent
    chatEventBus.emit('chat:message:sent', {
      messageId: `user-${workflowId}`,
      content: '/review .',
      correlationId,
      sessionId: 'test-session',
      timestamp: Date.now(),
      isAssistantOnly: true,
      isWorkflowMessage: true,
      workflowId,
      workflowType: 'code_review',
    });

    await new Promise(resolve => setTimeout(resolve, 100));

    // Step 3: workflow:progress for explore_0 node_started
    chatEventBus.emit('workflow:progress', {
      workflowId,
      event_type: 'node_started',
      node_id: 'explore_0',
      tool_details: { tool_name: 'agent_scan_project', tool_input: '{"path":"."}' },
    });

    await new Promise(resolve => setTimeout(resolve, 100));

    // Step 4: workflow:progress for explore_0 node_completed
    chatEventBus.emit('workflow:progress', {
      workflowId,
      event_type: 'node_completed',
      node_id: 'explore_0',
      completion_stats: { elapsed: 5.2, tools: 3, tokens: 150 },
    });

    await new Promise(resolve => setTimeout(resolve, 100));

    // Step 5: workflow:progress for review_0 node_started
    chatEventBus.emit('workflow:progress', {
      workflowId,
      event_type: 'node_started',
      node_id: 'review_0',
      tool_details: { tool_name: 'read_file', tool_input: '{"path":"src/main.ts"}' },
    });

    await new Promise(resolve => setTimeout(resolve, 100));

    // 验证: phaseData 应有 3 个节点（没有被 chat:message:sent 覆盖）
    const state = useChatStore.getState();
    const assistantMsg = state.messages.find(
      (m: any) => m.role === 'assistant' && m.metadata?.workflowId === workflowId
    );
    expect(assistantMsg).toBeDefined();

    const phaseData = assistantMsg.metadata?.phaseData;
    expect(phaseData).toHaveLength(3);

    // explore_0 应为 done
    const explorePhase = phaseData.find((p: any) => p.nodeId === 'explore_0');
    expect(explorePhase).toBeDefined();
    expect(explorePhase.status).toBe('done');
    expect(explorePhase.progress).toBe(100);

    // review_0 应为 running
    const reviewPhase = phaseData.find((p: any) => p.nodeId === 'review_0');
    expect(reviewPhase).toBeDefined();
    expect(reviewPhase.status).toBe('running');

    // refactor_0 应为 pending
    const refactorPhase = phaseData.find((p: any) => p.nodeId === 'refactor_0');
    expect(refactorPhase).toBeDefined();
    expect(refactorPhase.status).toBe('pending');
  });
});
