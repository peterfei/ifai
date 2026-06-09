/**
 * 声明式工具审批配置 — 单一事实来源 (Single Source of Truth)
 *
 * 所有工具的分类、风险等级、审批规则、路径风险、聚合标记
 * 只在此文件定义一次，由 ToolApprovalRegistry 元编程引擎自动生成策略函数。
 *
 * 新增工具 → 只需在此添加一条配置，所有策略自动生效。
 */

import type { ToolApprovalRegistryConfig } from './ToolApprovalRegistry';

export const toolApprovalConfig: ToolApprovalRegistryConfig = {
  // ═══════════════════════════════════════════════════════════
  // 工具配置
  // ═══════════════════════════════════════════════════════════
  tools: [
    // ─── 文件系统：只读 (safe, low) ──────────────────────
    {
      name: 'agent_read_file',
      aliases: ['read_file', 'agent_read_file_range'],
      category: 'safe',
      riskLevel: 'low',
      requiresApproval: false,
      aggregatable: true,
    },
    {
      name: 'agent_list_dir',
      aliases: ['list_dir', 'list_directory'],
      category: 'safe',
      riskLevel: 'low',
      requiresApproval: false,
      aggregatable: true,
    },
    {
      name: 'agent_scan_project',
      aliases: ['scan_project', 'scan_directory', 'get_file_tree'],
      category: 'safe',
      riskLevel: 'low',
      requiresApproval: false,
      aggregatable: true,
    },
    {
      name: 'get_file_symbols',
      aliases: ['agent_list_functions', 'agent_probe_symbols'],
      category: 'safe',
      riskLevel: 'low',
      requiresApproval: false,
      aggregatable: true,
    },
    {
      name: 'agent_search',
      aliases: ['search_file_content', 'grep_search', 'search', 'search_semantic', 'glob', 'list_files', 'ls', 'agent_batch_read'],
      category: 'safe',
      riskLevel: 'low',
      requiresApproval: false,
      aggregatable: true,
    },
    {
      name: 'TodoWrite',
      aliases: ['todowrite', 'todo_write'],
      category: 'safe',
      riskLevel: 'low',
      requiresApproval: false,
    },
    {
      name: 'init_rag_index',
      category: 'safe',
      riskLevel: 'low',
      requiresApproval: false,
      aggregatable: true,
    },

    // ─── 文件系统：写入 (dangerous, medium) ──────────────
    {
      name: 'agent_write_file',
      aliases: ['write_file', 'agent_create_file'],
      category: 'dangerous',
      riskLevel: 'medium',
      requiresApproval: true,
      aggregatable: true,
      streamExtract: { path: 'rel_path', content: 'content' },
      pathRiskRules: [
        // 关键配置文件 → 升级为高风险
        { pattern: /^\.?env/i, risk: 'high' },
        { pattern: /^package\.json$/i, risk: 'high' },
        { pattern: /^tauri\.conf\.json$/i, risk: 'high' },
        { pattern: /^src-tauri\/tauri\.conf\.json$/i, risk: 'high' },
        { pattern: /^\.git\//i, risk: 'high' },
        { pattern: /^\.ifai\//i, risk: 'high' },
        { pattern: /^vite\.config\.(js|ts)$/i, risk: 'high' },
        { pattern: /^tsconfig\.json$/i, risk: 'high' },
        // 文档/测试 → 降级为低风险
        { pattern: /\.md$/i, risk: 'low' },
        { pattern: /^docs\//i, risk: 'low' },
        { pattern: /^tests?\//i, risk: 'low' },
        { pattern: /^\.gitignore$/i, risk: 'low' },
        { pattern: /^LICENSE$/i, risk: 'low' },
      ],
    },
    {
      name: 'agent_replace_text',
      aliases: ['agent_replace_content', 'agent_edit_file', 'edit_file'],
      category: 'dangerous',
      riskLevel: 'medium',
      requiresApproval: true,
      aggregatable: true,
      streamExtract: { path: 'path', content: 'new_content' },
    },

    // ─── 文件系统：删除 (destructive, high) ──────────────
    {
      name: 'agent_delete_file',
      aliases: ['delete_file', 'remove_file', 'agent_rename_file', 'agent_move_file'],
      category: 'destructive',
      riskLevel: 'high',
      requiresApproval: true,
      requireSandbox: true,
      aggregatable: true,
    },

    // ─── Shell (destructive, high) ───────────────────────
    {
      name: 'agent_bash',
      aliases: ['bash', 'execute_bash_command', 'agent_execute_command', 'execute_command', 'agent_run_shell_command', 'run_shell_command', 'agent_run_command'],
      category: 'destructive',
      riskLevel: 'high',
      requiresApproval: true,
    },
  ],

  // ═══════════════════════════════════════════════════════════
  // 自动审批规则链（按 priority 升序，小数字先匹配）
  // ═══════════════════════════════════════════════════════════
  autoApprovalRules: [
    {
      priority: 1,
      name: 'sandbox-destructive-block',
      when: { category: 'destructive', requireSandbox: true },
      then: { approve: false, reason: '非沙箱环境下的破坏性操作禁止自动审批' },
    },
    {
      priority: 2,
      name: 'user-message-override',
      then: { approve: true, reason: '用户消息级授权' },
    },
    {
      priority: 3,
      name: 'global-auto-approve',
      then: { approve: true, reason: '全局自动批准设置' },
    },
    {
      priority: 0.5,
      name: 'permission-store-allow',
      when: { category: ['dangerous', 'destructive'] },
      then: { approve: true, reason: '白名单规则命中' },
    },
    {
      priority: 4,
      name: 'vibe-spec-safe-auto',
      when: { category: 'safe', editorMode: ['vibe', 'spec'] },
      then: { approve: true, reason: 'Vibe/Spec 模式下安全工具自动批准' },
    },
    {
      priority: 5,
      name: 'always-approve',
      then: { approve: true, reason: '审批模式: 始终批准' },
    },
    {
      priority: 6,
      name: 'session-trust',
      then: { approve: true, reason: '会话信任' },
    },
  ],
};
