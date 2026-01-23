/**
 * agent_list_dir 文件列表显示测试
 *
 * 测试用户报告的具体场景：
 * 输入: [".ifai/","index.html","start_vite.sh","node_modules/","vite.config.js","README.md","package-lock.json","package.json","dev.log","src/"]
 * 预期输出: Markdown 格式的文件列表，而不是 JSON 字符串
 *
 * @version v0.3.1
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

test.describe('agent_list_dir 文件列表显示测试', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('formatToolResultToMarkdown') || text.includes('文件列表')) {
        console.log('[Browser Console]', text);
      }
    });

    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForTimeout(2000);
  });

  /**
   * 测试用户报告的确切场景
   *
   * 输入: [".ifai/","index.html","start_vite.sh","node_modules/","vite.config.js","README.md","package-lock.json","package.json","dev.log","src/"]
   * 预期: 格式化为 Markdown 列表
   */
  test('@regression agent-list-dir-display-01: 用户报告的确切数据应该被正确格式化', async ({ page }) => {
    console.log('[Test] 开始测试: 用户报告的确切数据');

    const result = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      chatStore.setState({ messages: [] });

      // 🔥 用户报告的确切数据
      const userInput = [".ifai/","index.html","start_vite.sh","node_modules/","vite.config.js","README.md","package-lock.json","package.json","dev.log","src/"];

      // 使用 formatToolResultToMarkdown 处理
      const formatToolResultToMarkdown = (window as any).__formatToolResultToMarkdown;

      if (!formatToolResultToMarkdown) {
        return { error: 'formatToolResultToMarkdown not found' };
      }

      const formatted = formatToolResultToMarkdown(userInput);

      // 检查结果
      const hasMarkdownHeader = formatted.includes('## 📁 Files');
      const hasAllFiles = userInput.every(file => formatted.includes(file));
      const hasListItems = formatted.split('- `').length > userInput.length; // 每个文件应该是一个列表项

      // 检查是否还是原始 JSON 格式
      const isRawJson = formatted.trim().startsWith('[') && formatted.includes('","');

      // 检查是否是友好的 Markdown 格式
      const isMarkdownList = formatted.includes('- `') && !isRawJson;

      return {
        success: true,
        formatted: formatted,
        formattedLength: formatted.length,
        hasMarkdownHeader,
        hasAllFiles,
        hasListItems,
        isRawJson,
        isMarkdownList,
        inputLength: userInput.length
      };
    });

    console.log('[Test] 用户确切数据格式化结果:', result);

    expect(result.success).toBe(true);
    expect(result.hasMarkdownHeader, '应该有 Markdown 标题').toBe(true);
    expect(result.hasAllFiles, '应该包含所有文件').toBe(true);
    expect(result.isMarkdownList, '应该是 Markdown 列表格式').toBe(true);
    expect(result.isRawJson, '不应该显示为原始 JSON').toBe(false);
  });

  /**
   * 测试混合文件列表（有/和没有/的路径）
   */
  test('@regression agent-list-dir-display-02: 混合文件列表应该被正确格式化', async ({ page }) => {
    console.log('[Test] 开始测试: 混合文件列表');

    const result = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      chatStore.setState({ messages: [] });

      // 混合文件列表：有些有 /，有些没有
      const mixedList = [
        ".ifai/",
        "index.html",
        "src/",
        "package.json",
        "vite.config.js",
        "README.md",
        "node_modules/"
      ];

      const formatToolResultToMarkdown = (window as any).__formatToolResultToMarkdown;
      const formatted = formatToolResultToMarkdown(mixedList);

      const hasAllFiles = mixedList.every(file => formatted.includes(file));
      const isProperlyFormatted = formatted.includes('## 📁 Files');
      const hasBulletPoints = formatted.includes('- `');

      return {
        success: true,
        formatted: formatted.substring(0, 500),
        hasAllFiles,
        isProperlyFormatted,
        hasBulletPoints
      };
    });

    console.log('[Test] 混合文件列表结果:', result);

    expect(result.success).toBe(true);
    expect(result.hasAllFiles, '应该包含所有文件').toBe(true);
    expect(result.isProperlyFormatted, '应该正确格式化').toBe(true);
    expect(result.hasBulletPoints, '应该有列表符号').toBe(true);
  });

  /**
   * 测试纯文件名列表（没有路径）
   */
  test('@regression agent-list-dir-display-03: 纯文件名列表应该被正确格式化', async ({ page }) => {
    console.log('[Test] 开始测试: 纯文件名列表');

    const result = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      chatStore.setState({ messages: [] });

      // 纯文件名列表（没有 /）
      const pureFileNames = [
        "index.html",
        "main.js",
        "style.css",
        "app.vue"
      ];

      const formatToolResultToMarkdown = (window as any).__formatToolResultToMarkdown;
      const formatted = formatToolResultToMarkdown(pureFileNames);

      const hasAllFiles = pureFileNames.every(file => formatted.includes(file));
      const hasFileHeader = formatted.includes('📁 Files');

      return {
        success: true,
        formatted: formatted.substring(0, 300),
        hasAllFiles,
        hasFileHeader
      };
    });

    console.log('[Test] 纯文件名列表结果:', result);

    expect(result.success).toBe(true);
    expect(result.hasAllFiles, '应该包含所有文件').toBe(true);
  });

  /**
   * 测试 useChatStore 中的 agent_list_dir 处理
   */
  test('@regression agent-list-dir-display-04: useChatStore 应该正确显示 agent_list_dir 结果', async ({ page }) => {
    console.log('[Test] 开始测试: useChatStore agent_list_dir 显示');

    const result = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      chatStore.setState({ messages: [] });

      // 模拟 agent_list_dir 返回的结果
      const agentListDirResult = [
        ".ifai/",
        "index.html",
        "start_vite.sh",
        "node_modules/",
        "vite.config.js",
        "README.md",
        "package-lock.json",
        "package.json",
        "dev.log",
        "src/"
      ];

      // 模拟 useChatStore 中的处理逻辑
      let stringResult: string;

      // 检查是否是字符数组
      const isCharArray = agentListDirResult.length > 0 &&
                          agentListDirResult.every((item: any) => typeof item === 'string' && item.length <= 1);

      if (isCharArray) {
        stringResult = agentListDirResult.join('');
      } else {
        // 普通数组：使用 JSON.stringify
        stringResult = JSON.stringify(agentListDirResult);
      }

      // 使用格式化函数
      const formatToolResultToMarkdown = (window as any).__formatToolResultToMarkdown;
      const formatted = formatToolResultToMarkdown(stringResult);

      // 检查格式化结果
      const isReadable = formatted.includes('.ifai/') &&
                        formatted.includes('index.html') &&
                        formatted.includes('package.json');

      const hasProperFormat = formatted.includes('📁') ||
                              formatted.includes('- `');

      // 检查是否仍然是原始 JSON（显示为 ["...
      const showsAsRawJson = formatted.startsWith('["') &&
                             formatted.includes('","');

      return {
        success: true,
        stringResult: stringResult.substring(0, 200),
        formatted: formatted.substring(0, 500),
        isReadable,
        hasProperFormat,
        showsAsRawJson,
        arrayLength: agentListDirResult.length
      };
    });

    console.log('[Test] useChatStore agent_list_dir 显示结果:', result);

    expect(result.success).toBe(true);
    expect(result.isReadable, '应该可读并包含所有文件').toBe(true);
    expect(result.hasProperFormat, '应该有正确的格式').toBe(true);
    expect(result.showsAsRawJson, '不应该显示为原始 JSON').toBe(false);
  });

  /**
   * 测试：验证不在 useChatStore 中的 tool result 格式化
   *
   * 这个测试模拟 ToolApproval 组件中直接使用 toolCall.result 的情况
   */
  test('@regression agent-list-dir-display-05: 直接格式化 toolCall.result 应该显示正确', async ({ page }) => {
    console.log('[Test] 开始测试: 直接格式化 toolCall.result');

    const result = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      chatStore.setState({ messages: [] });

      // 模拟 toolCall.result（直接是数组，不是字符串）
      const toolCallResult = [
        ".ifai/",
        "index.html",
        "start_vite.sh",
        "node_modules/",
        "vite.config.js"
      ];

      // 直接使用 formatToolResultToMarkdown（不经过 useChatStore 的处理）
      const formatToolResultToMarkdown = (window as any).__formatToolResultToMarkdown;
      const formatted = formatToolResultToMarkdown(toolCallResult);

      // 检查是否是用户友好的格式
      const hasFileHeader = formatted.includes('📁 Files');
      const hasAllItems = toolCallResult.every(item => formatted.includes(item));
      const hasBulletPoints = formatted.includes('- `');
      const isNotRawJson = !formatted.startsWith('["') || !formatted.includes('","');

      return {
        success: true,
        formatted: formatted.substring(0, 400),
        hasFileHeader,
        hasAllItems,
        hasBulletPoints,
        isNotRawJson,
        arrayLength: toolCallResult.length
      };
    });

    console.log('[Test] 直接格式化结果:', result);

    expect(result.success).toBe(true);
    expect(result.hasFileHeader || result.hasBulletPoints, '应该有文件标题或列表符号').toBe(true);
    expect(result.hasAllItems, '应该包含所有项目').toBe(true);
    expect(result.isNotRawJson, '不应该显示为原始 JSON').toBe(true);
  });
});
