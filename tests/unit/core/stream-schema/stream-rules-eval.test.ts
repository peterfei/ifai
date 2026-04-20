import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parse as parseYaml } from 'yaml';
import {
  evaluateStreamEvent,
  STREAM_RULES,
  PHASE_LOADING,
  PHASE_TRANSITIONS,
  TOOL_PERMISSIONS,
  type StreamPhase,
} from '@/core/stream-schema-generated';

/**
 * L2: 生成代码单元测试 — Schema 驱动
 *
 * 测试预期从 Schema YAML 动态读取，不硬编码 phase/tool 名。
 * 如果 Schema 变更，测试预期自动跟随。
 */

const SCHEMA_PATH = resolve(__dirname, '../../../../schema/stream-schema.yaml');
const schema = parseYaml(readFileSync(SCHEMA_PATH, 'utf-8')) as any;

// ── 所有 phase 名称，从 Schema 动态获取 ──
const allPhases: StreamPhase[] = Object.keys(schema.streamPhases) as StreamPhase[];

// ── 所有事件类型（union of all suppress + allow across all phases）──
const allEventTypes = [...new Set<string>(
  allPhases.flatMap(p => [
    ...schema.streamPhases[p].suppress,
    ...schema.streamPhases[p].allow,
  ])
)];

describe('evaluateStreamEvent', () => {
  it.each(allPhases)('phase=%s: suppress "all" blocks everything', (phase) => {
    const config = schema.streamPhases[phase];
    if (config.suppress.includes('all')) {
      expect(evaluateStreamEvent(phase, 'content')).toBe(false);
      expect(evaluateStreamEvent(phase, 'emitFinished')).toBe(false);
      expect(evaluateStreamEvent(phase, 'anyRandomEvent')).toBe(false);
    }
  });

  it.each(allPhases)('phase=%s: suppressed events are blocked', (phase) => {
    const config = schema.streamPhases[phase];
    if (!config.suppress.includes('all')) {
      for (const suppressed of config.suppress) {
        expect(evaluateStreamEvent(phase, suppressed)).toBe(false);
      }
    }
  });

  it.each(allPhases)('phase=%s: allowed events pass through', (phase) => {
    const config = schema.streamPhases[phase];
    if (!config.suppress.includes('all')) {
      for (const allowed of config.allow) {
        expect(evaluateStreamEvent(phase, allowed)).toBe(true);
      }
    }
  });

  it.each(allPhases)('phase=%s: control events pass when not suppressed', (phase) => {
    const config = schema.streamPhases[phase];
    if (!config.suppress.includes('all')) {
      // 控制事件（emitFinished, autoContinue, phaseTransition, approvalRequired）
      // 只在 suppress 列表中才被阻止，否则始终通过
      const controlEvents = ['emitFinished', 'autoContinue', 'phaseTransition', 'approvalRequired'];
      for (const ctrl of controlEvents) {
        if (config.suppress.includes(ctrl)) {
          expect(evaluateStreamEvent(phase, ctrl)).toBe(false);
        } else {
          expect(evaluateStreamEvent(phase, ctrl)).toBe(true);
        }
      }
    }
  });
});

describe('STREAM_RULES exhaustiveness', () => {
  it('every schema phase has a corresponding STREAM_RULES entry', () => {
    for (const phase of allPhases) {
      expect(STREAM_RULES).toHaveProperty(phase);
    }
  });

  it('no extra phases in STREAM_RULES beyond schema', () => {
    const schemaPhaseSet = new Set(allPhases);
    for (const phase of Object.keys(STREAM_RULES) as StreamPhase[]) {
      expect(schemaPhaseSet.has(phase)).toBe(true);
    }
  });

  it('suppress/allow values match schema exactly', () => {
    for (const phase of allPhases) {
      const expected = schema.streamPhases[phase];
      const actual = STREAM_RULES[phase];
      expect(actual.suppress).toEqual(expected.suppress);
      expect(actual.allow).toEqual(expected.allow);
    }
  });
});

describe('PHASE_LOADING', () => {
  it('matches schema loading values', () => {
    for (const phase of allPhases) {
      expect(PHASE_LOADING[phase]).toBe(schema.streamPhases[phase].loading);
    }
  });
});

describe('PHASE_TRANSITIONS', () => {
  it('matches schema transitions', () => {
    for (const phase of allPhases) {
      const expectedTargets = schema.streamPhases[phase].transitions
        .map((t: any) => t.to)
        .sort();
      const actualTargets = [...PHASE_TRANSITIONS[phase]].sort();
      expect(actualTargets).toEqual(expectedTargets);
    }
  });
});

describe('TOOL_PERMISSIONS', () => {
  it('every schema tool is in TOOL_PERMISSIONS', () => {
    const allToolNames = schema.toolPermissions.flatMap((e: any) => e.names);
    for (const name of allToolNames) {
      expect(TOOL_PERMISSIONS).toHaveProperty(name);
    }
  });

  it('mode values match schema', () => {
    for (const entry of schema.toolPermissions) {
      for (const name of entry.names) {
        expect(TOOL_PERMISSIONS[name]).toBe(entry.mode);
      }
    }
  });

  it('agent_ prefix normalization works', () => {
    for (const entry of schema.toolPermissions) {
      for (const name of entry.names) {
        if (name.startsWith('agent_')) {
          const normalized = name.replace(/^agent_/, '');
          // 归一化名也应存在且 mode 一致
          expect(TOOL_PERMISSIONS[normalized]).toBe(entry.mode);
        }
      }
    }
  });
});
