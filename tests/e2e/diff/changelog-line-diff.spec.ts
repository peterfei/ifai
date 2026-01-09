import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

/**
 * CHANGELOG 行级别 diff 测试
 *
 * 真实场景：
 * - 原始文件有多行 changelog 内容
 * - AI 修改了其中某些行（比如版本号从 "1" 改成 "2"）
 * - 期望显示行级别的 diff，比如：
 *   - -1 最新版本 v6.3.x:
 *   - +2 最新版本 v6.3.x:
 */

test.beforeEach(async ({ page }) => {
  page.on('console', msg => {
    const text = msg.text();
    const type = msg.type();
    if (type === 'error') {
      console.log('[Browser Error]', text);
    } else if (text.includes('[E2E]') || text.includes('[Chat]') || text.includes('[useChatStore]')) {
      console.log('[Browser]', text);
    }
  });

  await setupE2ETestEnvironment(page);
  await page.goto('/');
  await page.waitForTimeout(5000);

  // 打开聊天面板
  await page.evaluate(() => {
    const layoutStore = (window as any).__layoutStore;
    if (layoutStore && !layoutStore.getState().isChatOpen) {
      layoutStore.getState().toggleChat();
    }
  });
  await page.waitForTimeout(2000);

  // 等待 store 可用
  for (let i = 0; i < 3; i++) {
    await page.waitForTimeout(2000);
    const hasChatStore = await page.evaluate(() => {
      const store = (window as any).__chatStore;
      return store && typeof store.getState === 'function';
    });
    if (hasChatStore) break;
  }
});

