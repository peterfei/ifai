import { describe, it, expect } from 'vitest';
import { evaluateStreamEvent, PHASE_LOADING, type StreamPhase } from '@/core/stream-schema-generated';

/**
 * Phase 10: 审批流状态失同步回归测试
 *
 * 防止历史 bug 再次出现：
 * - finish_reason: "tool_calls" 在审批阶段被错误处理为流结束
 * - 拒绝后 isLoading 状态不正确
 * - 继续阶段内容事件被错误阻止
 */

describe('regression: approval desync bug', () => {
  it('10.1 regression: finish during AWAITING_APPROVAL does not end stream', () => {
    // Original bug: finish_reason: "tool_calls" during approval phase
    // was incorrectly treated as stream end
    expect(evaluateStreamEvent('AWAITING_APPROVAL', 'emitFinished')).toBe(false);
  });

  it('10.2 regression: rejection properly terminates', () => {
    // After rejection, phase goes to FINISHED, isLoading = false
    expect(PHASE_LOADING['FINISHED']).toBe(false);
    expect(evaluateStreamEvent('FINISHED', 'content')).toBe(false);
    expect(evaluateStreamEvent('FINISHED', 'emitFinished')).toBe(false);
  });

  it('10.3 regression: continuation content is allowed during CONTINUING phase', () => {
    expect(evaluateStreamEvent('CONTINUING', 'content')).toBe(true);
    expect(evaluateStreamEvent('CONTINUING', 'toolCall')).toBe(true);
    expect(PHASE_LOADING['CONTINUING']).toBe(true);
  });
});
