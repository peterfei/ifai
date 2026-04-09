/**
 * 工作流内嵌监控器 - 修复版测试
 *
 * 正确配置 provider 以显示完整聊天界面
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

test.describe('工作流内嵌监控器测试（修复版）', () => {
  test('配置 provider 后显示监控器', async ({ page }) => {
    // 监听所有控制台消息
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('WorkflowInlineMonitor') ||
          text.includes('workflow:') ||
          text.includes('工作流监控器')) {
        console.log('[Console]', text);
      }
    });

    await setupE2ETestEnvironment(page, {
      skipWelcome: true,
      useRealAI: false
    });

    await page.goto('/');
    await page.waitForTimeout(2000);

    // 🔥 关键：手动配置 provider，确保聊天界面完整显示
    await page.evaluate(async () => {
      // 🔥 FIX: 设置 E2E 模式标志，确保工作流监控器显示调试卡片
      (window as any).__E2E__ = true;
      console.log('[Script] 🧪 E2E mode enabled');

      const settingsStore = (window as any).__settingsStore;
      if (!settingsStore) {
        console.error('[Script] ❌ settingsStore not found');
        return;
      }

      console.log('[Script] 🔧 配置 provider...');
      console.log('[Script] settingsStore.getState():', settingsStore.getState());

      // 配置一个 mock provider
      const state = settingsStore.getState();
      console.log('[Script] current providers:', state.providers);

      // 使用 setState 方法
      settingsStore.setState({
        providers: [{
          id: 'test-provider',
          name: 'Test Provider',
          apiKey: 'test-key-1234567890',
          enabled: true,
          base: 'https://api.test.com',
          models: ['test-model']
        }],
        currentProviderId: 'test-provider'
      });

      console.log('[Script] ✅ Provider 已配置');
    });

    // 等待状态更新
    await page.waitForTimeout(2000);

    // 检查聊天面板是否有消息列表
    const checkBefore = await page.evaluate(() => {
      const scrollContainer = document.querySelector('[data-testid="chat-scroll-container"]');
      // 查找工作流监控器的多种可能文本
      const bodyText = document.body.textContent || '';
      const hasWorkflowMonitor = bodyText.includes('代码探索') ||
                                  bodyText.includes('执行中') ||
                                  bodyText.includes('已完成') ||
                                  bodyText.includes('工作流') ||
                                  bodyText.includes('进度');

      return {
        hasScrollContainer: !!scrollContainer,
        hasWorkflowMonitor
      };
    });

    console.log('[E2E] 配置前检查:', checkBefore);

    // 发送消息
    console.log('[E2E] 发送 /explore 命令');
    await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      if (!chatStore) return;
      await chatStore.getState().sendMessage('/explore src/components');
    });

    // 等待消息处理和监控器显示
    await page.waitForTimeout(5000);

    // 最终检查
    const finalCheck = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      const messages = chatStore?.getState().messages || [];

      const scrollContainer = document.querySelector('[data-testid="chat-scroll-container"]');

      // 🔥 详细查找工作流监控器卡片
      const allCards = Array.from(document.querySelectorAll('[class*="border-blue-500"]'));
      // 查找包含工作流相关文本的卡片（"代码探索"、"执行中"、"已完成"等）
      const monitorCards = allCards.filter(card => {
        const text = card.textContent || '';
        return text.includes('代码探索') ||
               text.includes('执行中') ||
               text.includes('已完成') ||
               text.includes('工作流') ||
               text.includes('进度');
      });

      // 获取第一个监控器卡片的详细信息
      const firstMonitorCard = monitorCards[0];
      const monitorCardInfo = firstMonitorCard ? {
        className: firstMonitorCard.className,
        innerHTML: firstMonitorCard.innerHTML,
        parentHTML: firstMonitorCard.parentElement?.innerHTML?.substring(0, 200),
        isInScrollContainer: scrollContainer?.contains(firstMonitorCard)
      } : null;

      // 查找工作流监控器的多种可能文本
      const bodyText = document.body.textContent || '';
      const bodyContainsWorkflowMonitor = bodyText.includes('代码探索') ||
                                        bodyText.includes('执行中') ||
                                        bodyText.includes('已完成') ||
                                        bodyText.includes('工作流') ||
                                        bodyText.includes('进度');

      return {
        messageCount: messages.length,
        hasScrollContainer: !!scrollContainer,
        scrollContainerHTML: scrollContainer?.innerHTML?.substring(0, 1000),
        allBlueBorderCardsCount: allCards.length,
        monitorCardsCount: monitorCards.length,
        bodyContainsWorkflowMonitor,
        monitorCardInfo
      };
    });

    console.log('[E2E] 最终检查:', JSON.stringify(finalCheck, null, 2));

    // 验证消息列表存在
    expect(finalCheck.hasScrollContainer).toBe(true);
    expect(finalCheck.messageCount).toBeGreaterThan(0);

    // 🔥 验证工作流监控器显示
    expect(finalCheck.bodyContainsWorkflowMonitor).toBe(true);
    expect(finalCheck.monitorCardsCount).toBeGreaterThan(0);
    if (finalCheck.monitorCardInfo) {
      console.log('[E2E] 监控器卡片详情:', finalCheck.monitorCardInfo);
      expect(finalCheck.monitorCardInfo.isInScrollContainer).toBe(true);
    }
  });
});
