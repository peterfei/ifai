/**
 * 多 Tab 工作流场景测试 (物理增强版)
 * 
 * 专门针对商业版 TAURI_DEV=true 环境进行优化
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

test.describe('多 Tab 工作流场景 - 物理级验证', () => {
  test.setTimeout(180000); // 增加超时到 3 分钟

  test.beforeEach(async ({ page }) => {
    // 1. 设置全局 E2E 标志
    await page.addInitScript(() => {
      (window as any).__E2E__ = true;
      (window as any).__E2E_SKIP_STABILIZER__ = true;
      localStorage.setItem('onboarding-completed', 'true');
      localStorage.setItem('welcome-dialog-hidden', 'true');
    });

    await setupE2ETestEnvironment(page, {
      skipWelcome: true,
      useRealAI: false // 逻辑测试，使用 Mock AI 即可，避免消耗 Token 且响应更快
    });

    // 2. 等待核心 Store 物理挂载
    console.log('[测试] 等待核心 Store 物理挂载...');
    await page.waitForFunction(() => 
      (window as any).__chatStore !== undefined && 
      (window as any).__threadStore !== undefined,
      { timeout: 60000 }
    );

    // 3. 强制确保 UI 处于干净状态 (移除任何可能阻塞点击的弹窗)
    await page.evaluate(() => {
      const overlays = document.querySelectorAll('.react-joyride__overlay, div[role="dialog"]');
      overlays.forEach(el => (el as HTMLElement).style.display = 'none');
    });

    console.log('[测试] 环境准备就绪');
  });

  test('回归验证: 切换 Tab 后消息段落 (segments) 不应丢失', async ({ page }) => {
    console.log('[测试] 1. 在第一个 Tab 发送消息并确保生成 segments');
    
    // 使用 evaluate 直接发送，绕过输入框点击
    const threadIdA = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore.getState();
      const threadStore = (window as any).__threadStore.getState();
      
      await chatStore.sendMessage('测试段落持久化 A');
      
      // 等待一段响应被记录 (Mock AI 会立即返回)
      return threadStore.activeThreadId;
    });

    // 验证初始状态
    const initialSegments = await page.evaluate((tid) => {
      const chatStore = (window as any).__chatStore.getState();
      const msg = chatStore.messages.find((m: any) => m.content.includes('测试段落持久化 A'));
      return {
        segmentsCount: msg?.segments?.length || 0,
        content: msg?.content || ''
      };
    }, threadIdA);
    
    console.log('[测试] 初始状态:', initialSegments);
    expect(initialSegments.segmentsCount).toBeGreaterThan(0);

    console.log('[测试] 2. 创建新 Tab 并输入内容 (触发旧 Tab 的持久化 flush)');
    await page.keyboard.press('Control+t');
    await page.waitForTimeout(2000); // 等待异步创建完成

    const threadIdB = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore.getState();
      await chatStore.sendMessage('Tab 2 的内容');
      return (window as any).__threadStore.getState().activeThreadId;
    });
    
    expect(threadIdA).not.toBe(threadIdB);

    console.log('[测试] 3. 切换回第一个 Tab (验证 segments 物理恢复)');
    await page.evaluate(async (targetId) => {
      await (window as any).__threadStore.getState().switchThread(targetId);
    }, threadIdA);

    // 等待恢复
    await page.waitForTimeout(1000);

    const recoveredState = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore.getState();
      const msg = chatStore.messages.find((m: any) => m.content.includes('测试段落持久化 A'));
      return {
        segmentsCount: msg?.segments?.length || 0,
        content: msg?.content || '',
        segmentsPreview: (msg?.segments || []).map((s: any) => s.content.substring(0, 10))
      };
    });

    console.log('[测试] 恢复后状态:', recoveredState);
    
    // 🏆 核心断言：segments 必须通过持久化层恢复回来
    expect(recoveredState.segmentsCount).toBeGreaterThan(0);
    expect(recoveredState.content).toContain('测试段落持久化 A');

    console.log('[测试] ✅ 物理级回归验证通过：切换 Tab 后 Segments 完美保留');
  });
});
