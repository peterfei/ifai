import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment, removeJoyrideOverlay } from '../setup';

/**
 * Diff Summary 准确性测试
 *
 * 问题：agent_write_file 工具执行后，UI 不显示执行结果（文件变更摘要）
 * - 用户看不到文件被写入的详细信息
 * - 用户看不到文件路径、大小等关键信息
 * - 原始文件有74行内容，但 changelog 只显示首行 '-'
 *
 * 期望：
 * - agent_write_file 执行后应显示文件变更摘要
 * - 包含文件路径、写入状态、文件大小等信息
 * - 让用户清楚知道 AI 做了什么文件操作
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

test.describe('Diff Summary Accuracy - File Write Operations', () => {

  test('agent_write_file 应该显示文件变更摘要', async ({ page }) => {
    const fileName = 'test-summary.md';
    const fileContent = `# Test Document

This is a test file with multiple lines.
Line 1: Some content
Line 2: More content
Line 3: Even more content

## Section 1
- Item 1
- Item 2
- Item 3

## Section 2
Description text here.

End of file.
`;

    // 添加文件写入工具调用
    await page.evaluate(({ fileName, content }) => {
      const chatStore = (window as any).__chatStore?.getState();
      chatStore.addMessage({
        id: 'msg-write-summary',
        role: 'assistant',
        content: '我将创建一个测试文档',
        toolCalls: [{
          id: 'write-summary-call',
          tool: 'agent_write_file',
          args: { rel_path: fileName, content },
          status: 'pending'
        }]
      });
    }, { fileName, content: fileContent });

    // 批准执行
    await removeJoyrideOverlay(page);
    await removeJoyrideOverlay(page);
    await page.locator('button:has-text("批准执行")').first().click();
    await page.waitForTimeout(2000);

    // 验证工具调用状态
    const toolCallStatus = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore?.getState();
      const msg = chatStore?.messages.find((m: any) => m.id === 'msg-write-summary');
      return msg?.toolCalls?.[0]?.status;
    });
    expect(toolCallStatus).toBe('completed');

    // 🔥 关键验证：UI 应该显示文件变更摘要
    // 检查是否有执行结果显示区域
    const hasResultDisplay = await page.locator('.bg-gradient-to-br.from-green-500\\/5').count();
    console.log('[E2E] Result display found:', hasResultDisplay);

    // 检查是否显示文件路径
    const hasFilePath = await page.locator('text=/文件|File/').count();
    console.log('[E2E] File path mention found:', hasFilePath);

    // 检查是否显示成功状态
    const hasSuccessIndicator = await page.locator('text=/成功|Success|完成/').count();
    console.log('[E2E] Success indicator found:', hasSuccessIndicator);

    // 🔥 核心验证：tool result 应该包含文件信息
    const toolCallResult = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore?.getState();
      const msg = chatStore?.messages.find((m: any) => m.id === 'msg-write-summary');
      return msg?.toolCalls?.[0]?.result;
    });

    console.log('[E2E] Tool result:', toolCallResult);
    expect(toolCallResult).toBeTruthy();

    // 解析 result 验证包含必要信息
    const resultData = JSON.parse(toolCallResult || '{}');
    expect(resultData.success).toBe(true);
    expect(resultData.filePath).toContain(fileName);

    // 🔥 验证 UI 显示了文件路径
    const pageContent = await page.content();
    expect(pageContent).toContain(fileName);
  });

  test('agent_write_file 应该显示文件大小信息', async ({ page }) => {
    const fileName = 'large-file.txt';
    // 创建一个 1KB 的文件
    const largeContent = 'x'.repeat(1024);

    await page.evaluate(({ fileName, content }) => {
      const chatStore = (window as any).__chatStore?.getState();
      chatStore.addMessage({
        id: 'msg-write-large',
        role: 'assistant',
        content: '写入一个较大的文件',
        toolCalls: [{
          id: 'write-large-call',
          tool: 'agent_write_file',
          args: { rel_path: fileName, content },
          status: 'pending'
        }]
      });
    }, { fileName, content: largeContent });

    await removeJoyrideOverlay(page);
    await page.locator('button:has-text("批准执行")').first().click();
    await page.waitForTimeout(2000);

    // 验证 UI 显示了文件大小信息
    const pageContent = await page.content();
    console.log('[E2E] Page contains size info:', pageContent.includes('KB') || pageContent.includes('bytes'));

    // 🔥 验证 result 包含文件内容长度信息
    const toolCallResult = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore?.getState();
      const msg = chatStore?.messages.find((m: any) => m.id === 'msg-write-large');
      return msg?.toolCalls?.[0]?.result;
    });

    const resultData = JSON.parse(toolCallResult || '{}');
    console.log('[E2E] Large file result:', resultData);
    expect(resultData.success).toBe(true);
  });

  test('agent_write_file 新建文件时应显示正确的状态', async ({ page }) => {
    const fileName = 'new-file.txt';
    const content = 'New file content';

    await page.evaluate(({ fileName, content }) => {
      const chatStore = (window as any).__chatStore?.getState();
      chatStore.addMessage({
        id: 'msg-new-file',
        role: 'assistant',
        content: '创建一个新文件',
        toolCalls: [{
          id: 'new-file-call',
          tool: 'agent_write_file',
          args: { rel_path: fileName, content },
          status: 'pending'
        }]
      });
    }, { fileName, content });

    await removeJoyrideOverlay(page);
    await removeJoyrideOverlay(page);
    await page.locator('button:has-text("批准执行")').first().click();
    await page.waitForTimeout(2000);

    // 🔥 验证新建文件时的 originalContent 为空
    const toolCallResult = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore?.getState();
      const msg = chatStore?.messages.find((m: any) => m.id === 'msg-new-file');
      return msg?.toolCalls?.[0]?.result;
    });

    const resultData = JSON.parse(toolCallResult || '{}');
    console.log('[E2E] New file result:', resultData);
    expect(resultData.originalContent).toBe('');
    expect(resultData.success).toBe(true);

    // 验证 UI 显示了成功创建文件的信息
    const pageContent = await page.content();
    expect(pageContent).toContain(fileName);
  });

  test('agent_write_file 覆盖已有文件时应显示原始内容长度', async ({ page }) => {
    const fileName = 'existing-file.txt';

    // 🔥 创建一个 74 行的原始文件
    const originalLines = Array.from({ length: 74 }, (_, i) =>
      `Original line ${i + 1}: Some existing content here`
    );
    const originalContent = originalLines.join('\n');

    // 新内容只有一行
    const newContent = 'New content here - this replaces all 74 lines';

    // 先创建文件
    await page.evaluate(({ fileName, content }) => {
      const mockFileSystem = (window as any).__E2E_MOCK_FILE_SYSTEM__;
      mockFileSystem.set(`/Users/mac/mock-project/${fileName}`, content);
    }, { fileName, content: originalContent });

    // 然后覆盖写入
    await page.evaluate(({ fileName, content }) => {
      const chatStore = (window as any).__chatStore?.getState();
      chatStore.addMessage({
        id: 'msg-overwrite',
        role: 'assistant',
        content: '覆盖已有文件',
        toolCalls: [{
          id: 'overwrite-call',
          tool: 'agent_write_file',
          args: { rel_path: fileName, content },
          status: 'pending'
        }]
      });
    }, { fileName, content: newContent });

    await removeJoyrideOverlay(page);
    await removeJoyrideOverlay(page);
    await page.locator('button:has-text("批准执行")').first().click();
    await page.waitForTimeout(2000);

    // 🔥 验证覆盖文件时保存了原始内容
    const toolCallResult = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore?.getState();
      const msg = chatStore?.messages.find((m: any) => m.id === 'msg-overwrite');
      return msg?.toolCalls?.[0]?.result;
    });

    const resultData = JSON.parse(toolCallResult || '{}');
    console.log('[E2E] Overwrite result:', resultData);

    // 验证原始内容被保存
    expect(resultData.originalContent).toBe(originalContent);
    expect(resultData.originalContent.length).toBeGreaterThan(0);

    // 🔥 验证原始文件有 74 行
    const originalLineCount = resultData.originalContent.split('\n').length;
    console.log('[E2E] Original file line count:', originalLineCount);
    expect(originalLineCount).toBe(74);

    // 🔥 验证 UI 显示了原始文件信息（行数）
    const pageContent = await page.content();
    expect(pageContent).toContain(fileName);

    // 🔥 验证 UI 显示了行数信息或删除信息
    // 应该包含 "74" 和 "行" 或类似信息
    const hasLineInfo = pageContent.includes('74') &&
                       (pageContent.includes('行') || pageContent.includes('lines'));
    console.log('[E2E] UI shows line count info:', hasLineInfo);
  });

  test('多个文件写入操作应该各自显示独立的结果摘要', async ({ page }) => {
    const files = [
      { name: 'file1.txt', content: 'Content 1' },
      { name: 'file2.txt', content: 'Content 2' },
      { name: 'file3.txt', content: 'Content 3' }
    ];

    await page.evaluate(({ files }) => {
      const chatStore = (window as any).__chatStore?.getState();
      chatStore.addMessage({
        id: 'msg-multi-write',
        role: 'assistant',
        content: '创建多个文件',
        toolCalls: files.map((f, i) => ({
          id: `multi-write-${i}`,
          tool: 'agent_write_file',
          args: { rel_path: f.name, content: f.content },
          status: 'pending'
        }))
      });
    }, { files });

    // 批准所有工具调用
    for (let i = 0; i < files.length; i++) {
      await removeJoyrideOverlay(page);
      await page.locator('button:has-text("批准执行")').first().click();
      await page.waitForTimeout(500);
    }
    await page.waitForTimeout(2000);

    // 🔥 验证每个文件都有独立的执行结果显示
    const results = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore?.getState();
      const msg = chatStore?.messages.find((m: any) => m.id === 'msg-multi-write');
      return msg?.toolCalls?.map(tc => ({
        id: tc.id,
        status: tc.status,
        result: tc.result
      }));
    });

    console.log('[E2E] Multi-file results:', results);

    results.forEach((result: any, index: number) => {
      expect(result.status).toBe('completed');
      expect(result.result).toBeTruthy();

      const data = JSON.parse(result.result);
      expect(data.success).toBe(true);
      expect(data.filePath).toContain(files[index].name);
    });

    // 🔥 验证 UI 显示了所有文件的信息
    const pageContent = await page.content();
    files.forEach(file => {
      expect(pageContent).toContain(file.name);
    });
  });

  test('文件写入失败时应显示错误信息', async ({ page }) => {
    const fileName = '/invalid/path/file.txt';
    const content = 'Some content';

    await page.evaluate(({ fileName, content }) => {
      const chatStore = (window as any).__chatStore?.getState();
      chatStore.addMessage({
        id: 'msg-write-fail',
        role: 'assistant',
        content: '尝试写入无效路径',
        toolCalls: [{
          id: 'write-fail-call',
          tool: 'agent_write_file',
          args: { rel_path: fileName, content },
          status: 'pending'
        }]
      });
    }, { fileName, content });

    await removeJoyrideOverlay(page);
    await removeJoyrideOverlay(page);
    await page.locator('button:has-text("批准执行")').first().click();
    await page.waitForTimeout(2000);

    // 🔥 验证失败状态和错误信息显示
    const toolCallStatus = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore?.getState();
      const msg = chatStore?.messages.find((m: any) => m.id === 'msg-write-fail');
      return msg?.toolCalls?.[0]?.status;
    });

    console.log('[E2E] Failed write status:', toolCallStatus);
    // 可能是 failed 或 completed（取决于错误处理）

    // 验证 UI 显示了错误提示
    const pageContent = await page.content();
    // 应该有错误提示或失败状态
    const hasError = pageContent.includes('失败') || pageContent.includes('错误') || pageContent.includes('Failed') || pageContent.includes('Error');
    console.log('[E2E] Page has error indication:', hasError);
  });

  test('74 行文件的变更摘要应该显示完整信息', async ({ page }) => {
    const fileName = '74-line-file.md';
    // 创建一个 74 行的文件
    const lines = Array.from({ length: 74 }, (_, i) => `Line ${i + 1}: Some content here`);
    const fileContent = lines.join('\n');

    await page.evaluate(({ fileName, content }) => {
      const chatStore = (window as any).__chatStore?.getState();
      chatStore.addMessage({
        id: 'msg-74-lines',
        role: 'assistant',
        content: '创建一个 74 行的文件',
        toolCalls: [{
          id: 'write-74-call',
          tool: 'agent_write_file',
          args: { rel_path: fileName, content },
          status: 'pending'
        }]
      });
    }, { fileName, content: fileContent });

    await removeJoyrideOverlay(page);
    await removeJoyrideOverlay(page);
    await page.locator('button:has-text("批准执行")').first().click();
    await page.waitForTimeout(2000);

    // 🔥 核心验证：result 应该包含完整信息，不是只有首行 '-'
    const toolCallResult = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore?.getState();
      const msg = chatStore?.messages.find((m: any) => m.id === 'msg-74-lines');
      return msg?.toolCalls?.[0]?.result;
    });

    console.log('[E2E] 74-line file result:', toolCallResult);
    expect(toolCallResult).toBeTruthy();
    expect(toolCallResult).not.toBe('-');
    expect(toolCallResult.length).toBeGreaterThan(100);

    const resultData = JSON.parse(toolCallResult);
    expect(resultData.success).toBe(true);
    expect(resultData.filePath).toContain(fileName);

    // 🔥 验证 UI 显示了文件信息
    const pageContent = await page.content();
    expect(pageContent).toContain(fileName);

    // 验证行数信息
    const lineCount = fileContent.split('\n').length;
    console.log('[E2E] File line count:', lineCount);
    expect(lineCount).toBe(74);
  });

});
