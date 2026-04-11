/**
 * 📐 分行显示验证测试
 *
 * 验证工具调用结果摘要在新的一行显示
 * 格式:
 * 📄 Read("package.json")
 * 100 lines, 50ms
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

test.describe('📐 分行显示验证', () => {
  test('工具结果摘要应该在新的一行显示', async ({ page }) => {
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[WorkflowInlineMonitor]') ||
          text.includes('tool_call')) {
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

    console.log('\n=== 测试: 分行显示验证 ===');

    await page.evaluate(() => {
      const chatEventBus = (window as any).chatEventBus || (window as any).__chatEventBus;
      const workflowId = 'line-break-test-' + Date.now();

      chatEventBus.emit('workflow:progress', {
        workflowId: workflowId,
        event_type: 'workflow:started',
        message: '分行显示测试',
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
          message: '工具调用: agent_read_file',
          timestamp: Date.now(),
          tool_details: {
            tool_name: 'agent_read_file',
            tool_input: JSON.stringify({ rel_path: 'package.json' }),
            tool_output: JSON.stringify({
              content: '{\n  "name": "test"\n}',
              path: 'package.json',
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

    // 🔍 详细验证分行显示结构
    const lineBreakCheck = await page.evaluate(() => {
      const monitor = document.querySelector('[data-monitor="true"]');
      if (!monitor) return { error: '监控器未渲染' };

      // 查找工具调用容器
      const toolCallDivs = Array.from(monitor.querySelectorAll('.text-green-400, .text-red-400'));
      const toolCall = toolCallDivs[0];

      if (!toolCall) return { error: '工具调用元素未找到' };

      // 获取直接子元素
      const children = Array.from(toolCall.children);

      const structure = children.map(child => ({
        tagName: child.tagName,
        className: child.className,
        textContent: child.textContent?.trim().substring(0, 50)
      }));

      // 验证是否有 flex-col 布局
      const hasFlexCol = toolCall.classList.contains('flex-col') ||
                        toolCall.querySelector('.flex-col') !== null;

      // 检查文本行数（排除 details 部分）
      const mainText = toolCall.textContent?.replace(/详情.*$/s, '') || '';
      const textLines = mainText.split('\n').filter(l => l.trim()).length;

      return {
        hasFlexCol,
        childCount: children.length,
        structure,
        textLines,
        fullText: toolCall.textContent?.trim().substring(0, 300)
      };
    });

    console.log('分行显示检查结果:', JSON.stringify(lineBreakCheck, null, 2));

    // 验证关键指标
    expect(lineBreakCheck.error).toBeUndefined();
    expect(lineBreakCheck.hasFlexCol).toBe(true);

    // 🔍 验证具体显示内容
    const contentCheck = await page.evaluate(() => {
      const monitor = document.querySelector('[data-monitor="true"]');
      if (!monitor) return { error: '监控器未渲染' };

      const text = monitor.textContent || '';

      // 检查是否包含预期内容
      return {
        hasRead: text.includes('Read'),
        hasPackageJson: text.includes('package.json'),
        has100Lines: text.includes('100 lines'),
        has50ms: text.includes('50ms'),
        // 检查是否没有箭头（因为我们改为分行显示）
        hasArrow: text.includes('→'),
        // 获取显示的文本行
        displayLines: text.split('\n').filter(l => l.trim()).slice(0, 10)
      };
    });

    console.log('内容检查结果:', JSON.stringify(contentCheck, null, 2));

    expect(contentCheck.hasRead).toBe(true);
    expect(contentCheck.hasPackageJson).toBe(true);
    expect(contentCheck.has100Lines).toBe(true);
  });

  test('多个工具调用应该都分行显示', async ({ page }) => {
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

    await page.evaluate(() => {
      const chatEventBus = (window as any).chatEventBus || (window as any).__chatEventBus;
      const workflowId = 'multi-tool-test-' + Date.now();

      chatEventBus.emit('workflow:progress', {
        workflowId: workflowId,
        event_type: 'workflow:started',
        message: '多工具测试',
        timestamp: Date.now(),
        nodes: [{ id: 'multi-node', label: '多工具节点', agent_type: 'test' }]
      });

      setTimeout(() => {
        chatEventBus.emit('workflow:progress', {
          workflowId: workflowId,
          event_type: 'node_started',
          node_id: 'multi-node',
          message: '开始执行',
          timestamp: Date.now()
        });
      }, 100);

      // 第一个工具
      setTimeout(() => {
        chatEventBus.emit('workflow:progress', {
          workflowId: workflowId,
          event_type: 'tool_call',
          node_id: 'multi-node',
          message: '工具调用 1',
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

      // 第二个工具
      setTimeout(() => {
        chatEventBus.emit('workflow:progress', {
          workflowId: workflowId,
          event_type: 'tool_call',
          node_id: 'multi-node',
          message: '工具调用 2',
          timestamp: Date.now(),
          tool_details: {
            tool_name: 'glob_search',
            tool_input: JSON.stringify({ pattern: '**/*.ts' }),
            tool_output: JSON.stringify({
              matches: ['a.ts', 'b.ts'],
              file_count: 2
            }),
            output_length: 100,
            execution_time_ms: 40,
            is_error: false
          }
        });
      }, 300);
    });

    await page.waitForTimeout(3000);

    const multiToolCheck = await page.evaluate(() => {
      const monitor = document.querySelector('[data-monitor="true"]');
      if (!monitor) return { error: '监控器未渲染' };

      // 查找所有工具调用
      const toolCalls = Array.from(monitor.querySelectorAll('.text-green-400'));

      return {
        toolCallCount: toolCalls.length,
        details: toolCalls.map(tc => ({
          text: tc.textContent?.trim().substring(0, 100),
          hasFlexCol: tc.querySelector('.flex-col') !== null
        }))
      };
    });

    console.log('多工具检查结果:', JSON.stringify(multiToolCheck, null, 2));

    expect(multiToolCheck.toolCallCount).toBe(2);
    expect(multiToolCheck.details[0].hasFlexCol).toBe(true);
    expect(multiToolCheck.details[1].hasFlexCol).toBe(true);
  });
});
