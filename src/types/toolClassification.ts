/**
 * 工具分类系统类型定义
 *
 * 对应Rust后端的三层工具分类系统：
 * - Layer 1: 精确匹配 (<1ms)
 * - Layer 2: 规则分类 (~5ms)
 * - Layer 3: LLM 分类 (~200ms)
 */

/**
 * 工具分类类别
 */
export enum ToolCategory {
  /** 文件操作：读取、写入、重命名、删除等 */
  FileOperations = 'file_operations',
  /** 代码生成：补全、重构、创建组件等 */
  CodeGeneration = 'code_generation',
  /** 代码分析：解释代码、分析性能、检查错误等 */
  CodeAnalysis = 'code_analysis',
  /** 终端命令：git、npm、cargo、pip 等命令执行 */
  TerminalCommands = 'terminal_commands',
  /** AI 对话：技术问答、概念解释、使用方法询问等 */
  AiChat = 'ai_chat',
  /** 搜索操作：查找代码、搜索函数、定位引用等 */
  SearchOperations = 'search_operations',
  /** 无需工具：直接回答、闲聊等 */
  NoToolNeeded = 'no_tool_needed',
}

/**
 * 分类层级
 */
export enum ClassificationLayer {
  /** 精确匹配层：斜杠命令、Agent函数、纯命令 */
  Layer1 = 'layer1',
  /** 规则分类层：关键词匹配、模式检测 */
  Layer2 = 'layer2',
  /** LLM推理层：Qwen 0.5B 零样本分类 */
  Layer3 = 'layer3',
}

/**
 * 工具分类结果
 */
export interface ClassificationResult {
  /** 分类层级 */
  layer: ClassificationLayer;
  /** 工具类别 */
  category: ToolCategory;
  /** 具体工具名称（可选） */
  tool?: string;
  /** 置信度 [0.0, 1.0] */
  confidence: number;
  /** 匹配类型 */
  matchType: string;
}

/**
 * 单次分类响应
 */
export interface ClassifyToolResponse {
  /** 分类结果 */
  result: ClassificationResult;
  /** 延迟（毫秒） */
  latencyMs: number;
}

/**
 * 批量分类响应
 */
export interface BatchClassifyResponse {
  /** 分类结果列表 */
  results: ClassificationResult[];
  /** 总延迟（毫秒） */
  totalLatencyMs: number;
}

/**
 * 工具分类历史记录
 */
export interface ClassificationHistoryItem {
  /** 唯一ID */
  id: string;
  /** 用户输入 */
  input: string;
  /** 分类结果 */
  result: ClassificationResult;
  /** 时间戳 */
  timestamp: number;
  /** 延迟（毫秒） */
  latencyMs: number;
}

/**
 * 工具类别显示信息
 */
export interface ToolCategoryDisplayInfo {
  /** 类别 */
  category: ToolCategory;
  /** 显示名称（中文） */
  label: string;
  /** 显示名称（英文） */
  labelEn: string;
  /** 描述 */
  description: string;
  /** 图标 */
  icon: string;
  /** 颜色主题 */
  color: string;
}

/**
 * 工具类别显示信息映射
 */
