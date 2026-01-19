/**
 * Agent 启动辅助函数
 * 提取 launchAgent 中的可复用逻辑
 * @module agentLaunch
 */

import { v4 as uuidv4 } from 'uuid';

/**
 * 前端 Provider 配置接口
 */
export interface ProviderConfig {
  id: string;
  name: string;
  protocol: string;
  apiKey: string;
  baseUrl?: string;
  enabled?: boolean;
  model?: string;
  [key: string]: any;
}

/**
 * 后端 Provider 配置接口
 */
export interface BackendProviderConfig extends ProviderConfig {
  provider: string;
  api_key: string;
  base_url?: string;
}

/**
 * Agent 启动前置条件
 */
export interface LaunchPrerequisites {
  projectRoot?: string;
  providerConfig?: ProviderConfig | null;
}

/**
 * 将前端 provider 配置转换为后端格式
 *
 * 转换规则：
 * - protocol → provider (后端兼容性)
 * - apiKey → api_key (snake_case)
 * - baseUrl → base_url (snake_case)
 * - 保留所有原始字段
 *
 * @param frontendConfig - 前端 provider 配置
 * @returns 后端格式配置
 */
export function convertProviderConfigToBackend(
  frontendConfig: ProviderConfig
): BackendProviderConfig {
  return {
    ...frontendConfig,
    provider: frontendConfig.protocol,
    api_key: frontendConfig.apiKey,
    base_url: frontendConfig.baseUrl,
  };
}

/**
 * 验证 Agent 启动前置条件
 *
 * @param prerequisites - 前置条件对象
 * @throws Error 当前置条件不满足时
 */
export function validateLaunchPrerequisites(prerequisites: LaunchPrerequisites): void {
  const { projectRoot, providerConfig } = prerequisites;

  if (!projectRoot) {
    throw new Error('No project root available');
  }

  if (!providerConfig) {
    throw new Error('No AI provider configured');
  }
}

/**
 * 生成 Agent ID
 * 使用 UUID v4 生成唯一标识符
 *
 * @returns Agent ID (UUID v4 格式)
 */
export function generateAgentId(): string {
  return uuidv4();
}

/**
 * 生成事件 ID
 *
 * @param agentId - Agent ID
 * @returns 事件 ID (格式: agent_{uuid})
 */
export function generateEventId(agentId: string): string {
  return `agent_${agentId}`;
}
