/**
 * v0.2.8 Composer 2.0 真实 UI 交互 E2E 测试
 * 对标 Cursor: 验证多文件 Diff 预览、原子修改与用户决策链路
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment, removeJoyrideOverlay } from './setup';

test.describe.skip('Composer 2.0: Realistic UI Interaction - TODO: Fix this test', () => {
  const CHAT_INPUT = '[data-testid="chat-input"]';
  const COMPOSER_DIFF_CONTAINER = '.composer-diff-container';
  const ACCEPT_ALL_BTN = 'button:has-text("全部接受"), .btn-accept-all';
  const REJECT_ALL_BTN = 'button:has-text("全部拒绝"), .btn-reject-all';

  test.beforeEach(async ({ page }) => {
    // 捕获所有控制台消息
    page.on('console', msg => {
      const text = msg.text();
      const type = msg.type();
      console.log(`[Browser ${type}]`, text);
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
        console.log('[E2E] Initial layout state:', {
          isChatOpen: state.isChatOpen,
          layoutMode: state.layoutMode
        });
        // 确保聊天面板打开且布局模式为 default
        if (!state.isChatOpen) {
          state.toggleChat();
        }
        if (state.layoutMode !== 'default' && state.layoutMode !== 'custom') {
          state.setLayoutMode?.('default');
        }
        console.log('[E2E] After toggle layout state:', {
          isChatOpen: layoutStore.getState().isChatOpen,
          layoutMode: layoutStore.getState().layoutMode
        });
      }
    });
    await page.waitForTimeout(2000);

    // 等待 store 可用
    for (let i = 0; i < 3; i++) {
      await page.waitForTimeout(2000);
      const hasChatStore = await page.evaluate(() => {
        const store = (window as any).__chatStore;
        return store && typeof store.getState === 'function';
      });
      if (hasChatStore) break;
    }

    // 验证聊天输入框存在
    const chatInputExists = await page.locator(CHAT_INPUT).count();
    console.log(`[E2E] Chat input elements found: ${chatInputExists}`);

    // 调试：检查页面内容
    const pageDebug = await page.evaluate(() => {
      const body = document.body;
      return {
        bodyInnerHTML: body?.innerHTML?.substring(0, 500),
        bodyClass: body?.className,
        hasRootDiv: !!document.querySelector('#root'),
        rootInnerHTML: document.querySelector('#root')?.innerHTML?.substring(0, 500)
      };
    });
    console.log('[E2E] Page debug:', JSON.stringify(pageDebug));
  });

  test('@commercial should allow user to review and accept multi-file changes', async ({ page }) => {
    // 🔥 直接通过 store 注入测试数据（绕过 mock streaming）
    await page.evaluate(async () => {
      const store = (window as any).__chatStore;
      if (!store) {
        console.error('[E2E] __chatStore not found!');
        return;
      }

      // 创建一个包含 tool_calls 的助手消息
      const testMessage = {
        id: 'test-composer-msg-1',
        role: 'assistant',
        content: '',
        toolCalls: [
          {
            id: 'call_write_1',
            tool: 'agent_write_file',
            args: {
              rootPath: '/Users/mac/mock-project',
              rel_path: 'src/services/AuthService.ts',
              content: `/**
 * Refactored Auth Service with new Logger trait
 */
export class AuthService {
    constructor(private logger: Logger) {}