export const TOOL_CATEGORY_DISPLAY_INFO: Record<ToolCategory, ToolCategoryDisplayInfo> = {
  [ToolCategory.FileOperations]: {
    category: ToolCategory.FileOperations,
    label: '文件操作',
    labelEn: 'File Operations',
    description: '打开、保存、读取、写入文件',
    icon: 'folder',
    color: 'var(--info-color)',
  },
  [ToolCategory.CodeGeneration]: {
    category: ToolCategory.CodeGeneration,
    label: '代码生成',
    labelEn: 'Code Generation',
    description: '生成代码、重构、创建组件',
    icon: 'sparkles',
    color: 'var(--success-color)',
  },
  [ToolCategory.CodeAnalysis]: {
    category: ToolCategory.CodeAnalysis,
    label: '代码分析',
    labelEn: 'Code Analysis',
    description: '解释代码、分析性能、检查错误',
    icon: 'search',
    color: 'var(--accent-color)',
  },
  [ToolCategory.TerminalCommands]: {
    category: ToolCategory.TerminalCommands,
    label: '终端命令',
    labelEn: 'Terminal Commands',
    description: '执行 git、npm、cargo 等命令',
    icon: 'terminal',
    color: 'var(--warning-color)',
  },
  [ToolCategory.AiChat]: {
    category: ToolCategory.AiChat,
    label: 'AI 对话',
    labelEn: 'AI Chat',
    description: '技术问答、概念解释',
    icon: 'message',
    color: 'var(--info-color)',
  },
  [ToolCategory.SearchOperations]: {
    category: ToolCategory.SearchOperations,
    label: '搜索操作',
    labelEn: 'Search Operations',
    description: '查找代码、搜索函数、定位引用',
    icon: 'compass',
    color: 'var(--accent-color)',
  },
  [ToolCategory.NoToolNeeded]: {
    category: ToolCategory.NoToolNeeded,
    label: '无需工具',
    labelEn: 'No Tool Needed',
    description: '直接回答、闲聊',
    icon: 'none',
    color: 'var(--text-subtle)',
  },
};

/**
 * 获取工具类别显示信息
 */
export function getToolCategoryDisplayInfo(category: ToolCategory): ToolCategoryDisplayInfo {
  return TOOL_CATEGORY_DISPLAY_INFO[category];
}

/**
 * 分类层级显示信息
 */
export interface LayerDisplayInfo {
  /** 层级 */
  layer: ClassificationLayer;
  /** 显示名称 */
  label: string;
  /** 描述 */
  description: string;
  /** 目标延迟 */
  targetLatency: string;
  /** 颜色 */
  color: string;
}

/**
 * 分类层级显示信息映射
 */
export const LAYER_DISPLAY_INFO: Record<ClassificationLayer, LayerDisplayInfo> = {
  [ClassificationLayer.Layer1]: {
    layer: ClassificationLayer.Layer1,
    label: '精确匹配',
    description: '斜杠命令、Agent函数、纯命令',
    targetLatency: '<1ms',
    color: 'var(--success-color)',
  },
  [ClassificationLayer.Layer2]: {
    layer: ClassificationLayer.Layer2,
    label: '规则分类',
    description: '关键词匹配、模式检测',
    targetLatency: '~5ms',
    color: 'var(--info-color)',
  },
  [ClassificationLayer.Layer3]: {
    layer: ClassificationLayer.Layer3,
    label: 'LLM 分类',
    description: 'Qwen 0.5B 零样本推理',
    targetLatency: '~200ms',
    color: 'var(--accent-color)',
  },
};

/**
 * 获取分类层级显示信息
 */
export function getLayerDisplayInfo(layer: ClassificationLayer): LayerDisplayInfo {
  return LAYER_DISPLAY_INFO[layer];
}

/**
 * 置信度等级
 */
export enum ConfidenceLevel {
  /** 高置信度: >= 0.9 */
  High = 'high',
  /** 中置信度: >= 0.7 */
  Medium = 'medium',
  /** 低置信度: < 0.7 */
  Low = 'low',
}

/**
 * 获取置信度等级
 */
export function getConfidenceLevel(confidence: number): ConfidenceLevel {
  if (confidence >= 0.9) return ConfidenceLevel.High;
  if (confidence >= 0.7) return ConfidenceLevel.Medium;
  return ConfidenceLevel.Low;
}

/**
 * 置信度等级显示信息
 */
export const CONFIDENCE_LEVEL_DISPLAY_INFO: Record<ConfidenceLevel, { label: string; color: string }> = {
  [ConfidenceLevel.High]: { label: '高', color: 'var(--success-color)' },
  [ConfidenceLevel.Medium]: { label: '中', color: 'var(--warning-color)' },
  [ConfidenceLevel.Low]: { label: '低', color: 'var(--danger-color)' },
};
