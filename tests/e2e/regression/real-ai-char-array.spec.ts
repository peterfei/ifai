/**
 * 真实 AI 字符数组回归测试
 *
 * 测试场景（用户报告）：
 * 1. 用户项目是 vite 项目
 * 2. 用户输入 "执行vite"
 * 3. LLM 返回 "List Directory" 请求
 * 4. 用户手动同意
 * 5. 输出字符数组：[".ifai/","index.html","start_vite.sh","node_modules/",...]
 *
 * 预期行为：
 * - agent_list_dir 应该返回正常的目录列表
 * - 前端应该正确处理字符数组（如果有）
 * - 显示的应该是可读的目录列表，而不是字符数组格式
 *
 * @version v0.3.1
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment, getRealAIConfig } from '../setup';

test.describe.skip('真实 AI 字符数组回归测试 - TODO: Fix this test', () => {
  test.beforeEach(async ({ page }) => {
    // 监听浏览器控制台日志
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[formatToolResultToMarkdown') ||
          text.includes('Char array') ||
          text.includes('agent_list_dir')) {
        console.log('[Browser Console]', text);
      }
    });

    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForTimeout(3000);

    // 移除可能的遮罩层
    await page.evaluate(() => {
      const overlay = document.querySelector('.react-joyride__overlay');
      const tooltip = document.querySelector('.react-joyride__tooltip');
      const portal = document.getElementById('react-joyride-portal');
      if (portal) portal.remove();
      if (overlay) overlay.remove();
      if (tooltip) tooltip.remove();
    });

    // 打开聊天面板
    await page.evaluate(() => {
      const layoutStore = (window as any).__layoutStore;
      if (layoutStore) {
        const store = layoutStore;
        if (store && store.getState && !store.getState().isChatOpen) {
          store.getState().toggleChat();
        }
      }
    });
    await page.waitForTimeout(2000);
  });

  /**
   * 测试用例 1: 真实 AI 场景 - 用户输入 "执行vite"
   *
   * 复现用户报告的问题：
   * 1. 创建一个 vite 项目环境
   * 2. 用户输入 "执行vite"
   * 3. LLM 可能会调用 agent_list_dir 来查看项目结构
   * 4. 验证返回的目录列表不会被显示为字符数组
   */
  test('@regression real-ai-char-array-01: 真实 AI 场景 - 输入"执行vite"不应该显示字符数组', async ({ page }) => {
    console.log('[Test] 开始测试: 真实 AI 场景 - 执行vite');

    // 1. 设置 vite 项目环境
    await page.evaluate(async () => {
      const mockFS = (window as any).__E2E_MOCK_FILE_SYSTEM;
      const fileStore = (window as any).__fileStore;

      // 创建 vite 项目的典型文件结构
      mockFS.set('/vite-project/package.json', JSON.stringify({
        name: 'vite-project',
        version: '1.0.0',
        type: 'module',
        scripts: {
          dev: 'vite',
          build: 'vite build'
        },
        devDependencies: {
          vite: '^5.0.0'
        }
      }, null, 2));

      mockFS.set('/vite-project/vite.config.js', `
import { defineConfig } from 'vite';
export default defineConfig({
  server: {
    port: 5173
  }
});
`);

      mockFS.set('/vite-project/index.html', `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8">
    <title>Vite App</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.js"></script>
  </body>
</html>
`);

      mockFS.set('/vite-project/src/main.js', `
import { createApp } from 'vue';
import App from './App.vue';
createApp(App).mount('#app');
`);

      // 建立文件树
      const viteProject = {
        id: 'vite-project',
        name: 'vite-project',
        kind: 'directory',
        path: '/vite-project',
        children: [
          { id: 'package-json', name: 'package.json', kind: 'file', path: '/vite-project/package.json' },
          { id: 'vite-config', name: 'vite.config.js', kind: 'file', path: '/vite-project/vite.config.js' },
          { id: 'index-html', name: 'index.html', kind: 'file', path: '/vite-project/index.html' },
          {
            id: 'src',
            name: 'src',
            kind: 'directory',
            path: '/vite-project/src',
            children: [
              { id: 'main-js', name: 'main.js', kind: 'file', path: '/vite-project/src/main.js' }
            ]
          }
        ]
      };

      fileStore.getState().setFileTree({
        children: [viteProject]
      });

      // 设置当前项目根路径（使用 rootPath 属性）
      fileStore.setState({ rootPath: '/vite-project' });

      console.log('[E2E] Vite project environment set up');
    });

    await page.waitForTimeout(1000);

    // 2. 使用真实 AI 发送消息 "执行vite"
    const config = await getRealAIConfig(page);

    console.log('[Test] 使用真实 AI:', {
      providerId: config.providerId,
      modelId: config.modelId
    });

    // 发送消息
    await page.evaluate(async (payload) => {
      const chatStore = (window as any).__chatStore;
      if (chatStore) {
        await chatStore.getState().sendMessage(payload.text, payload.providerId, payload.modelId);
      }
    }, { text: '执行vite', providerId: config.providerId, modelId: config.modelId });

    // 3. 等待 AI 响应和工具调用
    await page.waitForTimeout(15000);

    // 4. 检查结果
    const result = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      const messages = chatStore ? chatStore.getState().messages : [];

      // 查找所有工具调用
      const toolCalls: any[] = [];
      messages.forEach((m: any) => {
        if (m.toolCalls && Array.isArray(m.toolCalls)) {
          toolCalls.push(...m.toolCalls);
        }
      });

      // 查找 agent_list_dir 工具调用
      const listDirCalls = toolCalls.filter((tc: any) =>
        tc.tool === 'agent_list_dir' || tc.function?.name === 'agent_list_dir'
      );

      // 检查是否有字符数组格式的输出
      let hasCharArrayOutput = false;
      let charArraySample = '';

      messages.forEach((m: any) => {
        if (m.content && typeof m.content === 'string') {
          // 检查是否包含字符数组的特征
          // 例如: [".ifai/","index.html",...] 或者 {0: ".", 1: ".", 2: "i", ...}
          if (m.content.includes('[".","i"]') ||
              m.content.includes('{0: "."}') ||
              m.content.match(/\["\.",\s*"[^"]+",\s*"[^"]+"/)) {
            hasCharArrayOutput = true;
            charArraySample = m.content.substring(0, 200);
          }
        }
      });

      // 检查工具结果
      let toolResults: any[] = [];
      listDirCalls.forEach((tc: any) => {
        if (tc.result) {
          toolResults.push({
            tool: tc.tool,
            result: tc.result,
            resultType: typeof tc.result,
            isArray: Array.isArray(tc.result),
            arrayLength: Array.isArray(tc.result) ? tc.result.length : 0
          });
        }
      });

      // 获取最后几条消息的内容
      const lastMessages = messages.slice(-5).map((m: any) => ({
        role: m.role,
        contentLength: m.content ? m.content.length : 0,
        contentPreview: m.content ? m.content.substring(0, 150) : '',
        hasToolCalls: !!(m.toolCalls && m.toolCalls.length > 0)
      }));

      return {
        totalMessages: messages.length,
        toolCallsCount: toolCalls.length,
        listDirCallsCount: listDirCalls.length,
        toolResults,
        hasCharArrayOutput,
        charArraySample,
        lastMessages
      };
    });

    console.log('[Test] 测试结果:', JSON.stringify(result, null, 2));

    // 5. 验证：不应该有字符数组输出
    expect(result.hasCharArrayOutput,
           '不应该在输出中显示字符数组格式'
    ).toBe(false);

    // 如果有 agent_list_dir 调用，验证其结果格式
    if (result.toolResults && result.toolResults.length > 0) {
      console.log('[Test] agent_list_dir 结果:', result.toolResults);

      // 检查是否所有结果都不是字符数组
      result.toolResults.forEach((tr: any) => {
        if (tr.isArray && tr.arrayLength > 50) {
          // 如果是长数组，可能是字符数组
          // 检查第一个元素是否是单个字符
          console.warn('[Test] 警告: 发现可能的字符数组，长度:', tr.arrayLength);
        }
      });
    }

    console.log('[Test] 测试完成: 真实 AI 场景验证');
  });

  /**
   * 测试用例 2: 真实 AI 场景 - 用户输入 "列出项目文件"
   *
   * 更直接地触发 agent_list_dir
   */
  test('@regression real-ai-char-array-02: 真实 AI 场景 - 列出项目文件不应该显示字符数组', async ({ page }) => {
    console.log('[Test] 开始测试: 真实 AI 场景 - 列出项目文件');

    // 1. 设置项目环境（同上）
    await page.evaluate(async () => {
      const mockFS = (window as any).__E2E_MOCK_FILE_SYSTEM;
      const fileStore = (window as any).__fileStore;

      // 创建测试项目
      mockFS.set('/test-project/package.json', JSON.stringify({
        name: 'test-project',
        version: '1.0.0'
      }, null, 2));

      mockFS.set('/test-project/README.md', '# Test Project');

      const testProject = {
        id: 'test-project',
        name: 'test-project',
        kind: 'directory',
        path: '/test-project',
        children: [
          { id: 'package-json', name: 'package.json', kind: 'file', path: '/test-project/package.json' },
          { id: 'readme', name: 'README.md', kind: 'file', path: '/test-project/README.md' }
        ]
      };

      fileStore.getState().setFileTree({ children: [testProject] });
      fileStore.setState({ rootPath: '/test-project' });
    });

    await page.waitForTimeout(1000);

    // 2. 使用真实 AI 发送消息
    const config = await getRealAIConfig(page);

    await page.evaluate(async (payload) => {
      const chatStore = (window as any).__chatStore;
      if (chatStore) {
        await chatStore.getState().sendMessage(payload.text, payload.providerId, payload.modelId);
      }
    }, { text: '列出项目文件', providerId: config.providerId, modelId: config.modelId });

    // 3. 等待 AI 响应
    await page.waitForTimeout(15000);

    // 4. 检查结果
    const result = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      const messages = chatStore ? chatStore.getState().messages : [];

      // 检查所有消息内容，查找字符数组特征
      let hasCharArrayPattern = false;
      let problematicContent = '';

      for (const m of messages) {
        if (m.content && typeof m.content === 'string') {
          // 检查多种字符数组模式
          const patterns = [
            /\["\.",\s*"[a-z]",\s*"[a-z]"/,  // [".", "i", "n", ...]
            /\{0:\s*"[a-z]",\s*1:\s*"[a-z]"/,  // {0: ".", 1: "i", ...}
            /\[".","i","n","d","e","x"/         // [".", "i", "n", "d", "e", "x"
          ];

          for (const pattern of patterns) {
            if (pattern.test(m.content)) {
              hasCharArrayPattern = true;
              problematicContent = m.content.substring(0, 300);
              break;
            }
          }
        }
      }

      // 检查是否有正常的目录列表显示
      let hasNormalFileList = false;
      for (const m of messages) {
        if (m.content && typeof m.content === 'string') {
          if (m.content.includes('package.json') ||
              m.content.includes('README.md') ||
              m.content.includes('📁')) {
            hasNormalFileList = true;
          }
        }
      }

      // 获取工具调用信息
      const toolCalls: any[] = [];
      messages.forEach((m: any) => {
        if (m.toolCalls) {
          m.toolCalls.forEach((tc: any) => {
            toolCalls.push({
              tool: tc.tool,
              status: tc.status,
              hasResult: !!tc.result
            });
          });
        }
      });

      return {
        hasCharArrayPattern,
        problematicContent,
        hasNormalFileList,
        toolCallsCount: toolCalls.length,
        toolCalls: toolCalls.slice(0, 10)
      };
    });

    console.log('[Test] 测试结果:', result);

    // 验证：不应该有字符数组模式
    expect(result.hasCharArrayPattern,
           '不应该显示字符数组模式'
    ).toBe(false);

    // 应该有正常的文件列表显示
    expect(result.hasNormalFileList,
           '应该显示正常的文件列表'
    ).toBe(true);

    console.log('[Test] 测试完成');
  });

  /**
   * 测试用例 3: 直接模拟 agent_list_dir 返回字符数组
   *
   * 即使后端返回字符数组，前端也应该正确处理
   */
  test('@regression real-ai-char-array-03: 模拟 agent_list_dir 返回字符数组应该被正确处理', async ({ page }) => {
    console.log('[Test] 开始测试: 模拟字符数组处理');

    const result = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      chatStore.setState({ messages: [] });

      // 模拟 agent_list_dir 返回的字符数组（bug 场景）
      const mockCharArrayResult = [
        '.', 'i', 'f', 'a', 'i', '/',
        'i', 'n', 'd', 'e', 'x', '.', 'h', 't', 'm', 'l',
        'n', 'o', 'd', 'e', '_', 'm', 'o', 'd', 'u', 'l', 'e', 's', '/',
        'p', 'a', 'c', 'k', 'a', 'g', 'e', '.', 'j', 's', 'o', 'n'
      ];

      // 使用暴露的格式化函数
      const formatToolResultToMarkdown = (window as any).__formatToolResultToMarkdown;

      if (!formatToolResultToMarkdown) {
        return { error: 'formatToolResultToMarkdown not found' };
      }

      // 格式化字符数组结果
      const formatted = formatToolResultToMarkdown(mockCharArrayResult);

      // 检查结果
      const wasJoined = formatted.includes('.ifai/') ||
                       formatted.includes('index.html') ||
                       formatted.includes('node_modules/');

      const stillCharArray = formatted.includes('[".")') ||
                             formatted.includes('{0: "."') ||
                             formatted.includes('No results');

      return {
        success: true,
        formatted: formatted.substring(0, 500),
        wasJoined,
        stillCharArray,
        originalLength: mockCharArrayResult.length
      };
    });

    console.log('[Test] 字符数组处理结果:', result);

    expect(result.success).toBe(true);
    expect(result.wasJoined,
           '字符数组应该被拼接为有意义的路径'
    ).toBe(true);
    expect(result.stillCharArray,
           '不应该仍然显示为字符数组格式'
    ).toBe(false);

    console.log('[Test] 测试完成');
  });
});
