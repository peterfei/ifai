/**
 * 🌑 工业级暗色调设计验证
 *
 * 验证监控器使用统一的暗色调，与编辑器保持一致
 * - 深色/黑色背景 (bg-gray-900, bg-black)
 * - 白色/亮色文字 (text-white, text-gray-200, text-gray-300)
 * - 无白色背景
 * - 无 light/dark 模式切换
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

test.describe('🌑 工业级暗色调设计', () => {
  test('监控器应该始终使用暗色调背景', async ({ page }) => {
    page.on('console', msg => {
      if (msg.text().includes('[WorkflowInlineMonitor]')) {
        console.log(`[Browser Console] ${msg.text()}`);
      }
    });

    await setupE2ETestEnvironment(page, {
      skipWelcome: true,
      useRealAI: false
    });

    await page.goto('/');
    await page.waitForTimeout(3000);

    await page.evaluate(() => {
      (window as any).__layoutStore?.setState({ isChatOpen: true });
    });
    await page.waitForTimeout(2000);

    await page.evaluate(() => {
      const settingsStore = (window as any).__settingsStore;
      if (settingsStore) {
        settingsStore.getState().updateProviderConfig('zhipu', {
          apiKey: 'test-e2e-api-key',
          baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
          model: 'glm-4-flash'
        });
      }
    });
    await page.waitForTimeout(2000);

    console.log('\n=== 测试: 工业级暗色调 ===');

    await page.evaluate(() => {
      const chatEventBus = (window as any).chatEventBus || (window as any).__chatEventBus;
      const workflowId = 'dark-theme-test-' + Date.now();

      chatEventBus.emit('workflow:progress', {
        workflowId: workflowId,
        event_type: 'workflow:started',
        message: '暗色调测试',
        timestamp: Date.now(),
        nodes: [{ id: 'test-node', label: '测试节点', agent_type: 'test' }]
      });

      setTimeout(() => {
        chatEventBus.emit('workflow:progress', {
          workflowId: workflowId,
          event_type: 'node_started',
          node_id: 'test-node',
          message: '开始执行',
          timestamp: Date.now()
        });
      }, 100);

      setTimeout(() => {
        chatEventBus.emit('workflow:progress', {
          workflowId: workflowId,
          event_type: 'tool_call',
          node_id: 'test-node',
          message: '工具调用',
          timestamp: Date.now(),
          tool_details: {
            tool_name: 'agent_read_file',
            tool_input: JSON.stringify({ rel_path: 'package.json' }),
            tool_output: JSON.stringify({
              content: '{}',
              path: 'package.json',
              line_count: 50
            }),
            output_length: 100,
            execution_time_ms: 30,
            is_error: false
          }
        });
      }, 200);
    });

    await page.waitForTimeout(3000);

    // 🔍 验证暗色调设计
    const darkThemeCheck = await page.evaluate(() => {
      const monitor = document.querySelector('[data-monitor="true"]');
      if (!monitor) return { error: '监控器未渲染' };

      const monitorClass = monitor.className;
      const text = monitor.textContent || '';

      // 检查背景色
      const hasDarkBg = monitorClass.includes('bg-gray-900') || monitorClass.includes('bg-black');

      // 检查是否有白色背景类（不应该有）
      const hasWhiteBg = monitorClass.includes('bg-white') ||
                          monitorClass.includes('bg-gray-50') ||
                          monitorClass.includes('bg-gray-100');

      // 检查是否有 dark: 前缀（不应该有，因为应该始终使用暗色）
      const hasDarkPrefix = monitorClass.includes('dark:');

      // 检查文字内容
      const hasPackageJson = text.includes('package.json');
      const hasLines = text.includes('50 lines');

      return {
        monitorClass: monitorClass.substring(0, 200),
        hasDarkBg,
        hasWhiteBg,
        hasDarkPrefix,
        hasPackageJson,
        hasLines,
        textPreview: text.substring(0, 300)
      };
    });

    console.log('暗色调检查结果:', JSON.stringify(darkThemeCheck, null, 2));

    // 断言
    expect(darkThemeCheck.hasDarkBg).toBe(true);
    expect(darkThemeCheck.hasWhiteBg).toBe(false);
    expect(darkThemeCheck.hasDarkPrefix).toBe(false);
    expect(darkThemeCheck.hasPackageJson).toBe(true);
    expect(darkThemeCheck.hasLines).toBe(true);
  });

  test('文字应该使用白色/亮色，确保可读性', async ({ page }) => {
    page.on('console', msg => {
      if (msg.text().includes('[WorkflowInlineMonitor]')) {
        console.log(`[Browser Console] ${msg.text()}`);
      }
    });

    await setupE2ETestEnvironment(page, {
      skipWelcome: true,
      useRealAI: false
    });

    await page.goto('/');
    await page.waitForTimeout(3000);

    await page.evaluate(() => {
      (window as any).__layoutStore?.setState({ isChatOpen: true });
    });
    await page.waitForTimeout(2000);

    await page.evaluate(() => {
      const settingsStore = (window as any).__settingsStore;
      if (settingsStore) {
        settingsStore.getState().updateProviderConfig('zhipu', {
          apiKey: 'test-e2e-api-key',
          baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
          model: 'glm-4-flash'
        });
      }
    });
    await page.waitForTimeout(2000);

    await page.evaluate(() => {
      const chatEventBus = (window as any).chatEventBus || (window as any).__chatEventBus;
      const workflowId = 'readability-test-' + Date.now();

      chatEventBus.emit('workflow:progress', {
        workflowId: workflowId,
        event_type: 'workflow:started',
        message: '可读性测试',
        timestamp: Date.now(),
        nodes: [{ id: 'read-node', label: '读取文件', agent_type: 'test' }]
      });

      setTimeout(() => {
        chatEventBus.emit('workflow:progress', {
          workflowId: workflowId,
          event_type: 'node_started',
          node_id: 'read-node',
          message: '开始读取',
          timestamp: Date.now()
        });
      }, 100);

      setTimeout(() => {
        chatEventBus.emit('workflow:progress', {
          workflowId: workflowId,
          event_type: 'tool_call',
          node_id: 'read-node',
          message: '工具调用',
          timestamp: Date.now(),
          tool_details: {
            tool_name: 'agent_read_file',
            tool_input: JSON.stringify({ rel_path: 'src/App.tsx' }),
            tool_output: JSON.stringify({
              content: 'import React from React;',
              path: 'src/App.tsx',
              line_count: 100
            }),
            output_length: 200,
            execution_time_ms: 50,
            is_error: false
          }
        });
      }, 200);
    });

    await page.waitForTimeout(3000);

    // 🔍 验证文字颜色
    const textColorCheck = await page.evaluate(() => {
      const monitor = document.querySelector('[data-monitor="true"]');
      if (!monitor) return { error: '监控器未渲染' };

      // 查找所有文字元素
      const allElements = monitor.querySelectorAll('*');

      let hasWhiteText = false;
      let hasGrayLightText = false;
      let hasDarkText = false;

      for (const el of allElements) {
        const classes = el.className;
        if (typeof classes === 'string') {
          if (classes.includes('text-white')) hasWhiteText = true;
          if (classes.includes('text-gray-200') || classes.includes('text-gray-300')) hasGrayLightText = true;
          if (classes.includes('text-gray-900') || classes.includes('text-gray-700') || classes.includes('text-gray-600')) hasDarkText = true;
        }
      }

      // 检查详情框背景
      const preElements = monitor.querySelectorAll('pre');
      const preClasses = Array.from(preElements).map(pre => pre.className);

      return {
        hasWhiteText,
        hasGrayLightText,
        hasDarkText, // 不应该有深色文字（在暗色背景上不可见）
        preClasses: preClasses.map(c => c.substring(0, 100))
      };
    });

    console.log('文字颜色检查:', JSON.stringify(textColorCheck, null, 2));

    // 断言
    expect(textColorCheck.hasWhiteText || textColorCheck.hasGrayLightText).toBe(true);
    expect(textColorCheck.hasDarkText).toBe(false);
  });
});
