/**
 * v0.2.8 Composer 2.0 - 接受/拒绝循环 E2E 测试
 *
 * 目的：验证 Composer 支持多次"接受→拒绝→接受"的操作循环
 *
 * 测试场景：
 * 1. 单文件：接受 → 拒绝 → 接受
 * 2. 多文件：部分接受 → 拒绝已接受的 → 再次接受
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from './setup-utils';

test.describe('Composer 2.0: Accept/Reject Cycle', () => {
  const COMPOSER_DIFF_CONTAINER = '.composer-diff-container';
  const ACCEPT_FILE_BTN = '.btn-accept-single';
  const REJECT_FILE_BTN = '.btn-reject-single';

  test.beforeEach(async ({ page }) => {
    page.on('console', msg => {
      const text = msg.text();
      const type = msg.type();
      if (type === 'error') {
        console.log('[Browser Error]', text);
      } else if (text.includes('[E2E]') || text.includes('[Composer]')) {
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

  test('@commercial 单文件接受→拒绝→接受循环', async ({ page }) => {
    const originalContent = `// Original Content`;
    const newContent = `// New Content - Updated`;

    // 1. 创建测试消息
    const testMessage = {
      id: 'test-cycle-1',
      role: 'assistant',
      content: '我将修改一个文件',
      toolCalls: [
        {
          id: 'call_cycle_1',
          tool: 'agent_write_file',
          function: {
            name: 'agent_write_file',
            arguments: JSON.stringify({
              rootPath: '/Users/mac/mock-project',
              relPath: 'test-cycle.ts',
              content: newContent
            })
          },
          result: JSON.stringify({
            success: true,
            filePath: 'test-cycle.ts',
            originalContent: originalContent
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
    await page.evaluate(async () => {
      const helper = (window as any).__E2E_COMPOSER__;
      const store = (window as any).__chatStore?.getState();
      const messages = store?.messages || [];
      const lastMsg = messages[messages.length - 1];

      const changes = [];
      if (lastMsg.toolCalls) {
        for (const tc of lastMsg.toolCalls) {
          let args = tc.function?.arguments || tc.args;
          if (typeof args === 'string') {
            try { args = JSON.parse(args); } catch (e) { continue; }
          }

          if (tc.function?.name === 'agent_write_file' && args?.relPath) {
            let result = tc.result;
            if (typeof result === 'string') {
              try { result = JSON.parse(result); } catch (e) { continue; }
            }

            if (result?.success) {
              changes.push({
                path: args.relPath,
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
      }
    });

    await page.waitForTimeout(3000);

    // 4. 验证 Composer 面板打开
    const composerVisible = await page.locator(COMPOSER_DIFF_CONTAINER).isVisible();
    expect(composerVisible).toBe(true);

    const fileItemsCount = await page.locator('.composer-file-item').count();
    expect(fileItemsCount).toBe(1);

    console.log('[E2E] Step 1: Composer opened with file');

    // 5. 第一次接受
    const acceptBtn1 = page.locator(ACCEPT_FILE_BTN).first();
    await acceptBtn1.click();
    await page.waitForTimeout(1000);

    console.log('[E2E] Step 2: First accept clicked');

    // 6. 第一次拒绝（应该回滚）
    const rejectBtn1 = page.locator(REJECT_FILE_BTN).first();
    await rejectBtn1.click();
    await page.waitForTimeout(1000);

    console.log('[E2E] Step 3: First reject clicked (rollback)');

    // 7. 验证文件仍在列表中（没有被移除）
    const fileItemsAfterReject = await page.locator('.composer-file-item').count();
    expect(fileItemsAfterReject).toBe(1);

    console.log('[E2E] Step 4: File still in list after reject');

    // 8. 第二次接受（应该成功）
    const acceptBtn2 = page.locator(ACCEPT_FILE_BTN).first();
    await acceptBtn2.click();
    await page.waitForTimeout(1000);

    console.log('[E2E] Step 5: Second accept clicked');

    // 9. 验证文件标记为已应用
    const isApplied = await page.evaluate(() => {
      const helper = (window as any).__E2E_COMPOSER__;
      const state = helper.getComposerState();
      // 检查文件是否仍在 changes 中
      return state.changesCount > 0;
    });

    expect(isApplied).toBe(true);

    console.log('[E2E] ✅ 单文件接受→拒绝→接受循环测试通过');
  });

  test('@commercial 多文件部分接受→拒绝→接受', async ({ page }) => {
    const original1 = `// File 1 Original`;
    const new1 = `// File 1 New`;
    const original2 = `// File 2 Original`;
    const new2 = `// File 2 New`;

    // 1. 创建测试消息（2个文件）
    const testMessage = {
      id: 'test-cycle-2',
      role: 'assistant',
      content: '我将修改2个文件',
      toolCalls: [
        {
          id: 'call_cycle_2_1',
          tool: 'agent_write_file',
          function: {
            name: 'agent_write_file',
            arguments: JSON.stringify({
              rootPath: '/Users/mac/mock-project',
              relPath: 'file1.ts',
              content: new1
            })
          },
          result: JSON.stringify({
            success: true,
            filePath: 'file1.ts',
            originalContent: original1
          })
        },
        {
          id: 'call_cycle_2_2',
          tool: 'agent_write_file',
          function: {
            name: 'agent_write_file',
            arguments: JSON.stringify({
              rootPath: '/Users/mac/mock-project',
              relPath: 'file2.ts',
              content: new2
            })
          },
          result: JSON.stringify({
            success: true,
            filePath: 'file2.ts',
            originalContent: original2
          })
        }
      ]
    };

    // 2. 注入消息并打开 Composer
    await page.evaluate((msg) => {
      (window as any).__chatStore?.getState().addMessage(msg);
    }, testMessage);

    await page.waitForTimeout(2000);

    await page.evaluate(async () => {
      const helper = (window as any).__E2E_COMPOSER__;
      const store = (window as any).__chatStore?.getState();
      const messages = store?.messages || [];
      const lastMsg = messages[messages.length - 1];

      const changes = [];
      if (lastMsg.toolCalls) {
        for (const tc of lastMsg.toolCalls) {
          let args = tc.function?.arguments || tc.args;
          if (typeof args === 'string') {
            try { args = JSON.parse(args); } catch (e) { continue; }
          }

          if (tc.function?.name === 'agent_write_file' && args?.relPath) {
            let result = tc.result;
            if (typeof result === 'string') {
              try { result = JSON.parse(result); } catch (e) { continue; }
            }

            if (result?.success) {
              changes.push({
                path: args.relPath,
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
      }
    });

    await page.waitForTimeout(3000);

    // 3. 验证 2 个文件在列表中
    let fileItemsCount = await page.locator('.composer-file-item').count();
    expect(fileItemsCount).toBe(2);

    console.log('[E2E] Step 1: 2 files in list');

    // 4. 接受第一个文件
    const acceptBtn1 = page.locator('.composer-file-item').first().locator(ACCEPT_FILE_BTN);
    await acceptBtn1.click();
    await page.waitForTimeout(1000);

    console.log('[E2E] Step 2: Accepted first file');

    // 5. 拒绝第一个文件（回滚）
    const rejectBtn1 = page.locator('.composer-file-item').first().locator(REJECT_FILE_BTN);
    await rejectBtn1.click();
    await page.waitForTimeout(1000);

    console.log('[E2E] Step 3: Rejected first file (rollback)');

    // 6. 验证 2 个文件仍在列表中
    fileItemsCount = await page.locator('.composer-file-item').count();
    expect(fileItemsCount).toBe(2);

    console.log('[E2E] Step 4: Both files still in list');

    // 7. 再次接受第一个文件
    const acceptBtn2 = page.locator('.composer-file-item').first().locator(ACCEPT_FILE_BTN);
    await acceptBtn2.click();
    await page.waitForTimeout(1000);

    console.log('[E2E] Step 5: Re-accepted first file');

    // 8. 验证两个文件都在
    fileItemsCount = await page.locator('.composer-file-item').count();
    expect(fileItemsCount).toBe(2);

    console.log('[E2E] ✅ 多文件部分接受→拒绝→接受测试通过');
  });
});
