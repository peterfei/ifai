import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { WorkflowView } from '../../components/workflow/WorkflowView';
import type { WorkflowData } from '../../types/workflow';

const mockNode = (overrides?: Partial<WorkflowData['nodes'][0]>): WorkflowData['nodes'][0] => ({
  nodeId: 'n1',
  agentType: 'Explore',
  intent: '结构分析',
  status: 'done',
  tools: [
    { toolName: 'read_file', status: 'done', elapsedSecs: 0.02, target: 'src/main.rs', tokenCount: 100 },
    { toolName: 'grep', status: 'done', elapsedSecs: 0.15, target: 'src/lib.rs', tokenCount: 50 },
  ],
  elapsedSecs: 0.17,
  totalTokens: 150,
  ...overrides,
});

const mockData = (overrides?: Partial<WorkflowData>): WorkflowData => ({
  workflowId: 'w1',
  intent: '分析项目架构',
  nodes: [mockNode(), mockNode({ nodeId: 'n2', intent: '依赖分析', status: 'running', tools: [{ toolName: 'grep', status: 'running', elapsedSecs: 0.1, target: 'Cargo.toml' }], elapsedSecs: 0.1, totalTokens: 50 })],
  totalElapsedSecs: 0.27,
  totalTokens: 200,
  totalTools: 3,
  status: 'running',
  ...overrides,
});

