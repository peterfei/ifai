/**
 * ToolApprovalRegistry — 元编程引擎
 *
 * 从声明式配置（toolApprovalConfig.ts）自动生成：
 *   - categorizeTool()   → O(1) Map 查询，替代数组遍历
 *   - calculateRisk()    → 基础风险 + 路径规则合并
 *   - shouldAutoApprove() → 规则链求值，首个匹配规则决定结果
 *   - isAggregatable()   → O(1) Set 查询
 *
 * 新增工具只需在 toolApprovalConfig.ts 添加一条记录，
 * 所有策略函数自动生效，零重复代码。
 */

import type { SettingsState } from '../../stores/settingsStore';
import { toolApprovalConfig } from './toolApprovalConfig';

// ═══════════════════════════════════════════════════════════
// 环境检测
// ═══════════════════════════════════════════════════════════

function detectTauriEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as any;
  // 排除 E2E mock 环境
  if (w.__E2E__ || import.meta.env?.VITE_TEST_ENV === 'e2e') return false;
  const hasInvoke = !!(
    w.__TAURI_INTERNALS__?.invoke ||
    w.__TAURI__?.core?.invoke ||
    w.__TAURI_INTERNALS__?.transformCallback
  );
  if (!hasInvoke) return false;
  // 排除 mock invoke（E2E 注入的假 invoke）
  const invokeFn = w.__TAURI_INTERNALS__?.invoke || w.__TAURI__?.core?.invoke;
  if (invokeFn?.toString?.().includes('Mock')) return false;
  return true;
}

// ═══════════════════════════════════════════════════════════
// 类型定义
// ═══════════════════════════════════════════════════════════

/** 工具风险等级 */
export type RiskLevel = 'low' | 'medium' | 'high';

/** 工具操作类别（审批视角） */
export type ToolCategory = 'safe' | 'dangerous' | 'destructive';

/** 编辑器模式 */
export type EditorMode = 'vibe' | 'spec' | 'standard';

/** 路径风险规则 */
export interface PathRiskRule {
  pattern: RegExp;
  risk: RiskLevel;
}

/** 自动审批规则 — 数据驱动的规则链 */
export interface AutoApprovalRule {
  priority: number;
  name: string;
  when?: {
    category?: ToolCategory | ToolCategory[];
    riskLevel?: RiskLevel | RiskLevel[];
    editorMode?: EditorMode | EditorMode[];
    requireSandbox?: boolean;
  };
  then: {
    approve: boolean;
    reason: string;
  };
}

/** 单个工具的声明式审批配置 */
export interface ToolApprovalConfig {
  name: string;
  aliases?: string[];
  category: ToolCategory;
  riskLevel: RiskLevel;
  requiresApproval?: boolean;
  requireSandbox?: boolean;
  pathRiskRules?: PathRiskRule[];
  aggregatable?: boolean;
  display?: {
    label?: string;
    color?: string;
    icon?: string;
  };
}

/** 注册表完整配置 */
export interface ToolApprovalRegistryConfig {
  tools: ToolApprovalConfig[];
  autoApprovalRules: AutoApprovalRule[];
  globalPathRiskRules?: PathRiskRule[];
}

/** 审批上下文（消费方调用 shouldAutoApprove 时传入） */
export interface ApprovalContext {
  settings: Partial<SettingsState>;
  editorMode: 'vibe' | 'spec' | 'standard';
  isSessionTrusted: boolean;
  toolName: string;
  userMessageHasAutoApprove?: boolean;
}

/** 风险计算上下文 */
export interface RiskContext {
  toolName: string;
  args: any;
  editorMode: 'vibe' | 'spec' | 'standard';
}

// ═══════════════════════════════════════════════════════════
// 元编程引擎
// ═══════════════════════════════════════════════════════════

export class ToolApprovalRegistry {
  private config: ToolApprovalRegistryConfig;

  // 运行时索引 — 构建时一次性生成，O(1) 查询
  private toolByName = new Map<string, ToolApprovalConfig>();
  private toolsByCategory = new Map<ToolCategory, ToolApprovalConfig[]>();
  private toolsByRisk = new Map<RiskLevel, ToolApprovalConfig[]>();
  private aggregatableNames = new Set<string>();
  private sortedRules: AutoApprovalRule[] = [];

