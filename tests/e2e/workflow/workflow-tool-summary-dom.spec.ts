/**
 * 🧪 工具结果摘要 DOM 验证测试
 *
 * 验证工具执行结果摘要（如 "50 lines, 30ms"）是否正确显示在 DOM 中
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

test.describe('🧪 工具结果摘要 DOM 验证', () => {
  test('工具调用应该显示结果摘要（行数、耗时等）', async ({ page }) => {
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

    console.log('\n=== 测试: 工具结果摘要 DOM 验证 ===');

    await page.evaluate(() => {
      const chatEventBus = (window as any).chatEventBus || (window as any).__chatEventBus;
      const workflowId = 'tool-summary-test-' + Date.now();

      chatEventBus.emit('workflow:progress', {
        workflowId: workflowId,
        event_type: 'workflow:started',
        message: '工具摘要测试',
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

    // 🔍 验证工具结果摘要是否显示在 DOM 中
    const summaryCheck = await page.evaluate(() => {
      const monitor = document.querySelector('[data-monitor="true"]');
      if (!monitor) return { error: '监控器未渲染' };

      const text = monitor.textContent || '';

      // 检查是否包含 "50 lines" 和 "30ms"
      const hasLines = text.includes('50 lines');
      const hasTime = text.includes('30ms');
      const hasSummary = text.includes('50 lines, 30ms') || text.includes('30ms, 50 lines');

      // 检查是否有 text-gray-300 类（摘要文字颜色）
      const allElements = monitor.querySelectorAll('*');
      let hasGray300Text = false;
      let summaryTextContent = '';
      for (const el of allElements) {
        const classes = el.className;
        if (typeof classes === 'string' && classes.includes('text-gray-300')) {
          // 检查这个元素是否包含摘要文字
          const elementText = el.textContent || '';
          if (elementText.includes('lines') || elementText.includes('ms')) {
            hasGray300Text = true;
            summaryTextContent = elementText;
            break;
          }
        }
      }

      // 检查 DOM 结构 - 是否有 flex-col 布局（分行显示）
      const flexColElements = monitor.querySelectorAll('.flex-col');

      return {
        monitorExists: !!monitor,
        hasLines,
        hasTime,
        hasSummary,
        hasGray300Text,
        summaryTextContent,
        flexColCount: flexColElements.length,
        fullText: text.substring(0, 500),
        monitorClasses: monitor.className
      };
    });

    console.log('工具结果摘要检查:', JSON.stringify(summaryCheck, null, 2));

    // 断言 - 验证摘要内容存在且使用正确的样式
    expect(summaryCheck.monitorExists).toBe(true);
    expect(summaryCheck.hasLines).toBe(true);
    expect(summaryCheck.hasTime).toBe(true);
    expect(summaryCheck.hasGray300Text).toBe(true);
  });

  test('多个工具调用应该都显示结果摘要', async ({ page }) => {
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
      const workflowId = 'multi-tool-test-' + Date.now();

      chatEventBus.emit('workflow:progress', {
        workflowId: workflowId,
        event_type: 'workflow:started',
        message: '多工具测试',
        timestamp: Date.now(),
        nodes: [
          { id: 'read-node', label: '读取', agent_type: 'test' },
          { id: 'write-node', label: '写入', agent_type: 'test' }
        ]
      });

      setTimeout(() => {
        chatEventBus.emit('workflow:progress', {
          workflowId: workflowId,
          event_type: 'node_started',
          node_id: 'read-node',
          message: '开始读取',
          timestamp: Date.now()
        });

        chatEventBus.emit('workflow:progress', {
          workflowId: workflowId,
          event_type: 'tool_call',
          node_id: 'read-node',
          message: '读取文件',
          timestamp: Date.now(),
          tool_details: {
            tool_name: 'agent_read_file',
            tool_input: JSON.stringify({ rel_path: 'src/App.tsx' }),
            tool_output: JSON.stringify({
              content: 'import React',
              path: 'src/App.tsx',
              line_count: 100
            }),
            output_length: 200,
            execution_time_ms: 50,
            is_error: false
          }
        });
      }, 100);

      setTimeout(() => {
        chatEventBus.emit('workflow:progress', {
          workflowId: workflowId,
          event_type: 'node_started',
          node_id: 'write-node',
          message: '开始写入',
          timestamp: Date.now()
        });

        chatEventBus.emit('workflow:progress', {
          workflowId: workflowId,
          event_type: 'tool_call',
          node_id: 'write-node',
          message: '写入文件',
          timestamp: Date.now(),
          tool_details: {
            tool_name: 'agent_write_file',
            tool_input: JSON.stringify({ rel_path: 'test.txt' }),
            tool_output: JSON.stringify({
              path: 'test.txt',
              char_count: 500
            }),
            output_length: 100,
            execution_time_ms: 20,
            is_error: false
          }
        });
      }, 300);
    });

    await page.waitForTimeout(3000);

    // 🔍 验证多个工具的摘要
    const multiToolCheck = await page.evaluate(() => {
      const monitor = document.querySelector('[data-monitor="true"]');
      if (!monitor) return { error: '监控器未渲染' };

      const text = monitor.textContent || '';

      // 检查两个工具的摘要
      const hasReadLines = text.includes('100 lines');
      const hasWriteTime = text.includes('20ms');
      const hasReadTime = text.includes('50ms');

      // 检查 text-gray-300 元素数量（每个工具应该有一个摘要元素）
      const summaryElements = monitor.querySelectorAll('.text-gray-300');
      const summaryTexts = Array.from(summaryElements).map(el => el.textContent || '');

      return {
        hasReadLines,
        hasWriteTime,
        hasReadTime,
        summaryCount: summaryElements.length,
        summaryTexts: summaryTexts.filter(t => t.includes('lines') || t.includes('ms') || t.includes('chars'))
      };
    });

    console.log('多工具结果摘要检查:', JSON.stringify(multiToolCheck, null, 2));

    // 断言
    expect(multiToolCheck.hasReadLines).toBe(true);
    expect(multiToolCheck.hasWriteTime).toBe(true);
    expect(multiToolCheck.summaryTexts.length).toBeGreaterThan(0);
  });
});
