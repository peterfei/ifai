/**
 * E2E 测试：还原重构后撤销功能失效的问题
 *
 * 问题描述：
 * 用户反馈重构 README 后，撤销功能没有了
 *
 * 场景：
 * 1. 打开一个文件
 * 2. 进行一次编辑（使用 Inline Edit 功能）
 * 3. 接受修改
 * 4. 尝试撤销操作
 * 5. 验证撤销功能是否正常工作
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

test.describe('Reproduction: Undo Functionality After Refactor', () => {

  test.beforeEach(async ({ page }) => {
    // 监听控制台日志
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[inlineEditStore]') || text.includes('[App]') || text.includes('[E2E]')) {
        console.log('[Browser Console]', text);
      }
    });

    await setupE2ETestEnvironment(page, {
      useRealAI: false, // 使用 Mock Inline Editor
    });

    await page.goto('/');
    await page.waitForTimeout(2000);

    // 等待 inlineEditStore 可用
    await page.waitForFunction(() => (window as any).__inlineEditStore !== undefined, { timeout: 15000 });
  });

  test('should restore undo functionality after inline edit', async ({ page }) => {
    console.log('[E2E] ========== Undo Functionality Test ==========');

    // 步骤 1: 检查 inlineEditStore 可用性
    const storeCheck = await page.evaluate(() => {
      return typeof (window as any).__inlineEditStore !== 'undefined';
    });

    if (!storeCheck) {
      test.skip(true, 'inlineEditStore not available');
      return;
    }

    console.log('[E2E] 步骤 2: 模拟完整的 Inline Edit 流程');

    // 步骤 2: 模拟完整的 Inline Edit 流程（不依赖编辑器）
    const testResult = await page.evaluate(() => {
      const inlineEditStore = (window as any).__inlineEditStore;

      // 原始内容
      const originalContent = `# Test File

This is the original content.

## Features
- Feature 1
- Feature 2
- Feature 3

## Usage
Original usage instructions.
`;

      // 修改后的内容
      const modifiedContent = `# Test File

This is the MODIFIED content.

## Features
- Feature 1
- Feature 2 (Updated)
- Feature 3
- Feature 4 (New)

## Usage
MODIFIED usage instructions with more details.
`;

      // 1. 显示 Diff Editor
      inlineEditStore.getState().showDiffEditor(
        originalContent,
        modifiedContent,
        '/test-undo-file.md',
        'Refactor content'
      );

      // 等待状态更新
      const state1 = inlineEditStore.getState();

      const afterShowDiff = {
        historyLength: state1.editHistory.length,
        historyIndex: state1.historyIndex,
        originalCode: state1.originalCode,
        modifiedCode: state1.modifiedCode,
        instruction: state1.instruction,
      };

      // 2. 接受修改
      let acceptEventTriggered = false;
      let acceptModifiedCode = '';
      const acceptListener = (e: any) => {
        acceptEventTriggered = true;
        acceptModifiedCode = e.detail.modifiedCode;
      };

      window.addEventListener('inline-edit-accept', acceptListener);
      inlineEditStore.getState().acceptDiff();
      window.removeEventListener('inline-edit-accept', acceptListener);

      const state2 = inlineEditStore.getState();

      const afterAccept = {
        historyLength: state2.editHistory.length,
        historyIndex: state2.historyIndex,
        acceptEventTriggered,
        acceptModifiedCode,
      };

      // 3. 测试撤销
      let undoEventTriggered = false;
      let undoCode = '';
      const undoListener = (e: any) => {
        undoEventTriggered = true;
        undoCode = e.detail.code;
      };

      window.addEventListener('inline-edit-undo', undoListener);
      inlineEditStore.getState().undo();
      window.removeEventListener('inline-edit-undo', undoListener);

      const state3 = inlineEditStore.getState();

      const afterUndo = {
        historyLength: state3.editHistory.length,
        historyIndex: state3.historyIndex,
        undoEventTriggered,
        undoCode,
      };

      // 4. 测试重做
      let redoEventTriggered = false;
      let redoCode = '';
      const redoListener = (e: any) => {
        redoEventTriggered = true;
        redoCode = e.detail.code;
      };

      window.addEventListener('inline-edit-redo', redoListener);
      inlineEditStore.getState().redo();
      window.removeEventListener('inline-edit-redo', redoListener);

      const state4 = inlineEditStore.getState();

      const afterRedo = {
        historyLength: state4.editHistory.length,
        historyIndex: state4.historyIndex,
        redoEventTriggered,
        redoCode,
      };

      return {
        afterShowDiff,
        afterAccept,
        afterUndo,
        afterRedo,
        originalContent,
        modifiedContent,
      };
    });

    console.log('[E2E] 测试结果:');
    console.log('[E2E]   显示 Diff Editor 后:', testResult.afterShowDiff);
    console.log('[E2E]   接受修改后:', testResult.afterAccept);
    console.log('[E2E]   撤销后:', testResult.afterUndo);
    console.log('[E2E]   重做后:', testResult.afterRedo);

    // 验证 Diff Editor 显示正确
    expect(testResult.afterShowDiff.historyLength).toBeGreaterThan(0);
    expect(testResult.afterShowDiff.originalCode).toBe(testResult.originalContent);
    expect(testResult.afterShowDiff.modifiedCode).toBe(testResult.modifiedContent);

    // 验证 acceptDiff 正常工作
    expect(testResult.afterAccept.acceptEventTriggered).toBe(true);

    // 验证撤销正常工作
    expect(testResult.afterUndo.undoEventTriggered).toBe(true);
    expect(testResult.afterUndo.undoCode).toBe(testResult.originalContent);
    expect(testResult.afterUndo.historyIndex).toBeLessThan(testResult.afterAccept.historyIndex);

    // 验证重做正常工作
    expect(testResult.afterRedo.redoEventTriggered).toBe(true);
    expect(testResult.afterRedo.redoCode).toBe(testResult.modifiedContent);
    expect(testResult.afterRedo.historyIndex).toBeGreaterThan(testResult.afterUndo.historyIndex);

    console.log('[E2E] ✅ 撤销/重做功能测试通过！');
  });

  test('should trigger undo event correctly', async ({ page }) => {
    console.log('[E2E] ========== Undo Event Trigger Test ==========');

    // 简化测试：只验证事件触发
    const eventTriggered = await page.evaluate(() => {
      let undoEventTriggered = false;
      let redoEventTriggered = false;

      // 添加事件监听器
      const undoListener = () => { undoEventTriggered = true; };
      const redoListener = () => { redoEventTriggered = true; };

      window.addEventListener('inline-edit-undo', undoListener);
      window.addEventListener('inline-edit-redo', redoListener);

      // 创建一些历史记录
      const inlineEditStore = (window as any).__inlineEditStore.getState();
      inlineEditStore.showDiffEditor(
        'original content',
        'modified content',
        '/test.md',
        'test instruction'
      );

      // 检查历史记录
      const beforeUndo = {
        historyLength: inlineEditStore.editHistory.length,
        historyIndex: inlineEditStore.historyIndex,
      };

      console.log('[E2E] 撤销前:', beforeUndo);

      // 执行撤销
      inlineEditStore.undo();

      const afterUndo = {
        historyLength: inlineEditStore.editHistory.length,
        historyIndex: inlineEditStore.historyIndex,
        undoTriggered: undoEventTriggered,
      };

      console.log('[E2E] 撤销后:', afterUndo);

      // 清理
      window.removeEventListener('inline-edit-undo', undoListener);
      window.removeEventListener('inline-edit-redo', redoListener);

      return afterUndo;
    });

    console.log('[E2E] 事件触发结果:', eventTriggered);
    expect(eventTriggered.undoTriggered).toBe(true);
  });
});
