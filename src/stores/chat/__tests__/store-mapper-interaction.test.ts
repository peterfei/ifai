/**
 * StoreMapper Interaction 集成测试
 *
 * 覆盖：
 * - UT-B.1 ~ UT-B.5: normalizeInteractionData 纯函数
 * - IT-B.6 ~ IT-B.10: workflow:progress(ask_user) + workflow:feedback 集成
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock @tauri-apps/api/core（必须放在文件顶部，vitest 会 hoist）
const invokeMock = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: any[]) => invokeMock(...args),
}));

// 动态导入需要 mock 生效后才能进行
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
});

afterEach(() => {
  useChatStore.setState({ messages: [], isLoading: false });
});

/* ==================== */
/* UT-B: 纯函数测试      */
/* ==================== */

describe('normalizeInteractionData', () => {
  /* UT-B.1 */
  it('UT-B.1: questions 数组透传', async () => {
    const { normalizeInteractionData } = await import('../StoreMapper');
    const input = {
      title: '选择策略',
      questions: [
        { id: 'q1', type: 'single', question: '?', options: [{ id: 'a', label: 'A', desc: '' }] },
      ],
    };
    const result = normalizeInteractionData(input);
    expect(result).not.toBeNull();
    expect(result!.questions).toHaveLength(1);
    expect(result!.questions[0].id).toBe('q1');
    expect(result!.questions[0].options[0].label).toBe('A');
  });

  /* UT-B.2 */
  it('UT-B.2: 旧格式归一化', async () => {
    const { normalizeInteractionData } = await import('../StoreMapper');
    const input = {
      title: '选择策略',
      type: 'single',
      question: '请选择：',
      options: [{ id: 'a', label: 'A', desc: 'desc' }],
      compactAsk: '等待中...',
    };
    const result = normalizeInteractionData(input);
    expect(result).not.toBeNull();
    expect(result!.questions).toHaveLength(1);
    expect(result!.questions[0].id).toBe('_default');
    expect(result!.questions[0].type).toBe('single');
    expect(result!.questions[0].question).toBe('请选择：');
    expect(result!.questions[0].options).toHaveLength(1);
    expect(result!.questions[0].compactAsk).toBe('等待中...');
  });

  /* UT-B.3 */
  it('UT-B.3: 多问题 type → multiple', async () => {
    const { normalizeInteractionData } = await import('../StoreMapper');
    const input = {
      title: '选择方案',
      questions: [
        { id: 'q1', type: 'single', question: 'Q1', options: [{ id: 'a', label: 'A', desc: '' }] },
        { id: 'q2', type: 'multiple', question: 'Q2', options: [{ id: 'b', label: 'B', desc: '' }] },
      ],
    };
    const result = normalizeInteractionData(input);
    expect(result!.type).toBe('multiple');
  });

  /* UT-B.4 */
  it('UT-B.4: 单问题 type 继承', async () => {
    const { normalizeInteractionData } = await import('../StoreMapper');
    const input = {
      title: '测试',
      questions: [
        { id: 'q1', type: 'multiple', question: 'Q?', options: [{ id: 'a', label: 'A', desc: '' }] },
      ],
    };
    const result = normalizeInteractionData(input);
    expect(result!.type).toBe('multiple'); // 继承 questions[0].type
  });

  /* UT-B.5 */
  it('UT-B.5: 空 options 兼容', async () => {
    const { normalizeInteractionData } = await import('../StoreMapper');
    const input = {
      title: '测试',
      type: 'single',
      question: '?',
      options: [],
      compactAsk: 'wait',
    };
    // 空 options 数组 → 不满足旧格式条件（options.length > 0）
    expect(normalizeInteractionData(input)).toBeNull();
  });

  it('null/undefined 输入 → null', async () => {
    const { normalizeInteractionData } = await import('../StoreMapper');
    expect(normalizeInteractionData(null)).toBeNull();
    expect(normalizeInteractionData(undefined)).toBeNull();
  });

  it('缺失 title 时 title 为空字符串', async () => {
    const { normalizeInteractionData } = await import('../StoreMapper');
    const input = {
      questions: [{ id: 'q1', type: 'single', question: '?', options: [{ id: 'a', label: 'A', desc: '' }] }],
    };
    const result = normalizeInteractionData(input);
    expect(result!.title).toBe('');
  });
});

/* ==================== */
/* IT-B: 集成测试        */
/* ==================== */

