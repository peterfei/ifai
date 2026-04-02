export type RiskLevel = 'low' | 'medium' | 'high';

export interface RiskContext {
  toolName: string;
  args: any;
  editorMode: 'vibe' | 'spec' | 'standard';
}

export class RiskPolicy {
  private highRiskTools = new Set(['agent_delete_file', 'agent_run_command', 'delete_file']);
  private mediumRiskTools = new Set(['agent_write_file', 'write_file', 'agent_replace_text', 'TodoWrite']);

  /**
   * 计算路径的风险等级
   */
  private calculatePathRisk(path: string): RiskLevel {
    if (!path) return 'medium';

    // 1. 简单的路径规范化（移除 ./ 和处理 ../）
    // 注意：这只是前端的基础防线，真正的安全由 Rust 后端保证
    const normalizedPath = path.replace(/\\/g, '/')
      .replace(/^\.\//, '')
      .replace(/\/[^/]+\/\.\.\//g, '/')
      .replace(/^[^/]+\/\.\.\//, '');

    // 2. 匹配模式
    const criticalPatterns = [
      /^\.?env/i,
      /^package\.json$/i,
      /^tauri\.conf\.json$/i,
      /^src-tauri\/tauri\.conf\.json$/i,
      /^\.git\//i,
      /^\.ifai\//i,
      /^vite\.config\.(js|ts)$/i,
      /^tsconfig\.json$/i
    ];

    const lowRiskPatterns = [
      /\.md$/i,
      /^docs\//i,
      /^tests\//i,
      /^\.gitignore$/i,
      /^LICENSE$/i
    ];

    if (criticalPatterns.some(pattern => pattern.test(normalizedPath))) {
      return 'high';
    }

    if (lowRiskPatterns.some(pattern => pattern.test(normalizedPath))) {
      return 'low';
    }

    return 'medium';
  }

  /**
   * 计算工具调用的风险等级
   */
  calculateRisk(context: RiskContext): RiskLevel {
    const { toolName, editorMode, args } = context;

    // 1. 获取基础工具风险
    let baseRisk: RiskLevel = 'low';
    if (this.highRiskTools.has(toolName)) {
      baseRisk = 'high';
    } else if (this.mediumRiskTools.has(toolName)) {
      baseRisk = 'medium';
    }

    // 如果工具本身就是 low (只读)，直接返回
    if (baseRisk === 'low') return 'low';

    // 2. 计算路径风险
    const relPath = args?.rel_path || args?.path || '';
    const pathRisk = this.calculatePathRisk(relPath);

    // 3. 整合逻辑
    // 如果是破坏性工具，始终保持高风险
    if (baseRisk === 'high') return 'high';

    // 如果路径是高风险（核心配置），升级为高风险
    if (pathRisk === 'high') return 'high';

    // 如果路径是低风险（文档/测试），且不是破坏性操作，降级为低风险
    if (pathRisk === 'low') return 'low';

    // 4. 编辑器模式特权处理
    if (editorMode === 'vibe' && baseRisk === 'medium') {
      return 'high';
    }

    return baseRisk;
  }

  /**
   * 判断是否应该自动批准
   */
  shouldAutoApprove(level: RiskLevel, editorMode: string): boolean {
    if (level === 'low') return true;
    
    // 在特定模式下，中等风险也可以自动批准（如果用户设置了）
    // 这里可以接入 SettingsStore
    return false;
  }
}
