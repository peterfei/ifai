/**
 * LLM 消歧测试：复合意图（代码生成 + 测试）→ refactor_test 工作流
 *
 * 核心场景："帮我生成2048小游戏 并写测试用例" 不应触发 refactor_test 工作流
 * LLM 判断为 create_new → 跳过工作流，走正常 AI 聊天
 * LLM 判断为 refactor_existing → 触发工作流
 * LLM 调用失败 → 保守回退，触发工作流
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ===== Mock 设置（需在文件顶部，vitest 会 hoist） =====

const invokeMock = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: any[]) => invokeMock(...args),
}));

// settingsStore 需要返回有效 provider 以触发 LLM 调用
vi.mock('../../settingsStore', () => ({
  useSettingsStore: {
    getState: () => ({
      providers: [
        {
          id: 'test-provider',
          name: 'Test',
          protocol: 'openai',
          apiKey: 'test-key',
          baseUrl: 'https://test.com',
          models: ['gpt-4o'],
          enabled: true,
        },
      ],
      currentProviderId: 'test-provider',
      currentModel: 'gpt-4o',
    }),
  },
}));

// ===== 测试 =====

describe('LLM 消歧: refactor_test 复合意图', () => {
  let workflowIntentHandler: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    const mod = await import('../sendMessage/WorkflowIntentHandler');
    workflowIntentHandler = mod.workflowIntentHandler;
  });

  // WF-LLM-1: 创建新项目 → 不走工作流
  it('WF-LLM-1: LLM 返回 new → 跳过工作流（正常聊天）', async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === 'ai_completion') return 'new';
      return 'mock-workflow-id';
    });

    const result = await workflowIntentHandler.recognizeWorkflowIntent(
      '帮我生成2048小游戏 并写测试用例'
    );

    expect(result.isWorkflow).toBe(false);
    expect(result.workflowType).toBeUndefined();
  });

  // WF-LLM-2: 重构已有代码 → 触发 refactor_test 工作流
  it('WF-LLM-2: LLM 返回 refactor → 触发 refactor_test 工作流', async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === 'ai_completion') return 'refactor';
      return 'mock-workflow-id';
    });

    // 文本必须同时包含 CODE_GEN_PATTERNS（生成/创建/实现/添加）和 test pattern
    const result = await workflowIntentHandler.recognizeWorkflowIntent(
      '修改登录模块，生成单元测试'
    );

    expect(result.isWorkflow).toBe(true);
    expect(result.workflowType).toBe('refactor_test');
    expect(result.confidence).toBe(0.85);
  });

  // WF-LLM-3: LLM 调用失败 → 保守回退，仍然触发工作流
  it('WF-LLM-3: LLM 调用失败 → 保守回退，触发工作流', async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === 'ai_completion') throw new Error('API unavailable');
      return 'mock-workflow-id';
    });

    // 文本必须同时包含 CODE_GEN_PATTERNS 和 test pattern
    const result = await workflowIntentHandler.recognizeWorkflowIntent(
      '添加测试覆盖到现有模块'
    );

    // 保守策略：LLM 失败时仍然触发工作流
    expect(result.isWorkflow).toBe(true);
    expect(result.workflowType).toBe('refactor_test');
  });

  // WF-LLM-4: 只有代码生成, 无测试 → 不走复合意图
  it('WF-LLM-4: 仅代码生成无测试 → 不走复合意图', async () => {
    const result = await workflowIntentHandler.recognizeWorkflowIntent(
      '帮我生成2048小游戏'
    );

    // 只有 code gen 没有 test patterns，不触发复合意图
    expect(result.isWorkflow).toBe(false);
  });

  // WF-LLM-5: 斜杠命令不受影响
  it('WF-LLM-5: 斜杠命令不受 LLM 消歧影响', async () => {
    const result = await workflowIntentHandler.recognizeWorkflowIntent(
      '/review .'
    );

    expect(result.isWorkflow).toBe(true);
    expect(result.workflowType).toBe('code_review');
  });

  // WF-LLM-6: invoke 未调用 ai_completion 当不是复合意图时
  it('WF-LLM-6: 非复合意图不调用 LLM 消歧', async () => {
    const invokeSpy = vi.fn(async (cmd: string) => {
      if (cmd === 'ai_completion') return 'refactor';
      return 'mock-workflow-id';
    });
    invokeMock.mockImplementation(invokeSpy);

    await workflowIntentHandler.recognizeWorkflowIntent('你好，今天天气怎么样');

    // ai_completion 不应被调用
    const aiCompletionCalls = invokeSpy.mock.calls.filter(
      (c: any[]) => c[0] === 'ai_completion'
    );
    expect(aiCompletionCalls).toHaveLength(0);
  });
});
