import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { parse as parseYaml } from 'yaml';

/**
 * L1: Codegen 正确性测试 — Schema → TypeScript 映射
 *
 * 验证 codegen 从 stream-schema.yaml 正确生成 TypeScript 代码。
 * 这些测试在 codegen 实现之前运行会失败（RED），
 * 实现 codegen 后通过（GREEN）。
 */

const SCHEMA_PATH = resolve(__dirname, '../../../schema/stream-schema.yaml');
const GENERATED_TS_PATH = resolve(__dirname, '../../../src/core/stream-schema-generated.ts');

// 直接解析 Schema，作为测试预期的唯一来源
let schema: any;

beforeAll(() => {
  const raw = readFileSync(SCHEMA_PATH, 'utf-8');
  schema = parseYaml(raw);
});

describe('codegen: Schema → TypeScript', () => {
  // ── 前置条件：生成文件必须存在 ─────────────────────
  it('generated TS file exists', () => {
    expect(existsSync(GENERATED_TS_PATH)).toBe(true);
  });

  // ── StreamPhase type 包含所有 Schema 定义的 phase ──
  it('StreamPhase type contains all phases from schema', () => {
    const generated = readFileSync(GENERATED_TS_PATH, 'utf-8');
    const phaseNames = Object.keys(schema.streamPhases);

    for (const phase of phaseNames) {
      // TS type 声明应包含该字面量
      expect(generated).toContain(phase);
    }
  });

  // ── PermissionMode type 包含所有 Schema 定义的 mode ──
  it('PermissionMode type contains all modes from schema', () => {
    const generated = readFileSync(GENERATED_TS_PATH, 'utf-8');
    const modeNames = schema.permissionModes.map((m: any) => m.name);

    for (const mode of modeNames) {
      expect(generated).toContain(mode);
    }
  });

  // ── TOOL_PERMISSIONS 包含所有 Schema 定义的工具名 ──
  it('TOOL_PERMISSIONS contains all tools from schema', () => {
    const generated = readFileSync(GENERATED_TS_PATH, 'utf-8');
    const allToolNames = schema.toolPermissions.flatMap((entry: any) => entry.names);

    for (const toolName of allToolNames) {
      expect(generated).toContain(toolName);
    }
  });

  // ── STREAM_RULES 包含所有 phase 的 suppress/allow ──
  it('STREAM_RULES contains suppress/allow for every phase', () => {
    const generated = readFileSync(GENERATED_TS_PATH, 'utf-8');
    const phases = schema.streamPhases;

    for (const [phaseName, phaseConfig] of Object.entries(phases) as [string, any][]) {
      for (const suppressed of phaseConfig.suppress) {
        expect(generated).toContain(suppressed);
      }
      for (const allowed of phaseConfig.allow) {
        expect(generated).toContain(allowed);
      }
    }
  });

  // ── PHASE_LOADING 与 Schema loading 值一致 ──
  it('PHASE_LOADING matches schema loading values', () => {
    const generated = readFileSync(GENERATED_TS_PATH, 'utf-8');
    const phases = schema.streamPhases;

    for (const [phaseName, phaseConfig] of Object.entries(phases) as [string, any][]) {
      const loadingValue = phaseConfig.loading ? 'true' : 'false';
      expect(generated).toContain(`${phaseName}: ${loadingValue}`);
    }
  });

  // ── PHASE_TRANSITIONS 与 Schema transitions.to 一致 ──
  it('PHASE_TRANSITIONS matches schema transitions', () => {
    const generated = readFileSync(GENERATED_TS_PATH, 'utf-8');
    const phases = schema.streamPhases;

    for (const [phaseName, phaseConfig] of Object.entries(phases) as [string, any][]) {
      const targetPhases = phaseConfig.transitions.map((t: any) => t.to);
      for (const target of targetPhases) {
        expect(generated).toContain(target);
      }
    }
  });
});
