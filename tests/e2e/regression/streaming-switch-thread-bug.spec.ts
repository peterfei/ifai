/**
 * 高保真 E2E 测试：流式输出中切换对话导致输出中断
 *
 * Bug 场景还原：
 * 1. 用户新开对话，发送消息 "你了解这个项目吗？"
 * 2. LLM 开始流式输出（isLoading=true, [data-role="assistant"] 出现）
 * 3. 用户在 LLM 输出过程中切换到历史对话
 * 4. 切换回新对话，内容不再继续输出（流式被中断）
 *
 * 环境要求：
 * - 需要 .env.e2e.local 文件配置真实 API Key
 */

import { test, expect } from '@playwright/test';
import {
  setupE2ETestEnvironment,
  setupMockFileSystem,
  getRealAIConfig
} from '../setup-utils';

test.describe('Regression: Streaming interrupted by thread switch', () => {
  test.setTimeout(240000);

  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page, { skipWelcome: true });
    await page.goto('/');

    await page.waitForFunction(() =>
      (window as any).__chatStore !== undefined,
      { timeout: 30000 }
    );

    // 切换到对话模式
    await page.evaluate(() => {
      const layoutStore = (window as any).__layoutStore;
      if (layoutStore.getState().guiMode !== 'conversation') {
        layoutStore.getState().setGuiMode('conversation');
      }
    });

    await setupMockFileSystem(page, {
      'src/main.ts': 'console.log("Hello");',
      'README.md': '# Test Project',
      'package.json': '{"name": "ifai-test"}',
    });

    await page.locator('textarea, [contenteditable="true"]').first().waitFor({
      state: 'visible',
      timeout: 30000
    });
  });

  test('REGRESS-1: 流式输出中切换对话导致内容丢失（高保真还原）', async ({ page }) => {
    const config = await getRealAIConfig(page);
    console.log('[REGRESS-1] AI 配置:', JSON.stringify(config));

    // =============================================
    // Step 1: 创建历史对话和新对话
    // =============================================
    const { historyThreadId, newThreadId } = await page.evaluate(() => {
      const ts = (window as any).__threadStore.getState();
      return {
        historyThreadId: ts.createThread({ title: '历史对话' }),
        newThreadId: ts.createThread({ title: '流式测试' }),
      };
    });
    console.log('[REGRESS-1] 历史对话:', historyThreadId, '新对话:', newThreadId);

    // 激活新对话
    await page.evaluate((id) => {
      (window as any).__threadStore.getState().switchThread(id);
    }, newThreadId);
    await page.waitForTimeout(300);

    // =============================================
    // Step 2: 通过 UI 发送真实消息触发流式输出
    // =============================================
    const testMessage = '请用 200 字左右详细介绍你自己';
    const inputBox = page.locator('textarea, [contenteditable="true"]').first();
    await inputBox.fill(testMessage);
    await inputBox.press('Enter');

    console.log('[REGRESS-1] 消息已发送，等待用户消息出现...');

    // 等待用户消息出现在 DOM 上
    const userMsg = page.locator('[data-role="user"]').filter({ hasText: testMessage }).first();
    await expect(userMsg).toBeVisible({ timeout: 15000 });
    console.log('[REGRESS-1] ✅ 用户消息已显示');

    // 等待 assistant 消息容器出现（标志流式输出已开始）
    const assistantMsg = page.locator('[data-role="assistant"]').first();
    await expect(assistantMsg).toBeVisible({ timeout: 60000 });
    console.log('[REGRESS-1] ✅ Assistant 消息已出现，流式输出进行中');

    // 等待积累一些内容
    await page.waitForTimeout(3000);

    // 记录切换前内容
    const contentBeforeSwitch = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      const msgs = chatStore?.getState()?.messages || [];
      const am = msgs.find((m: any) => m.role === 'assistant');
      return { length: am?.content?.length || 0, isLoading: chatStore?.getState()?.isLoading };
    });
    console.log('[REGRESS-1] 切换前内容长度:', contentBeforeSwitch.length, 'isLoading:', contentBeforeSwitch.isLoading);

    // =============================================
    // Step 3: 流式输出中切换到历史对话
    // =============================================
    console.log('[REGRESS-1] ⚡ 切换到历史对话...');
    await page.evaluate((id) => {
      (window as any).__threadStore.getState().switchThread(id);
    }, historyThreadId);
    await page.waitForTimeout(500);

    const stateAfterSwitch = await page.evaluate(() => {
      const cs = (window as any).__chatStore.getState();
      return { isLoading: cs.isLoading, msgCount: cs.messages.length };
    });
    console.log('[REGRESS-1] 切换后 isLoading:', stateAfterSwitch.isLoading, '消息数:', stateAfterSwitch.msgCount);

    // =============================================
    // Step 4: 切换回新对话
    // =============================================
    await page.evaluate((id) => {
      (window as any).__threadStore.getState().switchThread(id);
    }, newThreadId);
    await page.waitForTimeout(1000);

    // =============================================
    // Step 5: 等待过程并检测内容是否停滞
    // =============================================
    // 等 15 秒让后端有充足时间继续发送
    await page.waitForTimeout(15000);

    const stateAfterReturn = await page.evaluate(() => {
      const cs = (window as any).__chatStore.getState();
      const msgs = cs.messages || [];
      const am = msgs.find((m: any) => m.role === 'assistant');
      return {
        isLoading: cs.isLoading,
        assistantContentLength: am?.content?.length || 0,
        messagesCount: msgs.length,
      };
    });

    console.log('[REGRESS-1] 切换回后状态:', JSON.stringify(stateAfterReturn));
    console.log(`[REGRESS-1] 内容: 切换前=${contentBeforeSwitch.length} → 最终=${stateAfterReturn.assistantContentLength}`);

    // 🐛 Bug 检测：内容是否停止增长
    const stoppedGrowing = stateAfterReturn.assistantContentLength <= contentBeforeSwitch.length + 10;
    const isLoadingCleared = !stateAfterReturn.isLoading;
    const bugReproduced = stoppedGrowing && isLoadingCleared;

    console.log(`[REGRESS-1] ${bugReproduced ? '🐛 BUG 确认: 流式输出已中断' : '✅ 内容继续增长'}`);
    console.log(`   内容增长: ${stateAfterReturn.assistantContentLength - contentBeforeSwitch.length} 字符`);
    console.log(`   原因: isLoading=${!isLoadingCleared ? 'true(正常)' : 'false(被清空)'}, 内容${stoppedGrowing ? '停滞' : '增长'}`);

    // 记录结果供修复后验证
    await page.evaluate((result) => {
      (window as any).__REGRESSION_RESULT__ = result;
    }, {
      bug: 'streaming-interrupted-by-thread-switch',
      contentBeforeSwitch: contentBeforeSwitch.length,
      finalContentLength: stateAfterReturn.assistantContentLength,
      isLoading: stateAfterReturn.isLoading,
      reproduced: bugReproduced,
      timestamp: Date.now(),
    });
  });

  test('REGRESS-2: 切换时已输出流式内容应保存', async ({ page }) => {
    const config = await getRealAIConfig(page);

    // 创建历史对话和新对话
    const { historyThreadId, newThreadId } = await page.evaluate(() => {
      const ts = (window as any).__threadStore.getState();
      return {
        historyThreadId: ts.createThread({ title: '历史对话' }),
        newThreadId: ts.createThread({ title: '流式测试' }),
      };
    });

    // 激活新对话
    await page.evaluate((id) => {
      (window as any).__threadStore.getState().switchThread(id);
    }, newThreadId);
    await page.waitForTimeout(300);

    // 通过 UI 发送消息
    const inputBox = page.locator('textarea, [contenteditable="true"]').first();
    await inputBox.fill('你好');
    await inputBox.press('Enter');

    // 等待助理消息出现
    const assistantMsg = page.locator('[data-role="assistant"]').first();
    await expect(assistantMsg).toBeVisible({ timeout: 60000 });

    // 积累内容
    await page.waitForTimeout(2000);

    const contentBefore = await page.evaluate(() => {
      const msgs = (window as any).__chatStore.getState().messages || [];
      const am = msgs.find((m: any) => m.role === 'assistant');
      return am?.content || '';
    });
    console.log('[REGRESS-2] 切换前内容长度:', contentBefore.length);

    // 切换到历史对话
    await page.evaluate((id) => {
      (window as any).__threadStore.getState().switchThread(id);
    }, historyThreadId);

    // 等待后端继续发送（可能在历史对话期间完成）
    await page.waitForTimeout(15000);

    // 切换回新对话
    await page.evaluate((id) => {
      (window as any).__threadStore.getState().switchThread(id);
    }, newThreadId);
    await page.waitForTimeout(1000);

    const contentAfter = await page.evaluate(() => {
      const msgs = (window as any).__chatStore.getState().messages || [];
      const am = msgs.find((m: any) => m.role === 'assistant');
      return am?.content || '';
    });

    console.log('[REGRESS-2] 切换后内容长度:', contentAfter.length);
    // 已输出的内容应保留（当前 bug 可能导致丢失）
    expect(contentAfter.length).toBeGreaterThanOrEqual(contentBefore.length);
    console.log('[REGRESS-2] ✅ 已输出内容保留断言通过');
  });
});
