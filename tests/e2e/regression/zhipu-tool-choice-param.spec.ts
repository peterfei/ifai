/**
 * Zhipu tool_choice 参数测试
 *
 * 🚨 强制性规范: 遵守 tests/e2e/CODING_STANDARDS.md
 *
 * 测试目标: 高保真还原错误 1210 场景，确认 tool_choice 参数是否为根因
 *
 * 配置要求:
 * - 必须配置 .env.e2e.local 文件
 * - ZHIPU_API_KEY 必须是有效的 API key
 *
 * 测试策略:
 * 1. 测试发送普通消息（无 tools），看是否正常
 * 2. 测试发送需要 tools 的消息，捕获完整错误响应
 * 3. 对比分析请求参数差异
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

test.describe('Zhipu tool_choice Parameter Investigation', () => {
  test.beforeEach(async ({ page }) => {
    // 监听所有控制台日志
    page.on('console', msg => {
      console.log(`[Browser ${msg.type()}]`, msg.text());
    });

    // 监听网络请求
    page.on('request', request => {
      if (request.url().includes('bigmodel.cn')) {
        console.log('[API Request]', request.method(), request.url());
        console.log('[API Request Headers]', JSON.stringify(request.headers(), null, 2));
      }
    });

    // 监听网络响应
    page.on('response', async response => {
      if (response.url().includes('bigmodel.cn')) {
        console.log('[API Response]', response.status(), response.url());
        try {
          const body = await response.text();
          console.log('[API Response Body]', body);
        } catch (e) {
          console.log('[API Response Body] (binary or empty)');
        }
      }
    });

    // 设置测试环境
    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForTimeout(3000);

    // 打开聊天面板
    await page.evaluate(() => {
      const layoutStore = (window as any).__layoutStore;
      if (layoutStore) {
        const store = layoutStore;
        if (store && store.getState && !store.getState().isChatOpen) {
          store.getState().toggleChat();
        }
      }
    });
    await page.waitForTimeout(2000);
  });

  test('ZHIPU-TOOL-01: 普通消息（无 tools）应该正常工作', async ({ page }) => {
    // 设置 Zhipu provider（需要有效 API key）
    await page.evaluate(() => {
      const settingsStore = (window as any).__settingsStore;
      if (settingsStore) {
        // 读取环境变量中的 API key
        const apiKey = process.env?.ZHIPU_API_KEY || '';
        settingsStore.getState().updateProviderConfig('zhipu', {
          apiKey: apiKey
        });
        settingsStore.getState().setCurrentProviderAndModel('zhipu', 'glm-4.7');
      }
    });
    await page.waitForTimeout(1000);

    // 发送简单消息（不会触发 tools）
    await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      if (chatStore) {
        chatStore.getState().sendMessage('你好，请简单介绍一下你自己。');
      }
    });

    // 等待响应完成
    await page.waitForTimeout(15000);

    // 检查消息状态
    const result = await page.evaluate(() => {
      const messages = (window as any).__chatStore?.getState()?.messages || [];
      const lastMessage = messages[messages.length - 1];

      return {
        messageCount: messages.length,
        lastRole: lastMessage?.role,
        lastContent: lastMessage?.content?.substring(0, 200),
        isLoading: (window as any).__chatStore?.getState()?.isLoading || false
      };
    });

    console.log('[Test Result]', JSON.stringify(result, null, 2));

    // 验证收到响应
    expect(result.messageCount).toBeGreaterThan(1);
    expect(result.lastRole).toBe('assistant');
    expect(result.isLoading).toBeFalsy();

    // 验证没有错误
    expect(result.lastContent).not.toContain('❌');
    expect(result.lastContent).not.toContain('错误');
  });

  test('ZHIPU-TOOL-02: 触发 tools 的消息应该返回完整错误信息', async ({ page }) => {
    // 设置 Zhipu provider
    await page.evaluate(() => {
      const settingsStore = (window as any).__settingsStore;
      if (settingsStore) {
        const apiKey = process.env?.ZHIPU_API_KEY || '';
        settingsStore.getState().updateProviderConfig('zhipu', {
          apiKey: apiKey
        });
        settingsStore.getState().setCurrentProviderAndModel('zhipu', 'glm-4.7');
      }
    });
    await page.waitForTimeout(1000);

    // 发送会触发 tools 的消息
    await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      if (chatStore) {
        chatStore.getState().sendMessage('请帮我列出当前目录的所有文件。');
      }
    });

    // 等待响应（可能成功或失败）
    await page.waitForTimeout(20000);

    // 检查详细结果
    const result = await page.evaluate(() => {
      const messages = (window as any).__chatStore?.getState()?.messages || [];
      const lastMessage = messages[messages.length - 1];

      return {
        messageCount: messages.length,
        lastRole: lastMessage?.role,
        lastContent: lastMessage?.content || '',
        hasError: lastMessage?.content?.includes('❌') || false,
        errorContent: lastMessage?.content?.includes('❌')
          ? lastMessage.content.substring(0, 500)
          : null,
        isLoading: (window as any).__chatStore?.getState()?.isLoading || false
      };
    });

    console.log('[Test Result]', JSON.stringify(result, null, 2));

    // 如果有错误，分析错误信息
    if (result.hasError) {
      console.log('[Error Detected]', result.errorContent);

      // 检查是否是 1210 错误
      if (result.errorContent?.includes('1210')) {
        console.log('[Root Cause] 确认是错误 1210: API 调用参数有误');
      }
    }

    expect(result.isLoading).toBeFalsy();
  });

  test('ZHIPU-TOOL-03: 对比有/无 tools 的请求差异', async ({ page }) => {
    // 设置 Zhipu provider
    await page.evaluate(() => {
      const settingsStore = (window as any).__settingsStore;
      if (settingsStore) {
        const apiKey = process.env?.ZHIPU_API_KEY || '';
        settingsStore.getState().updateProviderConfig('zhipu', {
          apiKey: apiKey
        });
        settingsStore.getState().setCurrentProviderAndModel('zhipu', 'glm-4.7');
      }
    });

    // 捕获请求日志
    const requestLogs: string[] = [];
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[Zhipu]')) {
        requestLogs.push(text);
      }
    });

    await page.waitForTimeout(1000);

    // 场景1: 发送不需要 tools 的消息
    console.log('\n=== 场景1: 无 tools 消息 ===');
    await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      if (chatStore) {
        chatStore.getState().sendMessage('1+1等于几？');
      }
    });
    await page.waitForTimeout(10000);

    // 场景2: 发送需要 tools 的消息
    console.log('\n=== 场景2: 有 tools 消息 ===');
    await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      if (chatStore) {
        chatStore.getState().sendMessage('请读取 package.json 文件');
      }
    });
    await page.waitForTimeout(15000);

    // 输出所有 Zhipu 相关日志
    console.log('\n=== Zhipu Client 日志 ===');
    requestLogs.forEach(log => console.log(log));

    // 检查是否有 tool_choice 相关的日志
    const hasToolChoice = requestLogs.some(log =>
      log.includes('tool_choice') || log.includes('tool')
    );

    console.log('\n=== 分析结果 ===');
    console.log('是否检测到 tool/tool_choice 参数:', hasToolChoice);
  });
});