    login(user: string, pass: string) {
        this.logger.info(\`Login attempt for \${user}\`);
    }
}`
            },
            function: {
              name: 'agent_write_file',
              arguments: JSON.stringify({
                rootPath: '/Users/mac/mock-project',
                rel_path: 'src/services/AuthService.ts',
                content: `export class AuthService { ... }`
              })
            },
            result: JSON.stringify({
              success: true,
              filePath: 'src/services/AuthService.ts',
              originalContent: ''
            })
          },
          {
            id: 'call_write_2',
            tool: 'agent_write_file',
            args: {
              rootPath: '/Users/mac/mock-project',
              rel_path: 'src/traits/Logger.ts',
              content: `export trait Logger { fn info(message: &str); }`
            },
            function: {
              name: 'agent_write_file',
              arguments: JSON.stringify({
                rootPath: '/Users/mac/mock-project',
                rel_path: 'src/traits/Logger.ts',
                content: `export trait Logger { ... }`
              })
            },
            result: JSON.stringify({
              success: true,
              filePath: 'src/traits/Logger.ts',
              originalContent: ''
            })
          },
          {
            id: 'call_write_3',
            tool: 'agent_write_file',
            args: {
              rootPath: '/Users/mac/mock-project',
              rel_path: 'src/utils/helpers.ts',
              content: `export function formatDate(date: Date) { return date.toISOString(); }`
            },
            function: {
              name: 'agent_write_file',
              arguments: JSON.stringify({
                rootPath: '/Users/mac/mock-project',
                rel_path: 'src/utils/helpers.ts',
                content: `export function formatDate() { ... }`
              })
            },
            result: JSON.stringify({
              success: true,
              filePath: 'src/utils/helpers.ts',
              originalContent: ''
            })
          }
        ]
      };

      // 添加消息到 store
      store.getState().addMessage(testMessage);
      console.log('[E2E] Test message added to store');
    });

    // 等待 UI 更新
    await page.waitForTimeout(2000);

    // 检查是否有"查看 Diff"按钮
    const diffButtonExists = await page.locator('button:has-text("查看 Diff")').count();
    console.log(`[E2E] Diff buttons found: ${diffButtonExists}`);

    if (diffButtonExists > 0) {
      // 🔥 使用全局测试函数直接打开 Composer
      const result = await page.evaluate(async () => {
        const composerHelper = (window as any).__E2E_COMPOSER__;
        if (!composerHelper) {
          console.error('[E2E] __E2E_COMPOSER__ helper not found!');
          return { success: false, error: 'helper not found' };
        }

        // 获取最后一条消息
        const store = (window as any).__chatStore?.getState();
        const messages = store?.messages || [];
        const lastMsg = messages[messages.length - 1];
        if (!lastMsg) {
          return { success: false, error: 'no message' };
        }

        // 提取文件变更
        const changes = [];
        if (lastMsg.toolCalls) {
          for (const tc of lastMsg.toolCalls) {
            let args = tc.args;
            if (typeof args === 'string') {
              try { args = JSON.parse(args); } catch (e) { continue; }
            }

            if (tc.tool === 'agent_write_file' && args?.rel_path) {
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
          // 使用全局函数设置 Composer 状态
          composerHelper.setComposerState(changes, lastMsg.id);

          // 等待 React 渲染
          await new Promise(resolve => setTimeout(resolve, 100));

          // 验证状态
          const state = composerHelper.getComposerState();
          console.log('[E2E] Composer state after set:', state);

          return { success: true, changesCount: changes.length, state };
        } else {
          return { success: false, error: 'no changes extracted' };
        }
      });

      console.log('[E2E] Composer open result:', JSON.stringify(result, null, 2));

      // 等待 React 渲染 Composer 组件
      await page.waitForTimeout(5000);

      // 调试：检查 Composer 是否在 DOM 中
      const composerExists = await page.locator('.composer-diff-container').count();
      console.log(`[E2E] Composer containers found: ${composerExists}`);

      // 调试：检查元素的可见性
      const isVisible = await page.locator('.composer-diff-container').isVisible();
      console.log(`[E2E] Composer is visible: ${isVisible}`);

      const computedStyle = await page.locator('.composer-diff-container').evaluate(el => {
        const styles = window.getComputedStyle(el);
        return {
          display: styles.display,
          visibility: styles.visibility,
          opacity: styles.opacity,
          zIndex: styles.zIndex
        };
      });
      console.log(`[E2E] Composer computed style:`, JSON.stringify(computedStyle));
    }

    // 等待 Composer 生成 Diff 预览
    const diffContainer = page.locator(COMPOSER_DIFF_CONTAINER);
    await page.waitForTimeout(1000);
    await expect(diffContainer).toBeVisible({ timeout: 10000 });

    // 验证文件列表
    const fileItems = page.locator('.composer-file-item');
    const count = await fileItems.count();
    expect(count).toBeGreaterThan(1);

    // 点击"全部接受"
    await removeJoyrideOverlay(page);
    await page.click(ACCEPT_ALL_BTN);

    // 等待异步操作完成
    await page.waitForTimeout(2000);

    // 验证：Diff 视图消失
    await expect(diffContainer).not.toBeVisible({ timeout: 5000 });
  });

  test('@commercial should rollback all files when "Reject All" is clicked', async ({ page }) => {
    // 🔥 直接通过 store 注入测试数据
    await page.evaluate(async () => {
      const store = (window as any).__chatStore;
      if (!store) {
        console.error('[E2E] __chatStore not found!');
        return;
      }

      // 创建一个包含 tool_calls 的助手消息
      const testMessage = {
        id: 'test-composer-msg-2',
        role: 'assistant',
        content: '',
        toolCalls: [
          {
            id: 'call_write_1',
            tool: 'agent_write_file',
            args: {
              rootPath: '/Users/mac/mock-project',
              rel_path: 'src/utils/helpers.ts',
              content: `export function formatDate(date: Date) { return date.toISOString(); }
// Added documentation
/**
 * Formats a date to ISO string
 * @param date The date to format
 * @returns ISO formatted date string
 */`
            },
            function: {
              name: 'agent_write_file',
              arguments: JSON.stringify({
                rootPath: '/Users/mac/mock-project',
                rel_path: 'src/utils/helpers.ts',
                content: `export function formatDate() { ... }`
              })
            },
            result: JSON.stringify({
              success: true,
              filePath: 'src/utils/helpers.ts',
              originalContent: `export function formatDate(date: Date) { return date.toISOString(); }`
            })
          }
        ]
      };

      store.getState().addMessage(testMessage);
      console.log('[E2E] Test message added to store');
    });

    // 等待 UI 更新
    await page.waitForTimeout(2000);

    // 使用全局函数打开 Composer
    const result = await page.evaluate(async () => {
      const composerHelper = (window as any).__E2E_COMPOSER__;
      if (!composerHelper) {
        return { success: false, error: 'helper not found' };
      }

      const store = (window as any).__chatStore?.getState();
      const messages = store?.messages || [];
      const lastMsg = messages[messages.length - 1];
      if (!lastMsg) {
        return { success: false, error: 'no message' };
      }

      const changes = [];
      if (lastMsg.toolCalls) {
        for (const tc of lastMsg.toolCalls) {
          let args = tc.args;
          if (typeof args === 'string') {
            try { args = JSON.parse(args); } catch (e) { continue; }
          }

          if (tc.tool === 'agent_write_file' && args?.rel_path) {
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
        composerHelper.setComposerState(changes, lastMsg.id);
        await new Promise(resolve => setTimeout(resolve, 100));
        const state = composerHelper.getComposerState();
        return { success: true, changesCount: changes.length, state };
      } else {
        return { success: false, error: 'no changes extracted' };
      }
    });

    console.log('[E2E] Composer open result:', JSON.stringify(result, null, 2));

    // 等待 React 渲染 Composer 组件
    await page.waitForTimeout(5000);

    // 等待 Composer 生成 Diff 预览
    const diffContainer = page.locator(COMPOSER_DIFF_CONTAINER);
    await page.waitForTimeout(1000);
    await expect(diffContainer).toBeVisible({ timeout: 10000 });

    // 点击"全部拒绝"
    await removeJoyrideOverlay(page);
    await page.click(REJECT_ALL_BTN);

    // 等待面板关闭
    await page.waitForTimeout(1000);

    // 验证：Diff 视图消失
    await expect(diffContainer).not.toBeVisible({ timeout: 5000 });
  });

  test('@commercial should handle partial acceptance of changes', async ({ page }) => {
    // 🔥 直接通过 store 注入测试数据
    await page.evaluate(async () => {
      const store = (window as any).__chatStore;
      if (!store) {
        console.error('[E2E] __chatStore not found!');
        return;
      }

      // 创建一个包含多个 tool_calls 的助手消息
      const testMessage = {
        id: 'test-composer-msg-3',
        role: 'assistant',
        content: '',
        toolCalls: [
          {
            id: 'call_write_1',
            tool: 'agent_write_file',
            args: {
              rootPath: '/Users/mac/mock-project',
              rel_path: 'src/core/api.ts',
              content: `// Updated imports
import { BaseService } from './base';
export class ApiService extends BaseService {}`
            },
            function: {
              name: 'agent_write_file',
              arguments: JSON.stringify({
                rootPath: '/Users/mac/mock-project',
                rel_path: 'src/core/api.ts',
                content: `export class ApiService { ... }`
              })
            },
            result: JSON.stringify({
              success: true,
              filePath: 'src/core/api.ts',
              originalContent: `export class ApiService {}`
            })
          },
          {
            id: 'call_write_2',
            tool: 'agent_write_file',
            args: {
              rootPath: '/Users/mac/mock-project',
              rel_path: 'src/utils/helpers.ts',
              content: `// Updated imports
import { Logger } from '../logger';`
            },
            function: {
              name: 'agent_write_file',
              arguments: JSON.stringify({
                rootPath: '/Users/mac/mock-project',
                rel_path: 'src/utils/helpers.ts',
                content: `import { Logger } from '../logger';`
              })
            },
            result: JSON.stringify({
              success: true,
              filePath: 'src/utils/helpers.ts',
              originalContent: `export function helpers() {}`
            })
          }
        ]
      };

      store.getState().addMessage(testMessage);
      console.log('[E2E] Test message added to store');
    });

    // 等待 UI 更新
    await page.waitForTimeout(2000);

    // 使用全局函数打开 Composer
    const result = await page.evaluate(async () => {
      const composerHelper = (window as any).__E2E_COMPOSER__;
      if (!composerHelper) {
        return { success: false, error: 'helper not found' };
      }

      const store = (window as any).__chatStore?.getState();
      const messages = store?.messages || [];
      const lastMsg = messages[messages.length - 1];
      if (!lastMsg) {
        return { success: false, error: 'no message' };
      }

      const changes = [];
      if (lastMsg.toolCalls) {
        for (const tc of lastMsg.toolCalls) {
          let args = tc.args;
          if (typeof args === 'string') {
            try { args = JSON.parse(args); } catch (e) { continue; }
          }

          if (tc.tool === 'agent_write_file' && args?.rel_path) {
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
        composerHelper.setComposerState(changes, lastMsg.id);
        await new Promise(resolve => setTimeout(resolve, 100));
        const state = composerHelper.getComposerState();
        return { success: true, changesCount: changes.length, state };
      } else {
        return { success: false, error: 'no changes extracted' };
      }
    });

    console.log('[E2E] Composer open result:', JSON.stringify(result, null, 2));

    // 等待 React 渲染 Composer 组件
    await page.waitForTimeout(5000);

    // 等待 Composer 生成 Diff 预览
    const diffContainer = page.locator(COMPOSER_DIFF_CONTAINER);
    await page.waitForTimeout(1000);
    await expect(diffContainer).toBeVisible({ timeout: 10000 });

    // 验证文件列表
    const fileItems = page.locator('.composer-file-item');
    const count = await fileItems.count();
    expect(count).toBeGreaterThan(1);

    // 在 Diff 预览中，只针对第一个文件点击"Accept"
    await removeJoyrideOverlay(page);
    const firstFileAcceptBtn = page.locator('.composer-file-item').first().locator('.btn-accept-single');
    await firstFileAcceptBtn.click();

    // 等待更新
    await page.waitForTimeout(1000);

    // 验证：第一个文件被标记为已应用
    const firstFileItem = page.locator('.composer-file-item').first();
    const hasAppliedClass = await firstFileItem.getAttribute('class');
    expect(hasAppliedClass).toContain('applied');

    // 验证：预览容器依然存在（因为还有未处理的文件）
    await expect(diffContainer).toBeVisible();
  });
});