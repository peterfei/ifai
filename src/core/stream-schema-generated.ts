// stream-schema-generated.ts — 由 codegen-stream-schema.ts 从 stream-schema.yaml 自动生成
// ⚠️ 此文件自动生成，请勿手动编辑。修改 schema/stream-schema.yaml 后重新运行 codegen。

export type StreamPhase = 'STREAMING' | 'AWAITING_APPROVAL' | 'CONTINUING' | 'FINISHED';

export type PermissionMode = 'ReadOnly' | 'WorkspaceWrite' | 'DangerFullAccess' | 'Prompt' | 'Allow';

// 由 streamPhases[].suppress/allow 自动生成
export const STREAM_RULES: Record<StreamPhase, { suppress: string[]; allow: string[] }> = {
  STREAMING: { suppress: [], allow: ["content","toolCall","toolDone"] },
  AWAITING_APPROVAL: { suppress: ["emitFinished","autoContinue"], allow: ["phaseTransition","approvalRequired"] },
  CONTINUING: { suppress: ["emitFinished"], allow: ["content","toolCall","toolDone","phaseTransition"] },
  FINISHED: { suppress: ["all"], allow: [] },
};

// 由 streamPhases[].loading 自动生成
export const PHASE_LOADING: Record<StreamPhase, boolean> = {
  STREAMING: true,
  AWAITING_APPROVAL: true,
  CONTINUING: true,
  FINISHED: false,
};

// 由 streamPhases[].transitions[].to 自动生成
export const PHASE_TRANSITIONS: Record<StreamPhase, StreamPhase[]> = {
  STREAMING: ['AWAITING_APPROVAL', 'FINISHED'],
  AWAITING_APPROVAL: ['CONTINUING', 'FINISHED', 'FINISHED'],
  CONTINUING: ['AWAITING_APPROVAL', 'FINISHED'],
  FINISHED: [],
};

// 由 toolPermissions 自动生成（单一真相源）
// agent_ 前缀已归一化：read_file 和 agent_read_file 均指向同一 mode
export const TOOL_PERMISSIONS: Record<string, PermissionMode> = {
  'agent_read_file': 'ReadOnly',
  'read_file': 'ReadOnly',
  'agent_read_file_range': 'ReadOnly',
  'read_file_range': 'ReadOnly',
  'agent_list_dir': 'ReadOnly',
  'list_dir': 'ReadOnly',
  'list_directory': 'ReadOnly',
  'agent_scan_project': 'ReadOnly',
  'scan_project': 'ReadOnly',
  'scan_directory': 'ReadOnly',
  'get_file_tree': 'ReadOnly',
  'get_file_symbols': 'ReadOnly',
  'agent_list_functions': 'ReadOnly',
  'list_functions': 'ReadOnly',
  'agent_probe_symbols': 'ReadOnly',
  'probe_symbols': 'ReadOnly',
  'agent_search': 'ReadOnly',
  'search': 'ReadOnly',
  'grep_search': 'ReadOnly',
  'glob_search': 'ReadOnly',
  'search_file_content': 'ReadOnly',
  'TodoWrite': 'ReadOnly',
  'todowrite': 'ReadOnly',
  'init_rag_index': 'ReadOnly',
  'agent_write_file': 'WorkspaceWrite',
  'write_file': 'WorkspaceWrite',
  'agent_create_file': 'WorkspaceWrite',
  'create_file': 'WorkspaceWrite',
  'agent_replace_text': 'WorkspaceWrite',
  'replace_text': 'WorkspaceWrite',
  'edit_file': 'WorkspaceWrite',
  'agent_edit_file': 'WorkspaceWrite',
  'agent_delete_file': 'DangerFullAccess',
  'delete_file': 'DangerFullAccess',
  'agent_rename_file': 'DangerFullAccess',
  'rename_file': 'DangerFullAccess',
  'agent_move_file': 'DangerFullAccess',
  'move_file': 'DangerFullAccess',
  'agent_bash': 'DangerFullAccess',
  'bash': 'DangerFullAccess',
  'execute_command': 'DangerFullAccess',
  'PowerShell': 'DangerFullAccess',
};

// 🆕 元编程：前端工具集合（由 runLocation: frontend 自动生成）
export const FRONTEND_TOOLS = new Set<string>([
  'TodoWrite',
  'todowrite'
]);

// 🆕 元编程：前端工具判断函数（零硬编码，纯查表）
export function isFrontendTool(toolName: string): boolean {
  // 归一化：剥离 agent_ 前缀
  const normalized = toolName.replace(/^agent_/, '');
  return FRONTEND_TOOLS.has(toolName) || FRONTEND_TOOLS.has(normalized);
}

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
