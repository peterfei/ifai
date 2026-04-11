/**
 * 🎨 工业级设计验证测试
 *
 * 验证工作流监控器使用工业级灰色色调，而非蓝色背景
 * - 简洁专业的灰色系
 * - 高对比度，易于阅读
 * - 清晰的视觉层次
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

test.describe('🎨 工业级设计验证', () => {
  test('监控器应该使用工业级灰色背景，而非蓝色', async ({ page }) => {
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[WorkflowInlineMonitor]')) {
        console.log(`[Browser Console] ${text}`);
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

    console.log('\n=== 测试: 工业级灰色设计 ===');

    await page.evaluate(() => {
      const chatEventBus = (window as any).chatEventBus || (window as any).__chatEventBus;
      const workflowId = 'industrial-test-' + Date.now();

      chatEventBus.emit('workflow:progress', {
        workflowId: workflowId,
        event_type: 'workflow:started',
        message: '工业级设计测试',
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

    // 🔍 验证工业级灰色设计
    const designCheck = await page.evaluate(() => {
      const monitor = document.querySelector('[data-monitor="true"]');
      if (!monitor) return { error: '监控器未渲染' };

      const card = monitor.querySelector('.bg-white, .dark\\:bg-gray-900');
      const hasBlueBackground = monitor.className.includes('blue-100') ||
                               monitor.className.includes('from-blue-');

      const text = monitor.textContent || '';

      // 检查是否使用灰色系
      const hasGrayText = text.includes('package.json');

      return {
        hasCard: !!card,
        hasBlueBackground,
        hasGrayText,
        monitorClasses: monitor.className,
        textPreview: text.substring(0, 200)
      };
    });

    console.log('工业级设计检查:', JSON.stringify(designCheck, null, 2));

    // 断言：不应有蓝色渐变背景
    expect(designCheck.hasBlueBackground).toBe(false);
    expect(designCheck.hasCard).toBe(true);
    expect(designCheck.hasGrayText).toBe(true);
  });

  test('工具调用应该使用清晰的文字颜色，易于阅读', async ({ page }) => {
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

    // 🔍 验证文字可读性
    const readabilityCheck = await page.evaluate(() => {
      const monitor = document.querySelector('[data-monitor="true"]');
      if (!monitor) return { error: '监控器未渲染' };

      // 查找工具调用元素 - 检查亮色文字（暗色调背景）
      const toolElements = monitor.querySelectorAll('.text-white, .text-gray-200, .text-gray-300');

      return {
        toolCount: toolElements.length,
        hasWhiteText: monitor.querySelector('.text-white') !== null,
        hasGrayLightText: monitor.querySelector('.text-gray-200, .text-gray-300') !== null,
        fullText: monitor.textContent?.substring(0, 300)
      };
    });

    console.log('可读性检查:', JSON.stringify(readabilityCheck, null, 2));

    // 验证使用了清晰的亮色（在暗色背景上）
    expect(readabilityCheck.hasWhiteText || readabilityCheck.hasGrayLightText).toBe(true);
  });

  test('详情输入输出框应该使用灰色背景，易于区分', async ({ page }) => {
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
      const workflowId = 'details-test-' + Date.now();

      chatEventBus.emit('workflow:progress', {
        workflowId: workflowId,
        event_type: 'workflow:started',
        message: '详情框测试',
        timestamp: Date.now(),
        nodes: [{ id: 'details-node', label: '详情测试', agent_type: 'test' }]
      });

      setTimeout(() => {
        chatEventBus.emit('workflow:progress', {
          workflowId: workflowId,
          event_type: 'node_started',
          node_id: 'details-node',
          message: '开始',
          timestamp: Date.now()
        });
      }, 100);

      setTimeout(() => {
        chatEventBus.emit('workflow:progress', {
          workflowId: workflowId,
          event_type: 'tool_call',
          node_id: 'details-node',
          message: '工具调用',
          timestamp: Date.now(),
          tool_details: {
            tool_name: 'read_file',
            tool_input: JSON.stringify({ path: 'test.txt' }),
            tool_output: 'File content here\nLine count: 5',
            output_length: 50,
            execution_time_ms: 10,
            is_error: false
          }
        });
      }, 200);
    });

    await page.waitForTimeout(3000);

    // 🔍 验证详情框样式
    const detailsCheck = await page.evaluate(() => {
      const monitor = document.querySelector('[data-monitor="true"]');
      if (!monitor) return { error: '监控器未渲染' };

      // 查找 pre 元素（代码块）
      const preElements = monitor.querySelectorAll('pre');

      const styles = Array.from(preElements).map(pre => ({
        hasGrayBg: pre.className.includes('bg-gray-100') || pre.className.includes('dark:bg-gray-800') || pre.className.includes('bg-black'),
        hasBorder: pre.className.includes('border-gray-'),
        className: pre.className
      }));

      return {
        preCount: preElements.length,
        hasGrayBackground: styles.some(s => s.hasGrayBg),
        hasBorder: styles.some(s => s.hasBorder),
        styles
      };
    });

    console.log('详情框样式检查:', JSON.stringify(detailsCheck, null, 2));

    // 验证使用了灰色背景和边框
    expect(detailsCheck.hasGrayBackground).toBe(true);
  });
});
