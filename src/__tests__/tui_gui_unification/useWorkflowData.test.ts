import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWorkflowData } from '../../hooks/useWorkflowData';
import type { ToolItem, NodeData } from '../../types/workflow';

const mockNode = (overrides?: Partial<NodeData>): NodeData => ({
  nodeId: 'n1',
  agentType: 'Explore',
  intent: '结构分析',
  status: 'running',
  tools: [
    { toolName: 'read_file', status: 'done', elapsedSecs: 0.02, target: 'src/main.rs', tokenCount: 100 },
    { toolName: 'grep', status: 'running', elapsedSecs: 0.15, target: 'src/lib.rs' },
  ],
  elapsedSecs: 0.17,
  totalTokens: 100,
  ...overrides,
});

describe('useWorkflowData', () => {
  // UT-D.1.4: 初始态
  it('UT-D.1.4: returns pending state initially', () => {
    const { result } = renderHook(() => useWorkflowData([]));
    expect(result.current.nodes).toEqual([]);
    expect(result.current.status).toBe('running');
    expect(result.current.totalElapsedSecs).toBe(0);
    expect(result.current.totalTokens).toBe(0);
    expect(result.current.totalTools).toBe(0);
  });

  // UT-D.1.6: node 事件更新
  it('UT-D.1.6: updates node by nodeId', () => {
    const { result } = renderHook(() => useWorkflowData([mockNode()]));
    expect(result.current.nodes[0].status).toBe('running');

    act(() => {
      result.current.handleProgressEvent({
        type: 'node',
        payload: { nodeId: 'n1', status: 'done', elapsedSecs: 0.5, totalTokens: 200 },
      });
    });

    const node = result.current.nodes.find(n => n.nodeId === 'n1');
    expect(node?.status).toBe('done');
    expect(node?.elapsedSecs).toBe(0.5);
    expect(node?.totalTokens).toBe(200);
  });

  // UT-D.1.5: tool 事件更新
  it('UT-D.1.5: updates tool by nodeId + toolName', () => {
    const { result } = renderHook(() => useWorkflowData([mockNode()]));

    act(() => {
      result.current.handleProgressEvent({
        type: 'tool',
        payload: { nodeId: 'n1', toolName: 'grep', status: 'done', elapsedSecs: 0.3, target: 'src/lib.rs', tokenCount: 50 },
      });
    });

    const tools = result.current.nodes.find(n => n.nodeId === 'n1')?.tools ?? [];
    const grepTool = tools.find(t => t.toolName === 'grep');
    expect(grepTool?.status).toBe('done');
    expect(grepTool?.elapsedSecs).toBe(0.3);
    expect(grepTool?.tokenCount).toBe(50);

    // read_file 不变
    const readTool = tools.find(t => t.toolName === 'read_file');
    expect(readTool?.status).toBe('done');
    expect(readTool?.elapsedSecs).toBe(0.02);
  });

  // UT-D.1.10: tool 首次 append
  it('UT-D.1.10: appends new tool when toolName not in list', () => {
    const initialNode = mockNode({ tools: [] });
    const { result } = renderHook(() => useWorkflowData([initialNode]));

    act(() => {
      result.current.handleProgressEvent({
        type: 'tool',
        payload: { nodeId: 'n1', toolName: 'scan_project', status: 'running', elapsedSecs: 0, target: 'scanning...' },
      });
    });

    const tools = result.current.nodes.find(n => n.nodeId === 'n1')?.tools ?? [];
    expect(tools).toHaveLength(1);
    expect(tools[0].toolName).toBe('scan_project');
  });

  // UT-D.1.8: summary 事件更新
  it('UT-D.1.8: updates summary fields', () => {
    const { result } = renderHook(() => useWorkflowData([mockNode()]));

    act(() => {
      result.current.handleProgressEvent({
        type: 'summary',
        payload: { totalElapsedSecs: 1.2, totalTokens: 6000, totalTools: 5 },
      });
    });

    expect(result.current.totalElapsedSecs).toBe(1.2);
    expect(result.current.totalTokens).toBe(6000);
    expect(result.current.totalTools).toBe(5);
    expect(result.current.status).toBe('done');
  });

  // UT-D.1.9: 未知 type 静默跳过
  it('UT-D.1.9: unknown type silently skipped', () => {
    const { result } = renderHook(() => useWorkflowData([mockNode()]));

    act(() => {
      (result.current as any).handleProgressEvent({ type: 'unknown', payload: {} });
    });

    expect(result.current.nodes).toHaveLength(1);
    expect(result.current.nodes[0].status).toBe('running');
  });

  // PROGRESS_HANDLERS 三个条目都存在
  it('UT-D.1.5: PROGRESS_HANDLERS has tool/node/summary entries', () => {
    const { result } = renderHook(() => useWorkflowData([]));
    const handlers = (result.current as any).getHandlers();
    expect(handlers).toHaveProperty('tool');
    expect(handlers).toHaveProperty('node');
    expect(handlers).toHaveProperty('summary');
  });
});