  // 沙箱状态（运行时可变）
  private _isSandbox = true;
  private _settingsUnsubscribe: (() => void) | null = null;

  constructor(config: ToolApprovalRegistryConfig) {
    this.config = config;
    this.buildIndices();
  }

  /** 初始化沙箱状态：根据设置和环境自动检测，并监听设置变化 */
  initSandboxDetection(): void {
    this.refreshSandboxFromSettings();

    // 监听 settingsStore 变化，自动同步沙箱状态
    try {
      const { useSettingsStore } = require('../../stores/settingsStore');
      this._settingsUnsubscribe = useSettingsStore.subscribe(() => {
        this.refreshSandboxFromSettings();
      });
      console.log('[ToolApprovalRegistry] Sandbox detection initialized, listening for settings changes');
    } catch {
      // E2E/mock 环境中 settingsStore 可能不可用
      console.log('[ToolApprovalRegistry] Settings store not available, sandbox=auto (defaults to true)');
    }
  }

  /** 根据 sandboxMode 设置 + 运行时环境计算实际沙箱状态 */
  private refreshSandboxFromSettings(): void {
    try {
      const { useSettingsStore } = require('../../stores/settingsStore');
      const mode = useSettingsStore.getState().sandboxMode || 'auto';
      this._isSandbox = this.evaluateSandboxMode(mode);
      console.log(`[ToolApprovalRegistry] Sandbox refreshed: mode=${mode}, result=${this._isSandbox}`);
    } catch {
      this._isSandbox = true;
    }
  }

  private evaluateSandboxMode(mode: string): boolean {
    if (mode === 'always-on') return true;
    if (mode === 'always-off') return false;
    if (mode === 'tauri-only') return detectTauriEnvironment();
    // 'auto': Tauri 桌面应用 → 沙箱关闭（本地开发，信任环境）；Web → 沙箱开启
    return !detectTauriEnvironment();
  }

  /** 清理监听 */
  destroy(): void {
    if (this._settingsUnsubscribe) {
      this._settingsUnsubscribe();
      this._settingsUnsubscribe = null;
    }
  }

  /** 构建所有运行时索引（O(n) 一次性成本） */
  private buildIndices(): void {
    for (const tool of this.config.tools) {
      // 注册主名称 + 归一化名称
      this.registerName(tool.name, tool);
      this.registerName(tool.name.replace(/^agent_/, ''), tool);

      // 注册别名
      if (tool.aliases) {
        for (const alias of tool.aliases) {
          this.registerName(alias, tool);
          this.registerName(alias.replace(/^agent_/, ''), tool);
        }
      }

      // 按类别分组
      const catList = this.toolsByCategory.get(tool.category) || [];
      catList.push(tool);
      this.toolsByCategory.set(tool.category, catList);

      // 按风险分组
      const riskList = this.toolsByRisk.get(tool.riskLevel) || [];
      riskList.push(tool);
      this.toolsByRisk.set(tool.riskLevel, riskList);

      // 可聚合集合
      if (tool.aggregatable) {
        this.aggregatableNames.add(tool.name.toLowerCase());
        if (tool.aliases) {
          tool.aliases.forEach(a => this.aggregatableNames.add(a.toLowerCase()));
        }
      }
    }

    // 按优先级排序规则链
    this.sortedRules = [...this.config.autoApprovalRules].sort(
      (a, b) => a.priority - b.priority,
    );
  }

  private registerName(name: string, tool: ToolApprovalConfig): void {
    this.toolByName.set(name.toLowerCase(), tool);
  }

  // ─── API: categorizeTool() ────────────────────────────

  /** 工具分类：查 Map，未知工具默认 dangerous */
  categorizeTool(toolName: string): ToolCategory {
    if (!toolName) return 'dangerous';
    const config = this.resolveTool(toolName);
    return config?.category ?? 'dangerous';
  }

  // ─── API: calculateRisk() ─────────────────────────────

