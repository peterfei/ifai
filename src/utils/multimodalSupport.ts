/**
 * 多模态支持配置和检测工具
 *
 * 功能：检测供应商和模型是否支持多模态（图片识别）
 * 用途：前端实时提示用户当前模型是否支持图片上传
 */

/**
 * 供应商多模态能力配置
 */
export const PROVIDER_MULTIMODAL_CAPABILITIES: Record<string, {
  /** 支持多模态的模型列表 */
  multimodal: string[];
  /** 不支持多模态的模型列表 */
  nonMultimodal: string[];
  /** 推荐的视觉模型（当用户选择非视觉模型时自动切换建议） */
  recommendedVisionModel?: string;
}> = {
  openai: {
    multimodal: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-vision', 'gpt-4-turbo'],
    nonMultimodal: ['gpt-3.5-turbo', 'gpt-4'],
    recommendedVisionModel: 'gpt-4o',
  },
  zhipu: {
    multimodal: ['glm-4.5v', 'glm-4v', 'glm-4v-plus'],
    nonMultimodal: ['glm-4.7', 'glm-4.7-flash', 'glm-4.6', 'glm-4-plus'],
    recommendedVisionModel: 'glm-4.5v',
  },
  deepseek: {
    multimodal: ['deepseek-vl', 'deepseek-vl-plus'],
    nonMultimodal: ['deepseek-chat', 'deepseek-coder'],
    recommendedVisionModel: 'deepseek-vl',
  },
  gemini: {
    multimodal: ['gemini-2.0-flash-exp', 'gemini-1.5-flash', 'gemini-1.5-pro'],
    nonMultimodal: [],
    // Gemini 所有模型都支持视觉，无需推荐
  },
  anthropic: {
    multimodal: ['claude-3.5-sonnet', 'claude-3.5-opus', 'claude-3-opus'],
    nonMultimodal: [],
    // Claude 所有模型都支持视觉
  },
  kimi: {
    multimodal: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
    nonMultimodal: [],
    // Kimi 所有模型都支持视觉（待确认）
  },
  custom: {
    multimodal: [],
    nonMultimodal: [],
    // 自定义端点需要用户手动配置
  },
};

/**
 * 检查指定供应商和模型是否支持多模态
 *
 * @param providerId - 供应商 ID
 * @param model - 模型名称
 * @returns 是否支持多模态
 *
 * @example
 * ```ts
 * checkMultimodalSupport('openai', 'gpt-4o') // true
 * checkMultimodalSupport('openai', 'gpt-3.5-turbo') // false
 * checkMultimodalSupport('zhipu', 'glm-4.7') // false
 * ```
 */
export function checkMultimodalSupport(
  providerId: string,
  model: string
): boolean {
  const config = PROVIDER_MULTIMODAL_CAPABILITIES[providerId];

  // 如果没有配置，默认支持（避免误报）
  if (!config) {
    return true;
  }

  // 如果 multimodal 列表非空，检查模型是否在列表中
  if (config.multimodal.length > 0) {
    return config.multimodal.some(m => model.toLowerCase().includes(m.toLowerCase()));
  }

  // 如果 multimodal 列表为空但 nonMultimodal 列表非空，检查模型是否不在 nonMultimodal 列表中
  if (config.nonMultimodal.length > 0) {
    return !config.nonMultimodal.some(m => model.toLowerCase().includes(m.toLowerCase()));
  }

  // 如果两个列表都为空，默认支持（如 Gemini、Anthropic）
  return true;
}

/**
 * 获取推荐的视觉模型
 *
 * @param providerId - 供应商 ID
 * @returns 推荐的视觉模型名称，如果没有则返回 null
 *
 * @example
 * ```ts
 * getRecommendedVisionModel('openai') // 'gpt-4o'
 * getRecommendedVisionModel('zhipu') // 'glm-4.5v'
 * ```
 */
export function getRecommendedVisionModel(providerId: string): string | null {
  const config = PROVIDER_MULTIMODAL_CAPABILITIES[providerId];
  return config?.recommendedVisionModel || null;
}

/**
 * 生成多模态不支持警告消息
 *
 * @param providerId - 供应商 ID
 * @param model - 当前模型名称
 * @returns 警告消息对象
 *
 * @example
 * ```ts
 * const warning = getMultimodalWarning('openai', 'gpt-3.5-turbo');
 * // {
 * //   title: '当前模型不支持图片识别',
 * //   message: 'OpenAI 的 gpt-3.5-turbo 模型不支持图片识别。',
 * //   suggestion: '请切换到 gpt-4o 或删除图片后继续。'
 * // }
 * ```
 */
export function getMultimodalWarning(
  providerId: string,
  model: string
): {
  title: string;
  message: string;
  suggestion: string;
  recommendedModel?: string;
} | null {
  if (checkMultimodalSupport(providerId, model)) {
    return null;
  }

  const config = PROVIDER_MULTIMODAL_CAPABILITIES[providerId];
  const providerName = providerId.charAt(0).toUpperCase() + providerId.slice(1);

  return {
    title: '当前模型不支持图片识别',
    message: `${providerName} 的 ${model} 模型不支持图片识别。`,
    suggestion: config?.recommendedVisionModel
      ? `请切换到 ${config.recommendedVisionModel} 或删除图片后继续。`
      : '请删除图片后继续。',
    recommendedModel: config?.recommendedVisionModel,
  };
}

/**
 * 获取供应商的显示名称
 */
function getProviderDisplayName(providerId: string): string {
  const names: Record<string, string> = {
    openai: 'OpenAI',
    zhipu: '智谱AI',
    deepseek: 'DeepSeek',
    gemini: 'Gemini',
    anthropic: 'Anthropic',
    kimi: 'Kimi',
    custom: '自定义端点',
  };
  return names[providerId] || providerId;
}
