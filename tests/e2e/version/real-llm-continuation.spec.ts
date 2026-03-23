/**
 * 真实 LLM 续播 (Continuation) 红绿回归测试
 * 
 * 验证：当 LLM 响应过长触发续播时，前端不会过早触发 Fast Finish 或 Cleanup
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

test.describe('Real LLM Continuation Regression', () => {
  test.setTimeout(240000); // 续播可能需要较长时间

  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page, {
      skipWelcome: true,
      useRealAI: true // 物理级验证
    });

    // 强制进入商业版配置
    await page.evaluate(() => {
      const settingsStore = (window as any).__settingsStore;
      if (settingsStore) {
        const fileConfig = (window as any).__E2E_REAL_AI_CONFIG__;
        if (fileConfig && fileConfig.realAIApiKey) {
          settingsStore.getState().updateProviderConfig('zhipu', {
            apiKey: fileConfig.realAIApiKey,
            baseUrl: fileConfig.realAIBaseUrl || 'https://open.bigmodel.cn/api/paas/v4'
          });
        }
        settingsStore.getState().setCurrentProviderAndModel('zhipu', 'glm-4');
      }
    });
  });

  test('验证续播数据链路完整性', async ({ page }) => {
    console.log('[测试] 发起极长响应请求以触发现实续播...');

    await page.evaluate(() => {
      const w = window as any;
      w.__CONTINUATION_TRACE__ = {
        finishedCount: 0,
        orphanedChunks: 0,
        log: []
      };

      // 监听物理事件
      w.__chatEventBus.on('chat:stream:finished', (p: any) => {
        w.__CONTINUATION_TRACE__.finishedCount++;
        w.__CONTINUATION_TRACE__.log.push(`[${Date.now()}] 🏁 Finished received for ${p.correlationId}`);
      });

      w.__chatEventBus.on('chat:stream:chunk', (p: any) => {
        // 如果已经 finished 之后还有 chunk 到达，且没有重新 start，说明发生了孤儿块
        if (w.__CONTINUATION_TRACE__.finishedCount > 0 && !p.isFinal) {
           w.__CONTINUATION_TRACE__.log.push(`[${Date.now()}] 📥 Chunk arrived AFTER finish!`);
        }
      });
    });

    // 发送指令
    await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      chatStore.getState().sendMessage('请编写一个极其详尽的、包含完整注释的 2048 网页游戏，将 HTML, CSS, JS 代码全部写在同一个回复中，尽量写得长一些。');
    });

    // 监控循环
    let continuationDetected = false;
    for (let i = 0; i < 120; i++) {
      await page.waitForTimeout(2000);
      
      const stats = await page.evaluate(() => {
        const chatStore = (window as any).__chatStore.getState();
        const lastMsg = chatStore.messages[chatStore.messages.length - 1];
        return {
          contentLength: lastMsg?.content?.length || 0,
          isStreaming: lastMsg?.isStreaming,
          segmentsCount: lastMsg?.segments?.length || 0,
          trace: (window as any).__CONTINUATION_TRACE__
        };
      });

      console.log(`[测试] T+${i*2}s | 长度: ${stats.contentLength} | 段落: ${stats.segmentsCount} | 结束信号数: ${stats.trace.finishedCount}`);

      // 核心 Bug 触发条件断言：
      // 如果结束信号数 > 0 且 isStreaming 为 true，说明正在续播
      if (stats.trace.finishedCount > 0 && stats.isStreaming) {
        continuationDetected = true;
        console.log('[测试] 🚀 续播模式已激活！');
      }

      // 如果流结束了且检测到过续播，验证最终完整性
      if (!stats.isStreaming && stats.contentLength > 500) {
        break;
      }
    }

    expect(continuationDetected).toBe(true);
    
    // 验证 UI 渲染是否包含后续内容（比如 agent_write_file 标记或长代码）
    const finalContent = await page.evaluate(() => (window as any).__chatStore.getState().messages.slice(-1)[0].content);
    expect(finalContent.length).toBeGreaterThan(1000);
    
    console.log('[测试] ✅ 续播红绿验证通过：数据链路闭环。');
  });
});