test.describe('CHANGELOG Line-level Diff', () => {

  test('应该显示行级别的变更（版本号修改）', async ({ page }) => {
    const fileName = 'CHANGELOG.md';

    // 原始内容（模拟真实的 changelog）
    const originalContent = `1 最新版本 v6.3.x:
2 功能新增：HTML编辑器升级、数据中心导出Excel、内容管理置顶、服务管理调试
3 流程管理：新增onlyoffice、wps、金格、永中控件及LibreOffice预览
4 移动办公：新增微信公众号、企业微信考勤导入、通讯录权限控制
5 数据库：新增南大通用GBASE支持，新增服务器http request access log
6 流程平台：新增起草权限、公文编辑器加密/盖章/版记等多项功能
7 平台架构：新增审计日志分析、主菜单排序、ElementUI组件
8 功能优化：优化考勤、脚本API、内容管理、移动端、服务器缓存等模块
9 问题修复：修复流程管理、内容管理、移动办公、流程引擎等模块bug
10 平台优化：基于Authorization请求头的系统认证，修复Promise错误
11 [流程管理]新增了LibreOffice预览
12 [人员组织]新增了人员组织管理模块接口mockput和mockdelete`;

    // 新内容（AI 修改了版本号）
    const newContent = `2 最新版本 v6.3.x:
3 功能新增：HTML编辑器升级、数据中心导出Excel、内容管理置顶、服务管理调试
4 流程管理：新增onlyoffice、wps、金格、永中控件及LibreOffice预览
5 移动办公：新增微信公众号、企业微信考勤导入、通讯录权限控制
6 数据库：新增南大通用GBASE支持，新增服务器http request access log
7 流程平台：新增起草权限、公文编辑器加密/盖章/版记等多项功能
8 平台架构：新增审计日志分析、主菜单排序、ElementUI组件
9 功能优化：优化考勤、脚本API、内容管理、移动端、服务器缓存等模块
10 问题修复：修复流程管理、内容管理、移动办公、流程引擎等模块bug
11 平台优化：基于Authorization请求头的系统认证，修复Promise错误
12 [流程管理]新增了LibreOffice预览`;

    // 先创建原始文件
    await page.evaluate(({ fileName, content }) => {
      const mockFileSystem = (window as any).__E2E_MOCK_FILE_SYSTEM__;
      mockFileSystem.set(`/Users/mac/mock-project/${fileName}`, content);
    }, { fileName, content: originalContent });

    // 然后 AI 修改文件
    await page.evaluate(({ fileName, content }) => {
      const chatStore = (window as any).__chatStore?.getState();
      chatStore.addMessage({
        id: 'msg-changelog-update',
        role: 'assistant',
        content: '更新 CHANGELOG 版本号',
        toolCalls: [{
          id: 'changelog-update-call',
          tool: 'agent_write_file',
          args: { rel_path: fileName, content },
          status: 'pending'
        }]
      });
    }, { fileName, content: newContent });

    // 批准执行
    await page.locator('button:has-text("批准执行")').first().click();
    await page.waitForTimeout(2000);

    // 验证工具调用状态
    const toolCallStatus = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore?.getState();
      const msg = chatStore?.messages.find((m: any) => m.id === 'msg-changelog-update');
      return msg?.toolCalls?.[0]?.status;
    });
    expect(toolCallStatus).toBe('completed');

    // 🔥 核心验证：检查 diff 结果
    const toolCallResult = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore?.getState();
      const msg = chatStore?.messages.find((m: any) => m.id === 'msg-changelog-update');
      return msg?.toolCalls?.[0]?.result;
    });

    const resultData = JSON.parse(toolCallResult || '{}');
    console.log('[E2E] Changelog result:', resultData);
    expect(resultData.success).toBe(true);

    // 🔥 验证 UI 显示了行级别的 diff（智能diff：只显示真正变化的内容）
    const formattedOutput = await page.evaluate(() => {
      const formatToolResultToMarkdown = (window as any).__formatToolResultToMarkdown;
      if (!formatToolResultToMarkdown) return 'formatToolResultToMarkdown not found';

      const chatStore = (window as any).__chatStore?.getState();
      const msg = chatStore?.messages.find((m: any) => m.id === 'msg-changelog-update');
      const toolCall = msg?.toolCalls?.[0];

      if (!toolCall?.result) return 'No result';

      try {
        const result = JSON.parse(toolCall.result);
        return formatToolResultToMarkdown(result, toolCall);
      } catch (e) {
        return 'Error: ' + String(e);
      }
    });

    console.log('[E2E] Formatted output:', formattedOutput);

    // 🔥 验证智能diff：只显示真正删除的内容（第12行）
    expect(formattedOutput).toContain('**🗑️ 被删除内容** (共 1 行):');
    expect(formattedOutput).toContain('-12 [人员组织]新增了人员组织管理模块接口mockput和mockdelete');

    // 🔥 不应该显示所有行的删除+新增（智能diff会过滤掉只是行号变化的内容）
    expect(formattedOutput).not.toContain('-1 最新版本 v6.3.x:');
    expect(formattedOutput).not.toContain('+2 最新版本 v6.3.x:');

    console.log('[E2E] ✅ Smart line-level diff correctly displayed');
  });

  test('应该显示部分行修改的 diff', async ({ page }) => {
    const fileName = 'partial-change.md';

    // 原始内容
    const originalContent = `Line 1: Keep this
Line 2: Modify this line
Line 3: Keep this too
Line 4: Also modify this
Line 5: Last line unchanged`;

    // 新内容（只修改第2行和第4行）
    const newContent = `Line 1: Keep this
Line 2: MODIFIED - this line changed
Line 3: Keep this too
Line 4: MODIFIED - this also changed
Line 5: Last line unchanged`;

    // 先创建原始文件
    await page.evaluate(({ fileName, content }) => {
      const mockFileSystem = (window as any).__E2E_MOCK_FILE_SYSTEM__;
      mockFileSystem.set(`/Users/mac/mock-project/${fileName}`, content);
    }, { fileName, content: originalContent });

    // 然后修改
    await page.evaluate(({ fileName, content }) => {
      const chatStore = (window as any).__chatStore?.getState();
      chatStore.addMessage({
        id: 'msg-partial-change',
        role: 'assistant',
        content: '修改部分行',
        toolCalls: [{
          id: 'partial-change-call',
          tool: 'agent_write_file',
          args: { rel_path: fileName, content },
          status: 'pending'
        }]
      });
    }, { fileName, content: newContent });

    await page.locator('button:has-text("批准执行")').first().click();
    await page.waitForTimeout(2000);

    // 🔥 验证行级别 diff（检查格式化函数输出）
    // 使用 page.evaluate() 返回 JSON 对象，避免长字符串被截断
    const diffCheck = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore?.getState();
      const msg = chatStore?.messages.find((m: any) => m.id === 'msg-partial-change');
      const toolCall = msg?.toolCalls?.[0];

      if (!toolCall?.result) return { error: 'No result' };

      try {
        const result = JSON.parse(toolCall.result);

        // 🔥 直接检查是否包含预期的内容，而不是返回整个输出
        const hasOriginalContent = result.originalContent !== undefined;
        const hasNewContent = result.newContent !== undefined || toolCall.args?.content !== undefined;

        // 调用格式化函数并检查输出
        const formatToolResultToMarkdown = (window as any).__formatToolResultToMarkdown;
        if (!formatToolResultToMarkdown) return { error: 'formatToolResultToMarkdown not found' };

        const output = formatToolResultToMarkdown(result, toolCall);

        return {
          hasOriginalContent,
          hasNewContent,
          outputLength: output.length,
          hasDeletedContent: output.includes('被删除内容'),
          hasAddedContent: output.includes('新增内容'),
          hasRemovedLine2: output.includes('- Line 2: Modify this line'),
          hasRemovedLine4: output.includes('- Line 4: Also modify this'),
          hasAddedLine2: output.includes('+ Line 2: MODIFIED'),
          hasAddedLine4: output.includes('+ Line 4: MODIFIED'),
          outputPreview: output.substring(0, 500)
        };
      } catch (e) {
        console.log('[E2E] [Browser] Error:', String(e));
        return { error: String(e) };
      }
    });

    console.log('[E2E] Diff check result:', diffCheck);

    // 验证格式化输出包含预期内容
    expect(diffCheck.hasDeletedContent).toBe(true);
    expect(diffCheck.hasAddedContent).toBe(true);
    expect(diffCheck.hasRemovedLine2).toBe(true);
    expect(diffCheck.hasRemovedLine4).toBe(true);
    expect(diffCheck.hasAddedLine2).toBe(true);
    expect(diffCheck.hasAddedLine4).toBe(true);

    console.log('[E2E] ✅ Partial line change diff correctly displayed');
  });

});
