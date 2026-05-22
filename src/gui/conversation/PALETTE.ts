/**
 * PALETTE — 统一颜色数据源
 *
 * 元编程重构：从 4 个独立颜色映射表合并为单一主题
 * 所有颜色派生均通过 derivePalette() 实现，零硬编码重复
 *
 * 反模式消除：
 * - ❌ 4 个独立表：AGENT_DSL, RISK_CONFIG, TAG_COLOR_CONFIG, STATUS_STYLE
 * - ✅ 1 个主题：SEMANTIC_TOKENS + derivePalette()
 */

/* ===== SEMANTIC_TOKENS — 所有颜色的唯一数据源 ===== */

/**
 * 语义色 Token
 * 用于表达状态、情绪、语义的通用颜色
 */
const SEMANTIC_COLORS = {
  success: '#10B981', // 绿色 — 成功/通过/低风险
  warning: '#F59E0B', // 橙色 — 警告/等待/中风险
  danger:  '#EF4444', // 红色 — 错误/拒绝/高风险
  info:    '#3B82F6', // 蓝色 — 信息/品牌/默认
  muted:   '#9CA3AF', // 浅灰 — 禁用/次要
  neutral: '#6B7280', // 深灰 — 完成/默认
} as const;

/**
 * 特殊色 Token
 * Agent 角色专用的扩展色（不在 6 个语义色中）
 */
const EXTENDED_COLORS = {
  cyan: '#06B6D4', // 青色 — 测试 Agent
  pink: '#EC4899', // 粉色 — 分析 Agent
} as const;

/**
 * Surface 色系 Token
 * 背景色、边框色等表面颜色
 */
const SURFACE_COLORS = {
  bg0:    '#000000', // 纯黑
  bg1:    '#1E1E1E', // 主背景
  bg2:    '#1F2937', // 次背景
  bg3:    '#2D2D2D', // 三级背景
  border: '#2D2D2D', // 边框
} as const;

/**
 * SEMANTIC_TOKENS — 导出的主题对象
 * 合并语义色、扩展色、表面色
 */
export const SEMANTIC_TOKENS = {
  semantic: SEMANTIC_COLORS,
  extended: EXTENDED_COLORS,
  surface:  SURFACE_COLORS,
} as const;

/* ===== derivePalette — 元编程核心函数 ===== */

/**
 * 颜色四件套
 * 所有派生调色板的标准输出格式
 */
export type ColorQuad = {
  bg: string;      // 背景色
  text: string;    // 文本色
  border: string;  // 边框色
  dot: string;     // 圆点/指示器色
};

/**
 * 从语义色名派生颜色四件套
 *
 * @param colorKey - 语义色名（如 'info', 'success'）
 * @returns 颜色四件套 {bg, text, border, dot}
 *
 * @example
 * derivePalette({ primary: 'info' })
 * // → { primary: { bg: '#3B82F6', text: '#3B82F6', border: '#3B82F6', dot: '#3B82F6' } }
 */
function deriveColorQuad(colorKey: string): ColorQuad {
  // 优先从语义色查找
  const semanticColor = (SEMANTIC_TOKENS.semantic as Record<string, string>)[colorKey];
  if (semanticColor) {
    return {
      bg: semanticColor,
      text: semanticColor,
      border: semanticColor,
      dot: semanticColor,
    };
  }

  // 其次从扩展色查找
  const extendedColor = (SEMANTIC_TOKENS.extended as Record<string, string>)[colorKey];
  if (extendedColor) {
    return {
      bg: extendedColor,
      text: extendedColor,
      border: extendedColor,
      dot: extendedColor,
    };
  }

  // 安全降级：未知颜色返回 neutral
  return {
    bg: SEMANTIC_TOKENS.semantic.neutral,
    text: SEMANTIC_TOKENS.semantic.neutral,
    border: SEMANTIC_TOKENS.semantic.neutral,
    dot: SEMANTIC_TOKENS.semantic.neutral,
  };
}

/**
 * derivePalette — 从语义色映射表派生完整调色板
 *
 * 元编程核心：一个函数替代 4 个手动映射表
 *
 * @param mapping - 从键到语义色名的映射（如 { PM: 'info', RF: 'success' }）
 * @returns 派生后的调色板，每个键对应一个 ColorQuad
 *
 * @example
 * derivePalette({ PM: 'info', RF: 'success' })
 * // → {
 * //     PM:   { bg: '#3B82F6', text: '#3B82F6', border: '#3B82F6', dot: '#3B82F6' },
 * //     RF:   { bg: '#10B981', text: '#10B981', border: '#10B981', dot: '#10B981' }
 * //   }
 */
export function derivePalette<K extends string>(
  mapping: Record<K, string>
): Record<K, ColorQuad> {
  const result = {} as Record<K, ColorQuad>;

  for (const [key, colorKey] of Object.entries(mapping)) {
    result[key as K] = deriveColorQuad(String(colorKey));
  }

  return result;
}

/* ===== 预定义派生调色板 ===== */

/**
 * AGENT_PALETTE — Agent 类型颜色
 *
 * 对应项目已实现的 agent 命令类型：
 * - explore: 探索代码库（蓝色）
 * - review: 代码审查（橙色）
 * - test: 测试生成（绿色）
 * - doc: 文档生成（紫色）
 * - refactor: 重构（黄色）
 * - proposal: 提案生成（青色）
 * - task: 任务拆解（粉色）
 */
export const AGENT_PALETTE = derivePalette({
  explore:  'info',     // 蓝色 #3B82F6
  review:  'warning',   // 橙色 #F59E0B
  test:    'success',   // 绿色 #10B981
  doc:     'info',      // 蓝色 #3B82F6（与 explore 共用）
  refactor: 'warning',  // 橙色 #F59E0B（与 review 共用）
  proposal: 'cyan',     // 青色 #06B6D4
  task:    'pink',      // 粉色 #EC4899
});

/**
 * RISK_PALETTE — 风险等级颜色
 *
 * 用于审批卡片、文件变更条目等风险标识
 */
export const RISK_PALETTE = derivePalette({
  low:    'success', // 绿色 #10B981
  medium: 'warning', // 橙色 #F59E0B
  high:   'danger',  // 红色 #EF4444
});

/**
 * STATUS_PALETTE — 状态颜色
 *
 * 用于任务清单、线程状态等状态标识
 */
export const STATUS_PALETTE = derivePalette({
  active:    'success',  // 绿色 #10B981
  completed: 'neutral',  // 灰色 #6B7280
  pending:   'warning',  // 橙色 #F59E0B
});

/**
 * AGENT_STATUS_PALETTE — Agent 状态颜色
 *
 * 用于 AgentWorkstation 的状态指示器和标签
 */
export const AGENT_STATUS_PALETTE = derivePalette({
  running:        'info',     // 蓝色 #3B82F6
  completed:      'success',  // 绿色 #10B981
  failed:         'danger',   // 红色 #EF4444
  initializing:   'warning',  // 橙色 #F59E0B
  idle:           'neutral',  // 灰色 #6B7280
  waitingfortool: 'warning',  // 橙色 #F59E0B
  stopped:        'muted',    // 浅灰 #9CA3AF
});

/**
 * TAG_PALETTE — 标签颜色
 *
 * 用于交互卡片的选项标签、分类标签等
 */
export const TAG_PALETTE = derivePalette({
  brand:   'info',     // 蓝色 #3B82F6
  amber:   'warning',  // 橙色 #F59E0B
  emerald: 'success',  // 绿色 #10B981
  red:     'danger',   // 红色 #EF4444
  default: 'muted',    // 浅灰 #9CA3AF
});
