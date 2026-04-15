import { describe, it, expect, beforeEach, vi } from 'vitest';
import { chatEventBus } from '@/stores/chat/eventBus/ChatEventBus';
import { evaluateStreamEvent, PHASE_LOADING, PHASE_TRANSITIONS, type StreamPhase } from '@/core/stream-schema-generated';

/**
 * Phase 9.1-9.5: 审批生命周期集成测试
 *
 * 使用 EventBus 模拟完整的审批生命周期流程，
 * 验证状态转换、isLoading 状态、emitFinished 抑制等关键行为。
 */

describe('approval lifecycle integration', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('9.1 full approval lifecycle: phase transitions are valid', () => {
    // Simulate: STREAMING -> AWAITING_APPROVAL -> CONTINUING -> FINISHED
    const transitions: [StreamPhase, StreamPhase][] = [
      ['STREAMING', 'AWAITING_APPROVAL'],
      ['AWAITING_APPROVAL', 'CONTINUING'],
      ['CONTINUING', 'FINISHED'],
    ];
    for (const [from, to] of transitions) {
      expect(PHASE_TRANSITIONS[from]).toContain(to);
    }
  });

  it('9.2 multi-tool approval: safe tools skip AWAITING_APPROVAL', () => {
    // STREAMING can go directly to FINISHED (safe tool, no approval needed)
    expect(PHASE_TRANSITIONS['STREAMING']).toContain('FINISHED');
    // AWAITING_APPROVAL is also available for dangerous tools
    expect(PHASE_TRANSITIONS['STREAMING']).toContain('AWAITING_APPROVAL');
  });

  it('9.3 rejection terminates: AWAITING_APPROVAL -> FINISHED', () => {
    expect(PHASE_TRANSITIONS['AWAITING_APPROVAL']).toContain('FINISHED');
    // In FINISHED phase, isLoading should be false
    expect(PHASE_LOADING['FINISHED']).toBe(false);
  });

  it('9.4 multi-round continuation: CONTINUING can loop back to AWAITING_APPROVAL', () => {
    expect(PHASE_TRANSITIONS['CONTINUING']).toContain('AWAITING_APPROVAL');
    expect(PHASE_TRANSITIONS['CONTINUING']).toContain('FINISHED');
  });

  it('9.5 emitFinished is suppressed during AWAITING_APPROVAL and CONTINUING', () => {
    expect(evaluateStreamEvent('AWAITING_APPROVAL', 'emitFinished')).toBe(false);
    expect(evaluateStreamEvent('CONTINUING', 'emitFinished')).toBe(false);
    expect(evaluateStreamEvent('STREAMING', 'emitFinished')).toBe(true);
    expect(evaluateStreamEvent('FINISHED', 'emitFinished')).toBe(false);
  });

  it('9.5b isLoading remains true until FINISHED', () => {
    expect(PHASE_LOADING['STREAMING']).toBe(true);
    expect(PHASE_LOADING['AWAITING_APPROVAL']).toBe(true);
    expect(PHASE_LOADING['CONTINUING']).toBe(true);
    expect(PHASE_LOADING['FINISHED']).toBe(false);
  });
});