describe('WorkflowView', () => {
  // UT-E.1.1: 空数据
  it('UT-E.1.1: returns null for null/undefined/empty data', () => {
    const { container: c1 } = render(<WorkflowView workflowData={null as unknown as WorkflowData} />);
    expect(c1.textContent).toBe('');

    const { container: c2 } = render(<WorkflowView workflowData={undefined as unknown as WorkflowData} />);
    expect(c2.textContent).toBe('');

    const { container: c3 } = render(<WorkflowView workflowData={{ ...mockData(), nodes: [] }} />);
    expect(c3.textContent).toBe('');
  });

  // UT-E.1.2: 2 节点完整渲染
  it('UT-E.1.2: renders header + 2 sections + summary for 2 nodes', () => {
    const { container } = render(<WorkflowView workflowData={mockData()} />);
    const text = container.textContent ?? '';
    expect(text).toContain('分析项目架构');
    expect(text).toContain('结构分析');
    expect(text).toContain('依赖分析');
    expect(text).toContain('Running');
    expect(text).toContain('3 tools');
  });

  // UT-E.1.3: 节点独立性
  it('UT-E.1.3: nodes render independently with different statuses', () => {
    const data = mockData({
      nodes: [
        mockNode({ nodeId: 'n1', intent: '已完成节点', status: 'done', tools: [{ toolName: 'scan', status: 'done', elapsedSecs: 0.5, target: 'src/', tokenCount: 100 }], elapsedSecs: 0.5, totalTokens: 100 }),
        mockNode({ nodeId: 'n2', intent: '运行中节点', status: 'running', tools: [{ toolName: 'grep', status: 'running', elapsedSecs: 0.3, target: '*.ts' }], elapsedSecs: 0.3, totalTokens: 0 }),
        mockNode({ nodeId: 'n3', intent: '待处理节点', status: 'pending', tools: [], elapsedSecs: 0, totalTokens: 0 }),
      ],
    });
    const { container } = render(<WorkflowView workflowData={data} />);
    const text = container.textContent ?? '';
    expect(text).toContain('已完成节点');
    expect(text).toContain('运行中节点');
    expect(text).toContain('待处理节点');
    expect(text).toContain('✔');
    expect(text).toContain('⏳');
  });

  // UT-E.1.4: 1 节点渲染
  it('UT-E.1.4: renders correctly with single node', () => {
    const data = mockData({ nodes: [mockNode()], status: 'done', totalTools: 2 });
    const { container } = render(<WorkflowView workflowData={data} />);
    const text = container.textContent ?? '';
    expect(text).toContain('分析项目架构');
    expect(text).toContain('结构分析');
    expect(text).toContain('Workflow complete');
  });

  // IT-E.2.1: 事件驱动工具更新（模拟数据流）
  it('IT-E.2.1: renders updated tools when workflowData changes', () => {
    const { container, rerender } = render(<WorkflowView workflowData={mockData()} />);
    expect(container.textContent).toContain('read_file');
    expect(container.textContent).toContain('grep');

    // 模拟新增工具后的重新渲染
    const updatedData = mockData({
      nodes: [
        mockNode({ nodeId: 'n1', intent: '结构分析', status: 'running', tools: [
          { toolName: 'read_file', status: 'done', elapsedSecs: 0.02, target: 'src/main.rs', tokenCount: 100 },
          { toolName: 'grep', status: 'running', elapsedSecs: 0.15, target: 'src/lib.rs' },
          { toolName: 'scan_project', status: 'running', elapsedSecs: 0.5, target: 'scanning...' },
        ], elapsedSecs: 0.67, totalTokens: 100 }),
        mockNode({ nodeId: 'n2', intent: '依赖分析', status: 'running', tools: [{ toolName: 'grep', status: 'running', elapsedSecs: 0.1, target: 'Cargo.toml' }], elapsedSecs: 0.1, totalTokens: 50 }),
      ],
      totalTools: 4,
      totalElapsedSecs: 0.77,
    });
    rerender(<WorkflowView workflowData={updatedData} />);
    expect(container.textContent).toContain('scan_project');
    expect(container.textContent).toMatch(/4 tools/);
  });

  // ── Agent 类型无关性测试（design.md §7） ──

  // UT-A.1.1: Review agent 类型
  it('UT-A.1.1: renders Review agent type correctly', () => {
    const data = mockData({
      intent: '审查代码质量',
      nodes: [
        mockNode({ nodeId: 'r1', agentType: 'Review', intent: '代码审查', status: 'done', tools: [
          { toolName: 'read_file', status: 'done', elapsedSecs: 0.3, target: 'src/auth.rs', tokenCount: 200 },
          { toolName: 'bash', status: 'done', elapsedSecs: 2.1, target: 'cargo check', tokenCount: 50 },
        ], elapsedSecs: 2.4, totalTokens: 250 }),
      ],
      totalTools: 2,
      totalElapsedSecs: 2.4,
      status: 'done',
    });
    const { container } = render(<WorkflowView workflowData={data} />);
    const text = container.textContent ?? '';
    expect(text).toContain('审查代码质量');
    expect(text).toContain('Review');
    expect(text).toContain('[代码审查]');
    expect(text).toContain('cargo check');
    expect(text).toContain('Workflow complete');
  });

  // UT-A.1.2: Refactor agent 类型
  it('UT-A.1.2: renders Refactor agent type correctly', () => {
    const data = mockData({
      intent: '重构数据库模块',
      nodes: [
        mockNode({ nodeId: 'rf1', agentType: 'Refactor', intent: '提取公共逻辑', status: 'running', tools: [
          { toolName: 'read_file', status: 'done', elapsedSecs: 0.1, target: 'src/db/mod.rs' },
          { toolName: 'write', status: 'running', elapsedSecs: 0.8, target: 'src/db/common.rs' },
        ], elapsedSecs: 0.9, totalTokens: 300 }),
      ],
      totalTools: 2,
      totalElapsedSecs: 0.9,
      status: 'running',
    });
    const { container } = render(<WorkflowView workflowData={data} />);
    const text = container.textContent ?? '';
    expect(text).toContain('重构数据库模块');
    expect(text).toContain('Refactor');
    expect(text).toContain('[提取公共逻辑]');
    expect(text).toContain('write');
    expect(text).toContain('Running');
  });

  // UT-A.1.3: Test agent 类型
  it('UT-A.1.3: renders Test agent type correctly', () => {
    const data = mockData({
      intent: '运行测试套件',
      nodes: [
        mockNode({ nodeId: 't1', agentType: 'Test', intent: '单元测试', status: 'running', tools: [
          { toolName: 'read_file', status: 'done', elapsedSecs: 0.05, target: 'Cargo.toml' },
          { toolName: 'bash', status: 'running', elapsedSecs: 3.2, target: 'cargo test' },
          { toolName: 'read_file', status: 'done', elapsedSecs: 0.1, target: 'tests/test_auth.rs' },
        ], elapsedSecs: 3.35, totalTokens: 150 }),
      ],
      totalTools: 3,
      totalElapsedSecs: 3.35,
      totalTokens: 150,
      status: 'running',
    });
    const { container } = render(<WorkflowView workflowData={data} />);
    const text = container.textContent ?? '';
    expect(text).toContain('运行测试套件');
    expect(text).toContain('Test');
    expect(text).toContain('[单元测试]');
    expect(text).toContain('cargo test');
    expect(text).toContain('3 tools');
  });

  // UT-A.1.4: General-purpose agent 类型
  it('UT-A.1.4: renders General agent type correctly', () => {
    const data = mockData({
      intent: '通用任务处理',
      nodes: [
        mockNode({ nodeId: 'g1', agentType: 'General', intent: '分析依赖', status: 'done', tools: [
          { toolName: 'grep', status: 'done', elapsedSecs: 0.2, target: '"tokio" in .' },
          { toolName: 'bash', status: 'done', elapsedSecs: 1.5, target: 'cargo tree' },
        ], elapsedSecs: 1.7, totalTokens: 400 }),
      ],
      totalTools: 2,
      totalElapsedSecs: 1.7,
      status: 'done',
    });
    const { container } = render(<WorkflowView workflowData={data} />);
    const text = container.textContent ?? '';
    expect(text).toContain('通用任务处理');
    expect(text).toContain('General');
    expect(text).toContain('[分析依赖]');
    expect(text).toContain('grep');
    expect(text).toContain('cargo tree');
    expect(text).toContain('Workflow complete');
  });

  // UT-A.1.5: 混合 agent 类型（多节点工作流中不同 agentType）
  it('UT-A.1.5: renders mixed agent types in a single workflow', () => {
    const data: WorkflowData = {
      workflowId: 'w-mixed',
      intent: '代码审查与重构',
      nodes: [
        { nodeId: 'n1', agentType: 'Review', intent: '审查代码', status: 'done', tools: [
          { toolName: 'read_file', status: 'done', elapsedSecs: 0.2, target: 'src/main.rs' },
        ], elapsedSecs: 0.2, totalTokens: 100 },
        { nodeId: 'n2', agentType: 'Refactor', intent: '重构模块', status: 'running', tools: [
          { toolName: 'write', status: 'running', elapsedSecs: 0.5, target: 'src/refactored.rs' },
        ], elapsedSecs: 0.5, totalTokens: 50 },
        { nodeId: 'n3', agentType: 'Test', intent: '验证重构', status: 'pending', tools: [], elapsedSecs: 0, totalTokens: 0 },
      ],
      totalElapsedSecs: 0.7,
      totalTokens: 150,
      totalTools: 2,
      status: 'running',
    };
    const { container } = render(<WorkflowView workflowData={data} />);
    const text = container.textContent ?? '';
    // 每种 agentType 都应在子节点列表中出现
    expect(text).toContain('Review');
    expect(text).toContain('Refactor');
    expect(text).toContain('Test');
    expect(text).toContain('审查代码');
    expect(text).toContain('重构模块');
    expect(text).toContain('验证重构');
    // 工具内容正确
    expect(text).toContain('write');
    expect(text).toContain('src/main.rs');
  });

  // UT-A.1.6: 空 agentType（修复后的默认值行为）
  it('UT-A.1.6: renders with empty agentType (default after fix)', () => {
    const data: WorkflowData = {
      workflowId: 'w-empty-agent',
      intent: '未知类型任务',
      nodes: [
        { nodeId: 'n1', agentType: '', intent: '通用步骤', status: 'done', tools: [
          { toolName: 'read_file', status: 'done', elapsedSecs: 0.1, target: 'config.json' },
        ], elapsedSecs: 0.1, totalTokens: 50 },
      ],
      totalElapsedSecs: 0.1,
      totalTokens: 50,
      totalTools: 1,
      status: 'done',
    };
    const { container } = render(<WorkflowView workflowData={data} />);
    const text = container.textContent ?? '';
    expect(text).toContain('未知类型任务');
    expect(text).toContain('[通用步骤]');
    // agentType 为空时不显示多余前缀
    expect(text).toContain('config.json');
    expect(text).toContain('Workflow complete');
  });

  // IT-E.2.2: 逐步完成验证
  it('IT-E.2.2: progressive completion changes states correctly', () => {
    // Step 1: all running
    const step1 = mockData({
      nodes: [
        mockNode({ nodeId: 'n1', intent: '扫描', status: 'running', tools: [
          { toolName: 'scan', status: 'running', elapsedSecs: 0.1, target: 'src/' },
        ], elapsedSecs: 0.1, totalTokens: 0 }),
      ],
      status: 'running',
      totalTools: 1,
      totalElapsedSecs: 0.1,
    });
    const { container, rerender } = render(<WorkflowView workflowData={step1} />);
    expect(container.textContent).toContain('Running');
    expect(container.textContent).toContain('scan');

    // Step 2: tool done, node still running (other tools pending)
    const step2 = mockData({
      nodes: [
        mockNode({ nodeId: 'n1', intent: '扫描', status: 'running', tools: [
          { toolName: 'scan', status: 'done', elapsedSecs: 0.5, target: 'src/', tokenCount: 200 },
          { toolName: 'analyze', status: 'running', elapsedSecs: 0.2, target: 'src/main.rs' },
        ], elapsedSecs: 0.7, totalTokens: 200 }),
      ],
      status: 'running',
      totalTools: 2,
      totalElapsedSecs: 0.7,
    });
    rerender(<WorkflowView workflowData={step2} />);
    expect(container.textContent).toContain('analyze');
    expect(container.textContent).toContain('Running');

    // Step 3: all done
    const step3 = mockData({
      nodes: [
        mockNode({ nodeId: 'n1', intent: '扫描', status: 'done', tools: [
          { toolName: 'scan', status: 'done', elapsedSecs: 0.5, target: 'src/', tokenCount: 200 },
          { toolName: 'analyze', status: 'done', elapsedSecs: 0.8, target: 'src/main.rs', tokenCount: 300 },
        ], elapsedSecs: 1.3, totalTokens: 500 }),
      ],
      status: 'done',
      totalTools: 2,
      totalElapsedSecs: 1.3,
      totalTokens: 500,
    });
    rerender(<WorkflowView workflowData={step3} />);
    expect(container.textContent).toContain('Workflow complete');
    expect(container.textContent).toContain('2 tools');
  });
});
