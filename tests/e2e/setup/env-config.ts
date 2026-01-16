/**
 * E2E 测试环境配置模块
 *
 * 负责从 .env.e2e.local 文件和环境变量加载配置
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// ES 模块兼容：获取 __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * E2E 测试环境配置选项
 */
export interface E2ETestEnvironmentOptions {
  /**
   * 是否使用真实 AI（不 Mock AI API）
   * @default false
   */
  useRealAI?: boolean;

  /**
   * 真实 AI 的 API Key（可选，如果使用真实 AI 但不想在 localStorage 中配置）
   */
  realAIApiKey?: string;

  /**
   * 真实 AI 的 Base URL（可选）
   */
  realAIBaseUrl?: string;

  /**
   * 真实 AI 的模型名称（可选）
   */
  realAIModel?: string;

  /**
   * 配置文件路径（默认为 tests/e2e/.env.e2e.local）
   */
  configPath?: string;

  /**
   * 是否模拟 DeepSeek API 的流式工具调用行为
   * 当启用时，后续参数块会使用 id: null, index: 0 的格式
   * @default false
   */
  simulateDeepSeekStreaming?: boolean;
}

/**
 * 真实 AI 配置（运行时）
 */
export interface RealAIConfig {
  useRealAI: boolean;
  realAIApiKey?: string;
  realAIBaseUrl?: string;
  realAIModel?: string;
  simulateDeepSeekStreaming?: boolean;
}

/**
 * 从 .env.e2e.local 文件加载配置
 *
 * @param configPath 配置文件路径
 * @returns 配置对象
 */
export function loadE2EConfig(configPath?: string): Record<string, string> {
  const defaultPath = resolve(__dirname, '../.env.e2e.local');
  const filePath = configPath || defaultPath;

  try {
    const content = readFileSync(filePath, 'utf-8');
    const config: Record<string, string> = {};

    content.split('\n').forEach(line => {
      const trimmedLine = line.trim();
      // 跳过空行和注释
      if (!trimmedLine || trimmedLine.startsWith('#')) {
        return;
      }
      // 解析 KEY=VALUE 格式
      const match = trimmedLine.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim();
        // 移除值两端的引号（如果有）
        config[key] = value.replace(/^['"]|['"]$/g, '');
      }
    });

    return config;
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      // 文件不存在，返回空配置
      return {};
    }
    console.warn(`[E2E] Warning: Failed to load config from ${filePath}:`, error.message);
    return {};
  }
}

/**
 * 构建运行时配置
 *
 * 优先级：命令行参数 > 环境变量 > 配置文件
 *
 * @param options 用户传入的选项
 * @returns 合并后的配置
 */
export function buildRuntimeConfig(options: E2ETestEnvironmentOptions = {}): RealAIConfig {
  const fileConfig = loadE2EConfig(options.configPath);

  const useRealAI = options.useRealAI ?? (fileConfig.E2E_AI_API_KEY ? true : false);
  const realAIApiKey = options.realAIApiKey ?? process.env.E2E_AI_API_KEY ?? fileConfig.E2E_AI_API_KEY;
  const realAIBaseUrl = options.realAIBaseUrl ?? process.env.E2E_AI_BASE_URL ?? fileConfig.E2E_AI_BASE_URL;
  const realAIModel = options.realAIModel ?? process.env.E2E_AI_MODEL ?? fileConfig.E2E_AI_MODEL;
  const simulateDeepSeekStreaming = options.simulateDeepSeekStreaming ?? false;

  // 🔥 检查是否需要真实 AI 但没有配置
  if (useRealAI && !realAIApiKey) {
    console.warn(`[E2E] ⚠️  真实 AI 模式已启用，但未配置 API Key。`);
    console.warn(`[E2E] 🔑 请创建 .env.e2e.local 文件并配置：`);
    console.warn(`[E2E]`);
    console.warn(`[E2E]   E2E_AI_API_KEY=your-api-key-here`);
    console.warn(`[E2E]   E2E_AI_BASE_URL=https://api.deepseek.com`);
    console.warn(`[E2E]   E2E_AI_MODEL=deepseek-chat`);
    console.warn(`[E2E]`);
    console.warn(`[E2E] 💡 或者参考 tests/e2e/.env.e2e.example 模板文件。`);
  } else if (useRealAI && realAIApiKey) {
    console.log(`[E2E] 🤖 使用真实 AI 模式`);
    console.log(`[E2E]    API: ${realAIBaseUrl || 'default'}`);
    console.log(`[E2E]    模型: ${realAIModel || 'default'}`);
    console.log(`[E2E]    Key: ${realAIApiKey ? realAIApiKey.substring(0, 10) + '...' : 'N/A'}`);
  }

  return {
    useRealAI,
    realAIApiKey,
    realAIBaseUrl,
    realAIModel,
    simulateDeepSeekStreaming
  };
}

/**
 * 获取真实 AI 的 provider 和 model 配置
 *
 * @param fileConfig 配置文件内容
 * @returns providerId 和 modelId
 */
export function getRealAIProviderConfig(fileConfig: Record<string, string>): {
  providerId: string;
  modelId: string;
} {
  const providerId = fileConfig.E2E_AI_PROVIDER_ID || 'real-ai-e2e';
  const modelId = fileConfig.E2E_AI_MODEL_ID || fileConfig.E2E_AI_MODEL || 'deepseek-chat';
  return { providerId, modelId };
}
