/**
 * agent_read_file 回归测试
 *
 * 测试场景：
 * 用户报告 agent_read_file 返回字符数组而不是字符串，
 * 导致 formatToolResultToMarkdown 接收到 ["0": "a", "1": "b", ...]
 * 而不是原始文件内容。
 *
 * 预期行为：
 * - agent_read_file 应该返回完整的文件内容（字符串）
 * - formatToolResultToMarkdown 应该接收到字符串或对象，而不是字符数组
 * - ToolApproval 组件应该正确显示文件内容
 *
 * @version v0.3.1
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

test.describe('agent_read_file 回归测试', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page);
    await page.goto('/');

    // 移除可能的遮罩层
    await page.evaluate(() => {
      const overlay = document.querySelector('.react-joyride__overlay');
      const tooltip = document.querySelector('.react-joyride__tooltip');
      const portal = document.getElementById('react-joyride-portal');
      if (portal) portal.remove();
      if (overlay) overlay.remove();
      if (tooltip) tooltip.remove();
    });
  });

  /**
   * 测试用例 1: 验证 formatToolResultToMarkdown 能正确处理字符数组
   *
   * 模拟 ifainew_core 返回字符数组的情况，验证前端能正确拼接
   */
  test('@regression agent_read_file-01: formatToolResultToMarkdown 应该正确处理字符数组', async ({ page }) => {
    console.log('[Test] 开始测试: formatToolResultToMarkdown 处理字符数组');

    const result = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      chatStore.setState({ messages: [] });

      // 模拟 ifainew_core 返回的字符数组（bug 情况）
      const mockCharArray = ['{', '"', 'n', 'a', 'm', 'e', '"', ':', '"', 't', 'e', 's', 't', '"', ',',
                            '"', 'v', 'e', 'r', 's', 'i', 'o', 'n', '"', ':', '"', '1', '.', '0', '"', '}'];

      // 导入 formatToolResultToMarkdown 函数（暴露为 __formatToolResultToMarkdown）
      const formatToolResultToMarkdown = (window as any).__formatToolResultToMarkdown;

      if (!formatToolResultToMarkdown) {
        return { error: 'formatToolResultToMarkdown function not found' };
      }

      // 调用函数处理字符数组
      const formatted = formatToolResultToMarkdown(mockCharArray);

      // 检查结果
      const isFormattedCorrectly = formatted.includes('name') &&
                                    formatted.includes('test') &&
                                    formatted.includes('version');

      const hasCharArrayMarkers = formatted.includes('undefined') ||
                                  formatted.includes('No results') ||
                                  formatted.includes('_No results_');

      return {
        success: true,
        formatted: formatted.substring(0, 500),
        isFormattedCorrectly,
        hasCharArrayMarkers,
        arrayLength: mockCharArray.length
      };
    });

    console.log('[Test] 字符数组处理结果:', result);

    expect(result.success).toBe(true);
    expect(result.isFormattedCorrectly, '应该正确格式化字符数组为可读内容').toBe(true);
    expect(result.hasCharArrayMarkers, '不应该显示字符数组的原始标记').toBe(false);
  });

  /**
   * 测试用例 2: 验证 formatToolResultToMarkdown 不接收字符数组
   */
  test('@regression agent_read_file-02: formatToolResultToMarkdown 应该接收正确格式的 result', async ({ page }) => {
    console.log('[Test] 开始测试: formatToolResultToMarkdown 接收格式');

    const result = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      chatStore.setState({ messages: [] });

      await chatStore.getState().sendMessage('读取 package.json');

      const msgId = 'msg-test-format-' + Date.now();
      const tcId = 'tool-call-format-' + Date.now();

      const assistantMessage = {
        id: msgId,
        role: 'assistant',
        content: '我将读取 package.json。',
        timestamp: Date.now(),
        toolCalls: [
          {
            id: tcId,
            type: 'function',
            tool: 'agent_read_file',
            function: {
              name: 'agent_read_file',
              arguments: JSON.stringify({ rel_path: 'package.json' })
            },
            args: { rel_path: 'package.json' },
            status: 'pending'
          }
        ]
      };

      chatStore.setState((state: any) => ({
        ...state,
        messages: [...state.messages, assistantMessage]
      }));

      await chatStore.getState().approveToolCall(msgId, tcId);

      // 等待执行完成
      let attempts = 0;
      let toolCall = null;
      while (attempts < 50 && !toolCall) {
        await new Promise(resolve => setTimeout(resolve, 100));
        const messages = chatStore.getState().messages;
        const assistantMsg = messages.find((m: any) => m.id === msgId);
        toolCall = assistantMsg?.toolCalls?.find((tc: any) => tc.id === tcId);
        if (toolCall && toolCall.result) break;
        toolCall = null;
        attempts++;
      }

      if (!toolCall || !toolCall.result) {
        return {
          error: 'Tool call result not found',
          attempts
        };
      }

      // 检查 result 的键
      const result = toolCall.result;
      let keys: string[] = [];
      let type = 'unknown';

      if (typeof result === 'string') {
        type = 'string';
      } else if (Array.isArray(result)) {
        type = 'array';
        keys = Object.keys(result);
      } else if (typeof result === 'object') {
        type = 'object';
        keys = Object.keys(result);
      }

      return {
        success: true,
        type,
        keys: keys.slice(0, 20),
        keysCount: keys.length,
        // 检查是否是数字键（字符数组的特征）
        hasNumericKeys: keys.length > 0 && keys.every(k => /^\d+$/.test(k)),
        // 检查键的数量是否等于内容长度（字符数组的特征）
        likelyCharArray: type === 'array' && keys.length > 100
      };
    });

    console.log('[Test] formatToolResultToMarkdown 检查结果:', result);

    expect(result.success).toBe(true);

    // 关键断言：不应该有数字键（字符数组的特征）
    expect(result.hasNumericKeys,
           'result 不应该有数字键（字符数组的特征）'
    ).toBe(false);

    // 不应该是字符数组
    expect(result.likelyCharArray,
           'result 不应该是字符数组（100+个元素）'
    ).toBe(false);
  });

  /**
   * 测试用例 3: 验证 formatToolResultToMarkdown 能正确处理长 JSON 字符串
   *
   * 模拟 agent_read_file 返回的完整 JSON 文件内容
   */
  test('@regression agent_read_file-03: formatToolResultToMarkdown 应该正确处理 JSON 内容', async ({ page }) => {
    console.log('[Test] 开始测试: formatToolResultToMarkdown 处理 JSON 内容');

    const result = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      chatStore.setState({ messages: [] });

      // 模拟 agent_read_file 返回的 JSON 文件内容（字符串形式）
      const mockFileContent = '{"name":"test-content-app","version":"2.0.0","type":"commonjs","description":"Test file"}';

      // 导入 formatToolResultToMarkdown 函数
      const formatToolResultToMarkdown = (window as any).__formatToolResultToMarkdown;

      if (!formatToolResultToMarkdown) {
        return { error: 'formatToolResultToMarkdown function not found' };
      }

      // 调用函数处理字符串
      const formatted = formatToolResultToMarkdown(mockFileContent);

      // 检查结果
      const hasName = formatted.includes('name') && formatted.includes('test-content-app');
      const hasVersion = formatted.includes('version') && formatted.includes('2.0.0');
      const hasType = formatted.includes('type') && formatted.includes('commonjs');
      const hasDescription = formatted.includes('description');

      return {
        success: true,
        formatted: formatted.substring(0, 800),
        hasName,
        hasVersion,
        hasType,
        hasDescription,
        contentLength: mockFileContent.length
      };
    });

    console.log('[Test] JSON 内容处理结果:', result);

    expect(result.success).toBe(true);
    expect(result.hasName, '应该包含 name 和 test-content-app').toBe(true);
    expect(result.hasVersion, '应该包含 version 和 2.0.0').toBe(true);
    expect(result.hasType, '应该包含 type 和 commonjs').toBe(true);
    expect(result.hasDescription, '应该包含 description').toBe(true);
  });
});