describe('workflow:progress(ask_user) → 消息注入', () => {
  beforeEach(async () => {
    // 初始化 StoreMapper，注册 EventBus 监听器
    // 需要先有消息在 store 中（workflow:progress 不依赖此条件，但 ask_user 分支需要 store 存在）
    useChatStore.setState({ messages: [] });
    initStoreMapper();
    // 给 EventBus 监听器注册留出时间
    await new Promise(r => setTimeout(r, 30));
  });

  /* IT-B.6 */
  it('IT-B.6: emit ask_user → messages 包含 interaction 消息', async () => {
    chatEventBus.emit('workflow:progress', {
      workflowId: 'test-wf-1',
      event_type: 'ask_user',
      node_id: 'node-1',
      message: '选择策略',
      tool_details: {
        tool_name: 'request_user_input',
        tool_input: JSON.stringify({
          title: '选择迁移策略',
          questions: [{ id: 'q1', type: 'single', question: '请选择：', options: [{ id: 'a', label: '全面重构', desc: '重写整个模块' }] }],
        }),
      },
    });

    // 给 StoreMapper 异步处理留出时间
    await new Promise(r => setTimeout(r, 50));

    const state = useChatStore.getState();
    const interactionMsg = state.messages.find((m: any) => m.metadata?.interactionData);
    expect(interactionMsg).toBeDefined();
  });

  /* IT-B.7 */
  it('IT-B.7: interactionData 包含 questions 数组', async () => {
    chatEventBus.emit('workflow:progress', {
      workflowId: 'test-wf-2',
      event_type: 'ask_user',
      node_id: 'node-1',
      message: '选择策略',
      tool_details: {
        tool_name: 'request_user_input',
        tool_input: JSON.stringify({
          title: '选择',
          questions: [{ id: 'q1', type: 'single', question: '?', options: [{ id: 'a', label: 'A', desc: '' }] }],
        }),
      },
    });

    await new Promise(r => setTimeout(r, 50));

    const state = useChatStore.getState();
    const interactionMsg = state.messages.find((m: any) => m.metadata?.interactionData);
    expect(interactionMsg).toBeDefined();
    expect(interactionMsg.metadata.interactionData.questions.length).toBeGreaterThan(0);
  });

  /* IT-B.8 */
  it('IT-B.8: 单问题模式 data.questions 一个元素', async () => {
    chatEventBus.emit('workflow:progress', {
      workflowId: 'test-wf-3',
      event_type: 'ask_user',
      node_id: 'node-1',
      message: '选择',
      tool_details: {
        tool_name: 'request_user_input',
        tool_input: JSON.stringify({
          title: 'test',
          questions: [{ id: 'q1', type: 'single', question: '?', options: [{ id: 'a', label: 'A', desc: '' }] }],
        }),
      },
    });

    await new Promise(r => setTimeout(r, 50));

    const state = useChatStore.getState();
    const interactionMsg = state.messages.find((m: any) => m.metadata?.interactionData);
    expect(interactionMsg.metadata.interactionData.questions).toHaveLength(1);
  });
});

describe('workflow:feedback → invoke + 消息状态更新', () => {
  beforeEach(async () => {
    useChatStore.setState({ messages: [] });
    initStoreMapper();
    await new Promise(r => setTimeout(r, 30));
  });

  /* IT-B.9 */
  it('IT-B.9: workflow:feedback → invoke 被调用', async () => {
    invokeMock.mockResolvedValue(undefined);

    // 预注入一条含 feedbackRequestId 的消息
    useChatStore.setState({
      messages: [{
        id: 'interaction-fb',
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        metadata: {
          workflowId: 'test-wf-fb',
          feedbackRequestId: 'req-123',
          interactionData: { title: 'test', questions: [] },
        },
      }],
    });

    chatEventBus.emit('workflow:feedback', {
      workflowId: 'test-wf-fb',
      questionAnswers: [{ questionId: 'q1', selectedIds: ['a'] }],
      action: 'continue',
    });

    await new Promise(r => setTimeout(r, 50));

    expect(invokeMock).toHaveBeenCalledWith('submit_user_feedback', {
      feedbackRequestId: 'req-123',
      feedback: { questionAnswers: [{ questionId: 'q1', selectedIds: ['a'] }], action: 'continue' },
    });
  });

  /* IT-B.10 */
  it('IT-B.10: workflow:feedback → interaction 消息状态变为 answered', async () => {
    invokeMock.mockResolvedValue(undefined);

    // 先注入一条含 feedbackRequestId 的 interaction 消息
    useChatStore.setState({
      messages: [{
        id: 'interaction-msg',
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        metadata: {
          workflowId: 'test-wf-ans',
          feedbackRequestId: 'req-456',
          interactionData: {
            title: 'test',
            questions: [{ id: 'q1', type: 'single', question: '?', options: [{ id: 'a', label: 'A', desc: '' }] }],
          },
        },
      }],
    });

    chatEventBus.emit('workflow:feedback', {
      workflowId: 'test-wf-ans',
      questionAnswers: [{ questionId: 'q1', selectedIds: ['a'] }],
    });

    await new Promise(r => setTimeout(r, 50));

    const state = useChatStore.getState();
    const interactionMsg = state.messages.find((m: any) => m.metadata?.interactionData);
    expect(interactionMsg).toBeDefined();
    expect(interactionMsg.status).toBe('answered');
  });
});
