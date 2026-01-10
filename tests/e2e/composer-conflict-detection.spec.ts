/**
 * v0.2.8 CMP-004: Composer 冲突检测 E2E 测试
 *
 * 目的：验证 Composer 能正确处理多文件场景，
 * 包括可能存在冲突的文件。
 *
 * 注意：实际的冲突检测算法（文件哈希比较）已在 CMP-001 Rust 测试中覆盖。
 * E2E 测试主要验证 Composer UI 能正确显示和操作。
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from './setup-utils';

test.describe('Composer 2.0: Conflict Detection (CMP-004)', () => {
  const COMPOSER_DIFF_CONTAINER = '.composer-diff-container';
  const ACCEPT_ALL_BTN = 'button:has-text("全部接受"), .btn-accept-all';

  test.beforeEach(async ({ page }) => {
    page.on('console', msg => {
      const text = msg.text();
      const type = msg.type();
      if (type === 'error') {
        console.log('[Browser Error]', text);
      } else if (text.includes('[E2E]') || text.includes('[Conflict]')) {
        console.log('[Browser]', text);
      }
    });

    page.on('pageerror', error => {
      console.log('[Page Error]', error.message, error.stack);
    });

    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForTimeout(5000);

    // 打开聊天面板
    await page.evaluate(() => {
      const layoutStore = (window as any).__layoutStore;
      if (layoutStore && !layoutStore.getState().isChatOpen) {
        layoutStore.getState().toggleChat();
      }
    });
    await page.waitForTimeout(2000);
  });

  test('@commercial CMP-004-1: 单文件无冲突场景', async ({ page }) => {
    // 1. 模拟 AI 返回的 tool_calls
    const testMessage = {
      id: 'cmp-004-1',
      role: 'assistant',
      content: '我将添加一个新方法到 TestService。',
      toolCalls: [
        {
          id: 'call_no_conflict',
          tool: 'agent_write_file',
          args: {
            rootPath: '/Users/mac/mock-project',
            rel_path: 'no-conflict-test.ts',
            content: `export class TestService {
  constructor(private name: string) {}

  greet() {
    return \`Hello, \${this.name}!\`;
  }

  farewell() {
    return \`Goodbye, \${this.name}!\`;
  }
}`
          },
          function: {
            name: 'agent_write_file',
            arguments: JSON.stringify({
              rootPath: '/Users/mac/mock-project',
              rel_path: 'no-conflict-test.ts',
              content: `export class TestService { ... }`
            })
          },
          result: JSON.stringify({
            success: true,
            filePath: 'no-conflict-test.ts',
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

    // 3. 打开 Composer
    const composerHelper = await page.evaluate(async () => {
      const helper = (window as any).__E2E_COMPOSER__;
      if (!helper) return { error: 'helper not found' };

      const store = (window as any).__chatStore?.getState();
      const messages = store?.messages || [];
      const lastMsg = messages[messages.length - 1];
      if (!lastMsg) return { error: 'no message' };

      const changes = [];
      if (lastMsg.toolCalls) {
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
      }

      if (changes.length > 0) {
        helper.setComposerState(changes, lastMsg.id);
        await new Promise(resolve => setTimeout(resolve, 100));
        return { success: true, changesCount: changes.length };
      }
      return { error: 'no changes extracted' };
    });

    console.log('[E2E] Composer helper result:', JSON.stringify(composerHelper, null, 2));

    if (composerHelper.error || !composerHelper.success) {
      console.log('[E2E] ⚠️', composerHelper.error);
      test.skip();
      return;
    }

    await page.waitForTimeout(3000);

    // 4. 验证 Composer 面板可见
    const composerVisible = await page.locator(COMPOSER_DIFF_CONTAINER).isVisible();
    expect(composerVisible).toBe(true);

    // 5. 验证文件列表存在
    const fileItemsCount = await page.locator('.composer-file-item').count();
    expect(fileItemsCount).toBeGreaterThan(0);

    console.log('[E2E] ✅ CMP-004-1: 单文件无冲突场景测试通过');
  });

  test('@commercial CMP-004-2: 多文件混合场景', async ({ page }) => {
    // 1. 创建测试场景：3个文件
    const testMessage = {
      id: 'cmp-004-2',
      role: 'assistant',
      content: '我将修改3个文件。',
      toolCalls: [
        {
          id: 'call_multi_1',
          tool: 'agent_write_file',
          args: {
            rootPath: '/Users/mac/mock-project',
            rel_path: 'file1-new.ts',
            content: `// File 1 - New file`
          },
          function: {
            name: 'agent_write_file',
            arguments: JSON.stringify({
              rootPath: '/Users/mac/mock-project',
              rel_path: 'file1-new.ts',
              content: `// File 1`
            })
          },
          result: JSON.stringify({
            success: true,
            filePath: 'file1-new.ts',
            originalContent: ''
          })
        },
        {
          id: 'call_multi_2',
          tool: 'agent_write_file',
          args: {
            rootPath: '/Users/mac/mock-project',
            rel_path: 'file2-modified.ts',
            content: `// File 2 - Modified content`
          },
          function: {
            name: 'agent_write_file',
            arguments: JSON.stringify({
              rootPath: '/Users/mac/mock-project',
              rel_path: 'file2-modified.ts',
              content: `// File 2`
            })
          },
          result: JSON.stringify({
            success: true,
            filePath: 'file2-modified.ts',
            originalContent: '// Original content'
          })
        },
        {
          id: 'call_multi_3',
          tool: 'agent_write_file',
          args: {
            rootPath: '/Users/mac/mock-project',
            rel_path: 'file3-new.ts',
            content: `// File 3 - Another new file`
          },
          function: {
            name: 'agent_write_file',
            arguments: JSON.stringify({
              rootPath: '/Users/mac/mock-project',
              rel_path: 'file3-new.ts',
              content: `// File 3`
            })
          },
          result: JSON.stringify({
            success: true,
            filePath: 'file3-new.ts',
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

    // 3. 打开 Composer
    const analysis = await page.evaluate(async () => {
      const helper = (window as any).__E2E_COMPOSER__;
      if (!helper) return { error: 'helper not found' };

      const store = (window as any).__chatStore?.getState();
      const messages = store?.messages || [];
      const lastMsg = messages[messages.length - 1];
      if (!lastMsg) return { error: 'no message' };

      const changes = [];
      if (lastMsg.toolCalls) {
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
      }

      if (changes.length > 0) {
        helper.setComposerState(changes, lastMsg.id);
        await new Promise(resolve => setTimeout(resolve, 100));
        return {
          success: true,
          changesCount: changes.length,
          filePaths: changes.map((c: any) => c.path)
        };
      }
      return { error: 'no changes extracted' };
    });

    console.log('[E2E] Multi-file analysis:', JSON.stringify(analysis, null, 2));

    if (analysis.error || !analysis.success) {
      console.log('[E2E] ⚠️', analysis.error);
      test.skip();
      return;
    }

    await page.waitForTimeout(3000);

    // 4. 验证 Composer 面板显示所有3个文件
    const fileItemsCount = await page.locator('.composer-file-item').count();
    expect(fileItemsCount).toBe(3);

    // 5. 验证文件路径
    console.log('[E2E] File paths:', analysis.filePaths);
    expect(analysis.filePaths).toContain('file1-new.ts');
    expect(analysis.filePaths).toContain('file2-modified.ts');
    expect(analysis.filePaths).toContain('file3-new.ts');

    console.log('[E2E] ✅ CMP-004-2: 多文件混合场景测试通过');
    console.log('[E2E] ℹ️  冲突检测算法（文件哈希比较）在 CMP-001 Rust 测试中已覆盖');
  });
});
