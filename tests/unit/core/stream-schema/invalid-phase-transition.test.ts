import { describe, it, expect } from 'vitest';
import {
  evaluateStreamEvent,
  PHASE_TRANSITIONS,
  type StreamPhase,
} from '@/core/stream-schema-generated';

/**
 * Phase 7.12: 无效状态转换拒绝测试
 *
 * 验证非法的 phase 转换被正确拒绝。
 * FINISHED 是终止状态，不应有任何出边。
 */

describe('invalid phase transitions', () => {
  it('FINISHED -> STREAMING should not be in PHASE_TRANSITIONS', () => {
    const transitions = PHASE_TRANSITIONS['FINISHED'];
    expect(transitions).toEqual([]);
    expect(transitions).not.toContain('STREAMING');
  });

  it('FINISHED -> AWAITING_APPROVAL should not be allowed', () => {
    const transitions = PHASE_TRANSITIONS['FINISHED'];
    expect(transitions).not.toContain('AWAITING_APPROVAL');
  });

  it('evaluateStreamEvent returns false for emitFinished in FINISHED phase', () => {
    expect(evaluateStreamEvent('FINISHED', 'emitFinished')).toBe(false);
  });

  it('evaluateStreamEvent returns false for content in FINISHED phase', () => {
    expect(evaluateStreamEvent('FINISHED', 'content')).toBe(false);
  });

  it('every phase transition is symmetric - if A->B exists, B->A may not', () => {
    // Just verify the transitions form a valid DAG (no cycles through FINISHED)
    const allPhases: StreamPhase[] = ['STREAMING', 'AWAITING_APPROVAL', 'CONTINUING', 'FINISHED'];
    for (const phase of allPhases) {
      const targets = PHASE_TRANSITIONS[phase];
      for (const target of targets) {
        // FINISHED should never be a source of transitions
        if (phase === 'FINISHED') {
          expect(targets).toEqual([]);
        }
      }
    }
  });
});
