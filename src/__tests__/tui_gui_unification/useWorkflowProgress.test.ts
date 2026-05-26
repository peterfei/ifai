import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWorkflowProgress } from '../../hooks/useWorkflowProgress';
import type { ProgressPayload } from '../../types/workflow';

const mockInitialPhases = [
  { nodeId: 'phase1', mode: 'sequential' as const, intent: '第一步' },
  { nodeId: 'phase2', mode: 'parallel' as const, intent: '第二步' },
  { nodeId: 'phase3', mode: 'sequential' as const, intent: '第三步' },
];

describe('useWorkflowProgress', () => {
  beforeEach(() => {
    // 清理
  });

  // UT-D.1.2: 初始状态返回空数组
  it('UT-D.1.2: returns empty array initially', () => {
    const { result } = renderHook(() => useWorkflowProgress({ listenEvents: false }));
    expect(result.current.phaseData).toEqual([]);
    expect(result.current.isRunning).toBe(false);
    expect(result.current.completedCount).toBe(0);
  });

  // UT-D.1.1: 初始 phase 正确初始化
  it('UT-D.1.1: initializes with given phases', () => {
    const { result } = renderHook(() =>
      useWorkflowProgress({ initialPhases: mockInitialPhases, listenEvents: false })
    );
    expect(result.current.phaseData).toHaveLength(3);
    expect(result.current.totalCount).toBe(3);
    expect(result.current.phaseData[0].status).toBe('pending');
    expect(result.current.phaseData[0].progress).toBe(0);
  });

  // UT-D.1.3: progress 事件按 nodeId 匹配更新
  it('UT-D.1.3: updates phase by nodeId from progress event', () => {
    const { result } = renderHook(() =>
      useWorkflowProgress({ initialPhases: mockInitialPhases, listenEvents: false })
    );

    const payload: ProgressPayload = {
      nodeId: 'phase1',
      mode: 'sequential',
      status: 'running',
      progress: 50,
    };

    act(() => {
      result.current.handleProgressEvent(payload);
    });

    const phase1 = result.current.phaseData.find(p => p.nodeId === 'phase1');
    expect(phase1?.status).toBe('running');
    expect(phase1?.progress).toBe(50);
    expect(result.current.isRunning).toBe(true);

    // phase2 和 phase3 不变
    const phase2 = result.current.phaseData.find(p => p.nodeId === 'phase2');
    expect(phase2?.status).toBe('pending');
  });

  // UT-D.1.5: subItems 合并到 sub
  it('UT-D.1.5: merges subItems into phase.sub', () => {
    const { result } = renderHook(() =>
      useWorkflowProgress({ initialPhases: mockInitialPhases, listenEvents: false })
    );

    const payload: ProgressPayload = {
      nodeId: 'phase1',
      mode: 'sequential',
      status: 'running',
      progress: 60,
      subItems: [
        { name: 'src/file1.ts', status: 'done' },
        { name: 'src/file2.ts', status: 'running' },
      ],
    };

    act(() => {
      result.current.handleProgressEvent(payload);
    });

    const phase1 = result.current.phaseData.find(p => p.nodeId === 'phase1');
    expect(phase1?.sub).toHaveLength(2);
    expect(phase1?.sub?.[0].name).toBe('src/file1.ts');
    expect(phase1?.sub?.[0].status).toBe('done');
  });

  // 完成计数正确
  it('tracks completed count correctly', () => {
    const { result } = renderHook(() =>
      useWorkflowProgress({ initialPhases: mockInitialPhases, listenEvents: false })
    );

    act(() => {
      result.current.handleProgressEvent({ nodeId: 'phase1', mode: 'sequential', status: 'done', progress: 100 });
    });
    expect(result.current.completedCount).toBe(1);

    act(() => {
      result.current.handleProgressEvent({ nodeId: 'phase2', mode: 'parallel', status: 'done', progress: 100 });
    });
    expect(result.current.completedCount).toBe(2);
  });

  // initializePhases 重置数据
  it('initializePhases resets all data', () => {
    const { result } = renderHook(() =>
      useWorkflowProgress({ listenEvents: false })
    );

    act(() => {
      result.current.initializePhases(mockInitialPhases);
    });
    expect(result.current.phaseData).toHaveLength(3);

    act(() => {
      result.current.initializePhases([]);
    });
    expect(result.current.phaseData).toHaveLength(0);
  });
});
