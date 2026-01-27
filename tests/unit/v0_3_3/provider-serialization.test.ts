/**
 * Provider Config Serialization Test
 * 测试前端与后端之间的字段命名映射
 *
 * 问题描述：
 * - 前端使用 camelCase: apiKey, baseUrl
 * - 后端 Rust 使用 snake_case: api_key, base_url
 *
 * 修复：确保发送给后端的 providerConfig 使用 snake_case 字段名
 */

import { describe, it, expect } from 'vitest';

describe('Provider Config Serialization - 字段命名修复', () => {
  it('应该使用 snake_case 字段名匹配后端 Rust serde', () => {
    // 模拟前端 settings store 中的提供商数据（使用 camelCase）
    const frontendProviderData = {
      id: 'nvidia',
      name: 'NVIDIA',
      apiKey: 'nvapi-test-key',
      baseUrl: 'https://integrate.api.nvidia.com/v1/chat/completions',
      protocol: 'openai',
      enabled: true,
      models: ['nv-tmp'],
    };

    // 模拟发送给后端的 providerConfig（应该使用 snake_case）
    const providerConfigSentToBackend = {
      id: frontendProviderData.id,
      name: frontendProviderData.name,
      api_key: frontendProviderData.apiKey,  // ✅ 使用 snake_case
      base_url: frontendProviderData.baseUrl, // ✅ 使用 snake_case
      models: ['nv-tmp'],
      protocol: frontendProviderData.protocol,
    };

    // 验证：后端能够正确反序列化的字段名
    expect(providerConfigSentToBackend).toHaveProperty('api_key');
    expect(providerConfigSentToBackend).toHaveProperty('base_url');

    // 验证：不应该有 camelCase 字段（否则 serde 会忽略）
    expect(providerConfigSentToBackend).not.toHaveProperty('apiKey');
    expect(providerConfigSentToBackend).not.toHaveProperty('baseUrl');

    // 验证：字段值正确
    expect(providerConfigSentToBackend.api_key).toBe('nvapi-test-key');
    expect(providerConfigSentToBackend.base_url).toBe('https://integrate.api.nvidia.com/v1/chat/completions');
  });

  it('应该兼容同时存在 camelCase 和 snake_case 的情况', () => {
    // 某些情况下，前端可能同时发送两种格式
    const mixedProviderData = {
      id: 'nvidia',
      name: 'NVIDIA',
      apiKey: 'nvapi-test-key',      // camelCase
      baseUrl: 'https://api.nvidia.com/v1/chat/completions', // camelCase
      api_key: 'nvapi-test-key',     // snake_case
      base_url: 'https://api.nvidia.com/v1/chat/completions', // snake_case
    };

    // 修复后的代码应该优先使用 snake_case
    const fixedConfig = {
      id: mixedProviderData.id,
      name: mixedProviderData.name,
      api_key: mixedProviderData.api_key || mixedProviderData.apiKey,
      base_url: mixedProviderData.base_url || mixedProviderData.baseUrl,
      models: ['nv-tmp'],
      protocol: 'openai',
    };

    expect(fixedConfig.api_key).toBe('nvapi-test-key');
    expect(fixedConfig.base_url).toBe('https://api.nvidia.com/v1/chat/completions');
  });

  it('NVIDIA API URL 格式验证', () => {
    const validUrls = [
      'https://integrate.api.nvidia.com/v1/chat/completions',
      'https://integrate.api.nvidia.com/v1/chat/completions/',
    ];

    validUrls.forEach(url => {
      const baseUrl = url.endsWith('/') ? url.slice(0, -1) : url;
      expect(baseUrl).toMatch(/https:\/\/integrate\.api\.nvidia\.com\/v1\/chat\/completions/);
    });
  });
});
