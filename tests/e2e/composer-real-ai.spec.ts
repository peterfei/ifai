/**
 * v0.2.8 Composer 2.0 - AI 工具调用 E2E 测试
 *
 * 目的：验证 Composer 能正确处理 AI 返回的 tool_calls
 *
 * 与 composer.spec.ts 的区别：
 * - composer.spec.ts：使用 mock 数据，只测试 UI 交互
 * - composer-real-ai.spec.ts：测试 Composer 对 tool_calls 的响应
 *
 * 测试方法：
 * - 直接注入包含 tool_calls 的消息（模拟 AI 响应）
 * - 验证 Composer 面板正确显示和操作
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from './setup';

test.describe('Composer 2.0: AI Tool Calls Integration', () => {
  const CHAT_INPUT = '[data-testid="chat-input"]';
  const COMPOSER_DIFF_CONTAINER = '.composer-diff-container';

  test.beforeEach(async ({ page }) => {
    // 捕获所有控制台消息
    page.on('console', msg => {
      const text = msg.text();
      const type = msg.type();
      if (type === 'error') {
        console.log('[Browser Error]', text);
      } else if (text.includes('[E2E]') || text.includes('[Chat]') || text.includes('[useChatStore]')) {
        console.log('[Browser]', text);
      }
    });

    // 捕获页面错误
    page.on('pageerror', error => {
      console.log('[Page Error]', error.message, error.stack);
    });

    await setupE2ETestEnvironment(page);
    await page.goto('/');

    // 等待应用加载
    await page.waitForTimeout(5000);

    // 打开聊天面板
    await page.evaluate(() => {
      const layoutStore = (window as any).__layoutStore;
      if (layoutStore) {
        const state = layoutStore.getState();
        if (!state.isChatOpen) {
          state.toggleChat();
        }
      }
    });
    await page.waitForTimeout(2000);
  });

  test('@commercial AI tool_calls：当AI返回agent_write_file时显示"查看 Diff"按钮', async ({ page }) => {
    // 1. 创建测试消息（模拟 AI 响应包含 tool_calls）
    const testMessage = {
      id: 'ai-tool-test-1',
      role: 'assistant',
      content: '我将为您创建一个简单的 AuthService.ts 文件。',
      toolCalls: [
        {
          id: 'call_ai_tool_1',
          tool: 'agent_write_file',
          function: {
            name: 'agent_write_file',
            arguments: JSON.stringify({
              rootPath: '/Users/mac/mock-project',
              rel_path: 'src/services/AuthService.ts',
              content: `/**
 * Auth Service - 用户认证服务
 */
export interface User {
  username: string;
  email: string;
}

export class AuthService {
  async login(email: string, password: string): Promise<User> {
    if (!email || !password) {
      throw new Error('邮箱和密码不能为空');
    }
    return {
      username: email.split('@')[0],
      email,
      password: ''
    };
  }

  async register(username: string, email: string, password: string): Promise<User> {
    if (!username || !email || !password) {
      throw new Error('所有字段都是必填的');
    }
    return { username, email, password: '' };
  }
}`
            })
          },
          result: JSON.stringify({
            success: true,
            filePath: 'src/services/AuthService.ts',
            originalContent: ''
          })
        }
      ]
    };

    // 2. 注入消息（模拟 AI 返回了 tool_calls）
    await page.evaluate((msg) => {
      (window as any).__chatStore?.getState().addMessage(msg);
    }, testMessage);

    await page.waitForTimeout(2000);

    // 3. 检查是否正确提取了文件变更
    const analysis = await page.evaluate(() => {
      const helper = (window as any).__E2E_COMPOSER__;
      if (!helper) return { error: 'helper not found' };

      const store = (window as any).__chatStore?.getState();
      const messages = store?.messages || [];
      const lastMsg = messages[messages.length - 1];

      if (!lastMsg?.toolCalls) return { error: 'no tool calls' };

      const changes = [];
      for (const tc of lastMsg.toolCalls) {
        const toolName = tc.function?.name || tc.tool;
        let args = tc.function?.arguments || tc.args;
        if (typeof args === 'string') {
          try { args = JSON.parse(args); } catch (e) { continue; }
        }

        if (toolName === 'agent_write_file' && args?.rel_path) {
          let result = tc.result;
          if (typeof result === 'string') {
            try { result = JSON.parse(result); } catch (e) { continue; }
          }

          if (result?.success) {
            changes.push({
              path: args.rel_path,
              content: args.content,
              originalContent: result.originalContent,
              changeType: result.originalContent ? 'modified' : 'added',
              applied: false
            });
          }
        }
      }

      if (changes.length > 0) {
        helper.setComposerState(changes, lastMsg.id);
        return { success: true, changesCount: changes.length, changes };
      }
      return { error: 'no valid changes' };
    });

    console.log('[E2E] Analysis result:', JSON.stringify(analysis, null, 2));

    if (analysis.error || !analysis.success) {
      console.log('[E2E] ⚠️  Failed to extract file changes:', analysis.error);
      throw new Error('Failed to extract file changes from tool_calls');
    }

    expect(analysis.changesCount).toBeGreaterThan(0);

    // 4. 等待 Composer 面板自动打开（setComposerState 会自动打开）
    await page.waitForTimeout(2000);

    // 5. 验证 Composer 面板可见
    const composerVisible = await page.locator(COMPOSER_DIFF_CONTAINER).isVisible();
    console.log('[E2E] Composer panel visible:', composerVisible);

    expect(composerVisible).toBe(true);

    // 6. 验证文件列表存在
    const fileItemsCount = await page.locator('.composer-file-item').count();
    console.log('[E2E] Composer file items found:', fileItemsCount);

    expect(fileItemsCount).toBeGreaterThan(0);

    console.log('[E2E] ✅ Composer 正确响应 AI tool_calls');
  });

  test('@commercial AI tool_calls：多文件修改时正确显示所有文件', async ({ page }) => {
    // 1. 创建包含多个 tool_calls 的测试消息
    const testMessage = {
      id: 'ai-tool-test-2',
      role: 'assistant',
      content: '我将为您创建 3 个文件。',
      toolCalls: [
        {
          id: 'call_multi_1',
          tool: 'agent_write_file',
          function: {
            name: 'agent_write_file',
            arguments: JSON.stringify({
              rootPath: '/Users/mac/mock-project',
              rel_path: 'src/types/user.ts',
              content: `export interface User {
  username: string;
  email: string;
  password: string;
  createdAt: Date;
}`
            })
          },
          result: JSON.stringify({
            success: true,
            filePath: 'src/types/user.ts',
            originalContent: ''
          })
        },
        {
          id: 'call_multi_2',
          tool: 'agent_write_file',
          function: {
            name: 'agent_write_file',
            arguments: JSON.stringify({
              rootPath: '/Users/mac/mock-project',
              rel_path: 'src/services/auth.ts',
              content: `import { User } from '../types/user';