  /** 风险计算：基础风险 + 路径规则合并 */
  calculateRisk(toolName: string, args: Record<string, any>, editorMode: EditorMode): RiskLevel {
    const config = this.resolveTool(toolName);
    let baseRisk: RiskLevel = config?.riskLevel ?? 'medium';

    // 只读工具直接返回 low
    if (baseRisk === 'low') return 'low';
    // 破坏性工具保持 high
    if (baseRisk === 'high') return 'high';

    // 路径风险覆盖
    const path = args?.rel_path || args?.path || '';
    const pathRisk = this.calculatePathRisk(path, config);

    if (pathRisk === 'high') return 'high';
    if (pathRisk === 'low') return 'low';

    // Vibe 模式下 medium → high
    if (editorMode === 'vibe' && baseRisk === 'medium') return 'high';

    return baseRisk;
  }

  private calculatePathRisk(path: string, config?: ToolApprovalConfig): RiskLevel {
    if (!path) return 'medium';

    const normalized = path
      .replace(/\\/g, '/')
      .replace(/^\.\//, '')
      .replace(/\/[^/]+\/\.\.\//g, '/')
      .replace(/^[^/]+\/\.\.\//, '');

    // 工具特定路径规则
    if (config?.pathRiskRules) {
      for (const rule of config.pathRiskRules) {
        if (rule.pattern.test(normalized)) return rule.risk;
      }
    }

    // 全局路径规则
    if (this.config.globalPathRiskRules) {
      for (const rule of this.config.globalPathRiskRules) {
        if (rule.pattern.test(normalized)) return rule.risk;
      }
    }

    return 'medium';
  }

  // ─── API: shouldAutoApprove() ─────────────────────────

  /** 规则链求值：首个匹配规则决定结果 */
  shouldAutoApprove(context: ApprovalContext): boolean {
    const { settings, editorMode, isSessionTrusted, toolName, userMessageHasAutoApprove } = context;
    const category = this.categorizeTool(toolName);
    const logPrefix = `[Approval] [${toolName}]`;

    for (const rule of this.sortedRules) {
      // 外部条件守卫（某些规则需要运行时 context 控制）
      if (rule.name === 'user-message-override' && !userMessageHasAutoApprove) continue;
      if (rule.name === 'global-auto-approve' && !settings.agentAutoApprove) continue;

      const approvalMode = (settings as any).agentApprovalMode || 'session-once';
      if (rule.name === 'always-approve' && approvalMode !== 'always') continue;
      if (rule.name === 'session-trust' && !(approvalMode === 'session-once' && isSessionTrusted)) continue;

      // when 条件匹配
      const when = rule.when;
      if (when?.category) {
        const cats = Array.isArray(when.category) ? when.category : [when.category];
        if (!cats.includes(category)) continue;
      }
      if (when?.editorMode) {
        const modes = Array.isArray(when.editorMode) ? when.editorMode : [when.editorMode];
        if (!modes.includes(editorMode)) continue;
      }
      if (when?.requireSandbox && this._isSandbox) continue;

      // permission-store-allow 需要异步 invoke，同步模式跳过
      if (rule.name === 'permission-store-allow') continue;

      // 规则命中
      console.log(`${logPrefix} ✅ Rule "${rule.name}": ${rule.then.reason}`);
      return rule.then.approve;
    }

    // 没有规则匹配
    console.log(`${logPrefix} ✋ No rule matched, manual approval required`);
    return false;
  }

  // ─── API: shouldAutoApproveAsync() — 包含异步权限检查 ──────

  /** 从 Rust PermissionStore 检查工具是否在白名单中 */
  protected async checkPermissionStore(toolName: string): Promise<boolean> {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const payload = JSON.stringify({ tool: toolName, args: {} });
      const result = await invoke<string>('permission_invoke', {
        action: 'is_allowed',
        payload,
      });
      return result === 'true';
    } catch {
      return false;
    }
  }

  /**
   * 异步版 shouldAutoApprove — 支持 permission-store-allow 规则
   *
   * 与同步版的区别：
   * - permission-store-allow 规则通过 invoke 异步检查 Rust PermissionStore
   * - 其余规则逻辑与同步版一致
   */
  async shouldAutoApproveAsync(context: ApprovalContext): Promise<boolean> {
    const { settings, editorMode, isSessionTrusted, toolName, userMessageHasAutoApprove } = context;
    const category = this.categorizeTool(toolName);
    const logPrefix = `[Approval] [${toolName}]`;

    for (const rule of this.sortedRules) {
      // 外部条件守卫
      if (rule.name === 'user-message-override' && !userMessageHasAutoApprove) continue;
      if (rule.name === 'global-auto-approve' && !settings.agentAutoApprove) continue;

      const approvalMode = (settings as any).agentApprovalMode || 'session-once';
      if (rule.name === 'always-approve' && approvalMode !== 'always') continue;
      if (rule.name === 'session-trust' && !(approvalMode === 'session-once' && isSessionTrusted)) continue;

      // when 条件匹配
      const when = rule.when;
      if (when?.category) {
        const cats = Array.isArray(when.category) ? when.category : [when.category];
        if (!cats.includes(category)) continue;
      }
      if (when?.editorMode) {
        const modes = Array.isArray(when.editorMode) ? when.editorMode : [when.editorMode];
        if (!modes.includes(editorMode)) continue;
      }
      if (when?.requireSandbox && this._isSandbox) continue;

      // permission-store-allow: 异步检查 Rust PermissionStore
      if (rule.name === 'permission-store-allow') {
        const allowed = await this.checkPermissionStore(toolName);
        if (allowed) {
          console.log(`${logPrefix} ✅ Rule "${rule.name}": ${rule.then.reason}`);
          return true;
        }
        continue; // 未命中白名单，继续下一规则
      }

      // 规则命中
      console.log(`${logPrefix} ✅ Rule "${rule.name}": ${rule.then.reason}`);
      return rule.then.approve;
    }

    console.log(`${logPrefix} ✋ No rule matched, manual approval required`);
    return false;
  }

  // ─── API: 查询接口 ───────────────────────────────────

  /** 获取工具完整配置 */
  getToolConfig(toolName: string): ToolApprovalConfig | undefined {
    return this.resolveTool(toolName);
  }

  /** 工具是否可聚合显示 */
  isAggregatable(toolName: string): boolean {
    const lower = toolName.toLowerCase();
    return this.aggregatableNames.has(lower) ||
      this.aggregatableNames.has(lower.replace(/^agent_/, ''));
  }

  /** 按类别获取工具列表 */
  getToolsByCategory(category: ToolCategory): ToolApprovalConfig[] {
    return this.toolsByCategory.get(category) || [];
  }

  /** 按风险等级获取工具列表 */
  getToolsByRisk(risk: RiskLevel): ToolApprovalConfig[] {
    return this.toolsByRisk.get(risk) || [];
  }

  /** 所有已注册工具 */
  get allTools(): ToolApprovalConfig[] {
    return this.config.tools;
  }

  /** 沙箱状态 */
  get isSandbox(): boolean {
    return this._isSandbox;
  }

  setSandbox(value: boolean): void {
    this._isSandbox = value;
  }

  // ─── 内部工具 ─────────────────────────────────────────

  /** 解析工具名称（归一化 + agent_ 前缀剥离） */
  private resolveTool(toolName: string): ToolApprovalConfig | undefined {
    const normalized = toolName.toLowerCase().replace(/^agent_/, '').replace(/[\s-]/g, '_');
    return this.toolByName.get(normalized) || this.toolByName.get(toolName.toLowerCase());
  }
}

// ═══════════════════════════════════════════════════════════
// 全局单例 + 向后兼容导出
// ═══════════════════════════════════════════════════════════

export const toolApprovalRegistry = new ToolApprovalRegistry(toolApprovalConfig);

// 延迟初始化沙箱检测（等待 settingsStore rehydrate 完成）
if (typeof window !== 'undefined') {
  setTimeout(() => toolApprovalRegistry.initSandboxDetection(), 500);
}

/** @deprecated 使用 toolApprovalRegistry.categorizeTool() */
export const categorizeTool = (toolName: string): ToolCategory =>
  toolApprovalRegistry.categorizeTool(toolName);

/** @deprecated 使用 toolApprovalRegistry.shouldAutoApprove() */
export const shouldAutoApprove = (context: ApprovalContext): boolean =>
  toolApprovalRegistry.shouldAutoApprove(context);

export const shouldAutoApproveAsync = (context: ApprovalContext): Promise<boolean> =>
  toolApprovalRegistry.shouldAutoApproveAsync(context);
