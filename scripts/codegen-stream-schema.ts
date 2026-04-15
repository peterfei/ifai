/**
 * codegen-stream-schema.ts — Schema-Driven 代码生成器
 *
 * 读取 schema/stream-schema.yaml，生成：
 *   - src/core/stream-schema-generated.ts
 *   - src-tauri/src/stream_schema_generated.rs
 *
 * 用法: npx tsx scripts/codegen-stream-schema.ts
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { parse as parseYaml } from 'yaml';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SCHEMA_PATH = resolve(ROOT, 'schema/stream-schema.yaml');

// ═══════════════════════════════════════════════════════════
// 读取 Schema
// ═══════════════════════════════════════════════════════════

const raw = readFileSync(SCHEMA_PATH, 'utf-8');
const schema = parseYaml(raw) as any;

const { streamPhases, permissionModes, toolPermissions, backendEvents } = schema;

// ═══════════════════════════════════════════════════════════
// TypeScript 生成
// ═══════════════════════════════════════════════════════════

function generateTypeScript(): string {
  const phaseNames = Object.keys(streamPhases);
  const phaseUnion = phaseNames.map(p => `'${p}'`).join(' | ');
  const modeNames = permissionModes.map((m: any) => `'${m.name}'`).join(' | ');

  // ── STREAM_RULES ──
  const rulesEntries = phaseNames.map((phase: string) => {
    const config = streamPhases[phase];
    const suppress = JSON.stringify(config.suppress);
    const allow = JSON.stringify(config.allow);
    return `  ${phase}: { suppress: ${suppress}, allow: ${allow} }`;
  }).join(',\n');

  // ── PHASE_LOADING ──
  const loadingEntries = phaseNames.map((phase: string) => {
    return `  ${phase}: ${streamPhases[phase].loading}`;
  }).join(',\n');

  // ── PHASE_TRANSITIONS ──
  const transitionsEntries = phaseNames.map((phase: string) => {
    const targets = (streamPhases[phase].transitions as any[])
      .map((t: any) => `'${t.to}'`)
      .join(', ');
    return `  ${phase}: [${targets}]`;
  }).join(',\n');

  // ── TOOL_PERMISSIONS ──
  // 扁平化：每个 tool name → mode，包含 agent_ 前缀剥离的归一化名
  const toolMap: Record<string, string> = {};
  for (const entry of toolPermissions) {
    for (const name of entry.names) {
      toolMap[name] = entry.mode;
      // 归一化：剥离 agent_ 前缀
      const normalized = name.replace(/^agent_/, '');
      if (normalized !== name) {
        toolMap[normalized] = entry.mode;
      }
    }
  }
  const toolEntries = Object.entries(toolMap)
    .map(([name, mode]) => `  '${name}': '${mode}'`)
    .join(',\n');

  return `// stream-schema-generated.ts — 由 codegen-stream-schema.ts 从 stream-schema.yaml 自动生成
// ⚠️ 此文件自动生成，请勿手动编辑。修改 schema/stream-schema.yaml 后重新运行 codegen。

export type StreamPhase = ${phaseUnion};

export type PermissionMode = ${modeNames};

// 由 streamPhases[].suppress/allow 自动生成
export const STREAM_RULES: Record<StreamPhase, { suppress: string[]; allow: string[] }> = {
${rulesEntries},
};

// 由 streamPhases[].loading 自动生成
export const PHASE_LOADING: Record<StreamPhase, boolean> = {
${loadingEntries},
};

// 由 streamPhases[].transitions[].to 自动生成
export const PHASE_TRANSITIONS: Record<StreamPhase, StreamPhase[]> = {
${transitionsEntries},
};

// 由 toolPermissions 自动生成（单一真相源）
// agent_ 前缀已归一化：read_file 和 agent_read_file 均指向同一 mode
export const TOOL_PERMISSIONS: Record<string, PermissionMode> = {
${toolEntries},
};

// ═══════════════════════════════════════════════════════════
// 通用规则求值函数 — 3 行查表，零 if/else
// ═══════════════════════════════════════════════════════════
export function evaluateStreamEvent(phase: StreamPhase, eventType: string): boolean {
  const rules = STREAM_RULES[phase];
  if (rules.suppress.includes('all')) return false;
  if (rules.suppress.includes(eventType)) return false;
  // 控制事件（emitFinished, autoContinue, phaseTransition 等）：
  // 不在 suppress 列表中即允许通过（allow 列表仅约束数据事件）
  const CONTROL_EVENTS = new Set(['emitFinished', 'autoContinue', 'phaseTransition', 'approvalRequired']);
  if (CONTROL_EVENTS.has(eventType)) return true;
  // 数据事件：必须在 allow 列表中才通过
  return rules.allow.includes(eventType);
}
`;
}

// ═══════════════════════════════════════════════════════════
// Rust 生成
// ═══════════════════════════════════════════════════════════

function generateRust(): string {
  const phaseNames = Object.keys(streamPhases);
  const modeNames = permissionModes.map((m: any) => m.name);

  // ── StreamPhase enum ──
  const phaseVariants = phaseNames.map((p: string) => {
    const rustName = toPascalCase(p);
    return `    ${rustName},`;
  }).join('\n');

  // ── PermissionMode enum ──
  const modeVariants = permissionModes.map((m: any) => {
    return `    ${m.name},`;
  }).join('\n');

  // ── required_permission_for ──
  // 按模式分组工具名，归一化 + 去重
  const toolsByMode: Record<string, string[]> = {};
  for (const entry of toolPermissions) {
    if (!toolsByMode[entry.mode]) toolsByMode[entry.mode] = [];
    for (const name of entry.names) {
      const normalized = name.replace(/^agent_/, '');
      if (!toolsByMode[entry.mode].includes(normalized)) {
        toolsByMode[entry.mode].push(normalized);
      }
    }
  }

  const matchArms = modeNames.map((mode: string) => {
    const tools = toolsByMode[mode];
    if (!tools || tools.length === 0) return null;
    const patterns = tools.map(t => `"${t}"`).join('\n            | ');
    return `        ${patterns}\n            => PermissionMode::${mode},`;
  }).filter(Boolean).join('\n');

  // ── is_loading ──
  const loadingTruePhases = phaseNames.filter(p => streamPhases[p].loading);
  const loadingTrueVariants = loadingTruePhases.map(p => `Self::${toPascalCase(p)}`).join(' | ');

  // ── phase_transitions ──
  const transitionEntries = phaseNames.map((phase: string) => {
    const targets = (streamPhases[phase].transitions as any[])
      .map((t: any) => `StreamPhase::${toPascalCase(t.to)}`)
      .join(', ');
    return `        StreamPhase::${toPascalCase(phase)} => vec![${targets}],`;
  }).join('\n');

  // ── emit timing ──
  const onlyFinalEvents = backendEvents
    .filter((e: any) => e.emitTiming === 'only_final_round')
    .map((e: any) => `"${e.type}"`);

  return `// stream_schema_generated.rs — 由 codegen-stream-schema.ts 从 stream-schema.yaml 自动生成
// ⚠️ 此文件自动生成，请勿手动编辑。修改 schema/stream-schema.yaml 后重新运行 codegen。

// ═══════════════════════════════════════════════════════════
// Stream Phase State Machine
// ═══════════════════════════════════════════════════════════

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum StreamPhase {
${phaseVariants}
}

impl StreamPhase {
    /// 是否处于加载状态（由 streamPhases[].loading 自动生成）
    pub fn is_loading(&self) -> bool {
        matches!(self, ${loadingTrueVariants || 'Self::Streaming'})
    }

    /// 获取当前 phase 允许的转换目标
    pub fn allowed_transitions(&self) -> Vec<StreamPhase> {
        match self {
${transitionEntries}
        }
    }
}

// ═══════════════════════════════════════════════════════════
// Permission Mode（Ord 枚举，由 permissionModes[].ordinal 自动生成）
// ═══════════════════════════════════════════════════════════

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum PermissionMode {
${modeVariants}
}

impl PermissionMode {
    /// 是否自动批准（由 permissionModes[].autoApprove 自动生成）
    pub fn auto_approve(&self) -> bool {
        matches!(self, ${permissionModes.filter((m: any) => m.autoApprove).map((m: any) => `Self::${m.name}`).join(' | ')})
    }
}

// ═══════════════════════════════════════════════════════════
// Tool Permission Lookup（由 toolPermissions 自动生成）
// ═══════════════════════════════════════════════════════════

/// 查询工具所需权限（单一真相源，替代 is_safe_tool()）
pub fn required_permission_for(tool_name: &str) -> PermissionMode {
    let normalized = tool_name.replace("agent_", "");
    match normalized.as_str() {
${matchArms}
        _ => PermissionMode::DangerFullAccess, // 未知工具默认最高权限
    }
}

/// 判断是否需要审批：active_mode < required_mode
pub fn requires_approval(active_mode: PermissionMode, tool_name: &str) -> bool {
    let required = required_permission_for(tool_name);
    active_mode < required
}

// ═══════════════════════════════════════════════════════════
// Backend Event Emit Timing（由 backendEvents[].emitTiming 自动生成）
// ═══════════════════════════════════════════════════════════

/// 仅在最终轮次转发的事件类型
pub fn is_final_round_only_event(event_type: &str) -> bool {
    matches!(event_type, ${onlyFinalEvents.join(' | ')})
}

// ═══════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_permission_ord_ordering() {
        assert!(PermissionMode::ReadOnly < PermissionMode::WorkspaceWrite);
        assert!(PermissionMode::WorkspaceWrite < PermissionMode::DangerFullAccess);
        assert!(PermissionMode::DangerFullAccess < PermissionMode::Prompt);
        assert!(PermissionMode::Prompt < PermissionMode::Allow);
    }

    #[test]
    fn test_permission_auto_approve() {
        assert!(PermissionMode::ReadOnly.auto_approve());
        assert!(!PermissionMode::WorkspaceWrite.auto_approve());
        assert!(!PermissionMode::DangerFullAccess.auto_approve());
        assert!(PermissionMode::Allow.auto_approve());
    }

    #[test]
    fn test_requires_approval_logic() {
        // WorkspaceWrite >= ReadOnly → no approval
        assert!(!requires_approval(PermissionMode::WorkspaceWrite, "read_file"));
        // WorkspaceWrite < DangerFullAccess → needs approval
        assert!(requires_approval(PermissionMode::WorkspaceWrite, "bash"));
        // Allow >= anything → no approval
        assert!(!requires_approval(PermissionMode::Allow, "bash"));
    }

    #[test]
    fn test_required_permission_for_unknown() {
        assert_eq!(required_permission_for("nonexistent_tool"), PermissionMode::DangerFullAccess);
    }

    #[test]
    fn test_agent_prefix_normalization() {
        assert_eq!(required_permission_for("agent_write_file"), required_permission_for("write_file"));
        assert_eq!(required_permission_for("agent_bash"), required_permission_for("bash"));
        assert_eq!(required_permission_for("agent_read_file"), required_permission_for("read_file"));
    }

    #[test]
    fn test_stream_phase_is_loading() {
        assert!(StreamPhase::Streaming.is_loading());
        assert!(StreamPhase::AwaitingApproval.is_loading());
        assert!(StreamPhase::Continuing.is_loading());
        assert!(!StreamPhase::Finished.is_loading());
    }

    #[test]
    fn test_phase_transitions_validity() {
        // STREAMING can go to AWAITING_APPROVAL or FINISHED
        let from_streaming = StreamPhase::Streaming.allowed_transitions();
        assert!(from_streaming.contains(&StreamPhase::AwaitingApproval));
        assert!(from_streaming.contains(&StreamPhase::Finished));
        assert!(!from_streaming.contains(&StreamPhase::Streaming));

        // FINISHED has no transitions
        assert!(StreamPhase::Finished.allowed_transitions().is_empty());
    }

    #[test]
    fn test_final_round_only_events() {
        assert!(is_final_round_only_event("finish"));
        assert!(!is_final_round_only_event("stream_phase"));
        assert!(!is_final_round_only_event("tool_approval_required"));
    }
}
`;
}

// ═══════════════════════════════════════════════════════════
// 工具函数
// ═══════════════════════════════════════════════════════════

function toPascalCase(snake: string): string {
  return snake.split('_').map(s => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()).join('');
}

// ═══════════════════════════════════════════════════════════
// 写入文件
// ═══════════════════════════════════════════════════════════

const TS_OUTPUT = resolve(ROOT, 'src/core/stream-schema-generated.ts');
const RUST_OUTPUT = resolve(ROOT, 'src-tauri/src/stream_schema_generated.rs');

const tsCode = generateTypeScript();
const rustCode = generateRust();

writeFileSync(TS_OUTPUT, tsCode, 'utf-8');
writeFileSync(RUST_OUTPUT, rustCode, 'utf-8');

console.log('✅ Generated:', TS_OUTPUT);
console.log('✅ Generated:', RUST_OUTPUT);
