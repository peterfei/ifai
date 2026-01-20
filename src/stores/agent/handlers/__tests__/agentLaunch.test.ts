import { describe, it, expect } from 'vitest';
import {
  convertProviderConfigToBackend,
  validateLaunchPrerequisites,
  generateAgentId
} from '../agentLaunch';

describe('agentLaunch', () => {
  describe('convertProviderConfigToBackend', () => {
    it('应该转换前端 provider 配置到后端格式', () => {
      const frontendConfig = {
        id: 'provider-1',
        name: 'OpenAI',
        protocol: 'openai',
        apiKey: 'sk-test',
        baseUrl: 'https://api.openai.com/v1',
        enabled: true,
        model: 'gpt-4'
      };

      const result = convertProviderConfigToBackend(frontendConfig);

      expect(result).toEqual({
        id: 'provider-1',
        name: 'OpenAI',
        protocol: 'openai',
        apiKey: 'sk-test',
        baseUrl: 'https://api.openai.com/v1',
        enabled: true,
        model: 'gpt-4',
        // 后端兼容性别名
        provider: 'openai',
        api_key: 'sk-test',
        base_url: 'https://api.openai.com/v1'
      });
    });

    it('应该包含所有原始字段', () => {
      const config = {
        id: 'test',
        protocol: 'anthropic',
        apiKey: 'key',
        customField: 'value'
      } as any;

      const result = convertProviderConfigToBackend(config);

      expect(result.customField).toBe('value');
      expect(result.protocol).toBe('anthropic');
    });
  });

  describe('validateLaunchPrerequisites', () => {
    it('应该通过有效的前置条件', () => {
      const prerequisites = {
        projectRoot: '/project',
        providerConfig: { id: 'provider-1', name: 'Test', protocol: 'openai', apiKey: 'test-key' }
      };

      expect(() => validateLaunchPrerequisites(prerequisites)).not.toThrow();
    });

    it('应该抛出错误当没有 projectRoot', () => {
      const prerequisites = {
        projectRoot: undefined,
        providerConfig: { id: 'provider-1', name: 'Test', protocol: 'openai', apiKey: 'test-key' }
      };

      expect(() => validateLaunchPrerequisites(prerequisites)).toThrow('No project root available');
    });

    it('应该抛出错误当没有 providerConfig', () => {
      const prerequisites = {
        projectRoot: '/project',
        providerConfig: null
      };

      expect(() => validateLaunchPrerequisites(prerequisites)).toThrow('No AI provider configured');
    });

    it('应该抛出错误当 providerConfig 为空对象', () => {
      const prerequisites = {
        projectRoot: '/project',
        providerConfig: undefined
      };

      expect(() => validateLaunchPrerequisites(prerequisites)).toThrow('No AI provider configured');
    });
  });

  describe('generateAgentId', () => {
    it('应该生成唯一的 ID', () => {
      const id1 = generateAgentId();
      const id2 = generateAgentId();

      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^[a-f0-9-]{36}$/); // UUID v4 格式
    });

    it('应该生成事件 ID 前缀', () => {
      const agentId = generateAgentId();
      const eventId = `agent_${agentId}`;

      expect(eventId).toMatch(/^agent_[a-f0-9-]{36}$/);
    });
  });
});