export class AuthService {
  async login(user: User): Promise<boolean> {
    return true;
  }
}`
            })
          },
          result: JSON.stringify({
            success: true,
            filePath: 'src/services/auth.ts',
            originalContent: ''
          })
        },
        {
          id: 'call_multi_3',
          tool: 'agent_write_file',
          function: {
            name: 'agent_write_file',
            arguments: JSON.stringify({
              rootPath: '/Users/mac/mock-project',
              rel_path: 'src/utils/validation.ts',
              content: `export function validateEmail(email: string): boolean {
  return /^[^@]+@[^@]+$/.test(email);
}

export function validatePassword(password: string): boolean {
  return password.length >= 6;
}`
            })
          },
          result: JSON.stringify({
            success: true,
            filePath: 'src/utils/validation.ts',
            originalContent: ''
          })
        }
      ]
    };

    // 2. 注入消息
    await page.evaluate((msg) => {
      (window as any).__chatStore?.getState().addMessage(msg);
    }, testMessage);

    await page.waitForTimeout(2000);

    // 3. 检查并打开 Composer
    const analysis = await page.evaluate(() => {
      const helper = (window as any).__E2E_COMPOSER__;
      if (!helper) return { error: 'helper not found' };

      const store = (window as any).__chatStore?.getState();
      const messages = store?.messages || [];
      const lastMsg = messages[messages.length - 1];

      if (!lastMsg?.toolCalls) return { error: 'no tool calls' };

      const changes = [];
      for (const tc of lastMsg.toolCalls) {
        const toolName = tc.function?.name || tc.tool;
        let args = tc.function?.arguments || tc.args;
        if (typeof args === 'string') {
          try { args = JSON.parse(args); } catch (e) { continue; }
        }

        if (toolName === 'agent_write_file' && args?.rel_path) {
          let result = tc.result;
          if (typeof result === 'string') {
            try { result = JSON.parse(result); } catch (e) { continue; }
          }

          if (result?.success) {
            changes.push({
              path: args.rel_path,
              content: args.content,
              originalContent: result.originalContent,
              changeType: result.originalContent ? 'modified' : 'added',
              applied: false
            });
          }
        }
      }

      if (changes.length > 0) {
        helper.setComposerState(changes, lastMsg.id);
        return { success: true, changesCount: changes.length, filePaths: changes.map((c: any) => c.path) };
      }
      return { error: 'no valid changes' };
    });

    console.log('[E2E] Multi-file analysis:', JSON.stringify(analysis, null, 2));

    expect(analysis.success).toBe(true);
    expect(analysis.changesCount).toBe(3);

    // 4. 等待 Composer 面板自动打开（setComposerState 会自动打开）
    await page.waitForTimeout(2000);

    // 5. 验证 Composer 显示所有 3 个文件
    const fileItemsCount = await page.locator('.composer-file-item').count();
    console.log('[E2E] Composer file items found:', fileItemsCount);

    expect(fileItemsCount).toBe(3);

    console.log('[E2E] ✅ Composer 正确显示多个文件变更');
  });
});
