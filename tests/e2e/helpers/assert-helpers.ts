import { Page, expect, Locator } from '@playwright/test';

/**
 * E2E测试断言辅助函数
 * 提供语义化的断言方法，改善测试可读性
 */

/**
 * 断言消息内容存在
 * @param page Playwright Page对象
 * @param expected 期望的内容（字符串或正则表达式）
 */
export async function assertMessageContent(
  page: Page,
  expected: string | RegExp
): Promise<void> {
  const messageSelector = '[data-testid="message-content"], .message-content, .markdown-content';
  const messages = page.locator(messageSelector);

  const count = await messages.count();
  let found = false;

  for (let i = 0; i < count; i++) {
    const text = await messages.nth(i).textContent();
    if (typeof expected === 'string') {
      if (text?.includes(expected)) {
        found = true;
        break;
      }
    } else {
      if (expected.test(text || '')) {
        found = true;
        break;
      }
    }
  }

  if (!found) {
    const allText = await messages.allTextContents();
    throw new Error(
      `Expected message content "${expected}" not found.\n` +
      `Actual messages:\n${allText.join('\n---\n')}`
    );
  }
}

/**
 * 断言消息数量
 * @param page Playwright Page对象
 * @param expectedCount 期望的消息数量
 */
export async function assertMessageCount(
  page: Page,
  expectedCount: number
): Promise<void> {
  const messageSelector = '[data-testid="message"], .message-item';
  const messages = page.locator(messageSelector);

  const actualCount = await messages.count();

  expect(actualCount, `Expected ${expectedCount} messages, but found ${actualCount}`).toBe(
    expectedCount
  );
}

/**
 * 断言编辑器状态
 * @param page Playwright Page对象
 * @param expectedState 期望的编辑器状态
 */
export async function assertEditorState(
  page: Page,
  expectedState: {
    content?: string | RegExp;
    readOnly?: boolean;
    language?: string;
  }
): Promise<void> {
  if (expectedState.content !== undefined) {
    const editorContent = await page.evaluate(() => {
      const monaco = (window as any).monaco;
      if (monaco?.editor?.getModels?.().length > 0) {
        return monaco.editor.getModels()[0].getValue();
      }
      return null;
    });

    if (typeof expectedState.content === 'string') {
      expect(editorContent).toContain(expectedState.content);
    } else {
      expect(editorContent).toMatch(expectedState.content);
    }
  }

  if (expectedState.readOnly !== undefined) {
    const readOnly = await page.evaluate(() => {
      const monaco = (window as any).monaco;
      if (monaco?.editor?.getEditors?.().length > 0) {
        return monaco.editor.getEditors()[0].getOption(
          (monaco.editor as any).EditorOption.readOnly
        );
      }
      return null;
    });

    expect(readOnly, `Editor readOnly should be ${expectedState.readOnly}`).toBe(
      expectedState.readOnly
    );
  }
}

/**
 * 断言Agent执行结果
 * @param page Playwright Page对象
 * @param expected 期望的结果
 */
export async function assertAgentResult(
  page: Page,
  expected: {
    status?: 'running' | 'completed' | 'failed';
    containsMessage?: string;
    toolCalls?: number;
  }
): Promise<void> {
  if (expected.status) {
    const statusSelector = `[data-status="${expected.status}"], .agent-status.${expectedStatus}`;
    const statusElement = page.locator(statusSelector);

    await expect(statusElement.first(), `Agent status should be ${expectedStatus}`).toBeVisible();
  }

  if (expected.containsMessage) {
    await assertMessageContent(page, expected.containsMessage);
  }

  if (expected.toolCalls !== undefined) {
    const toolCallSelector = '[data-testid="tool-call"], .tool-call';
    const toolCalls = page.locator(toolCallSelector);

    const actualCount = await toolCalls.count();
    expect(
      actualCount,
      `Expected ${expected.toolCalls} tool calls, but found ${actualCount}`
    ).toBe(expected.toolCalls);
  }
}

/**
 * 断言元素可见性
 * @param locator 元素定位器
 * @param visible 是否可见
 */
export async function assertVisible(
  locator: Locator,
  visible: boolean = true
): Promise<void> {
  if (visible) {
    await expect(locator.first()).toBeVisible();
  } else {
    await expect(locator.first()).not.toBeVisible();
  }
}

/**
 * 断言元素存在性
 * @param locator 元素定位器
 * @param exists 是否存在
 */
export async function assertExists(
  locator: Locator,
  exists: boolean = true
): Promise<void> {
  const count = await locator.count();

  if (exists) {
    expect(count, 'Element should exist').toBeGreaterThan(0);
  } else {
    expect(count, 'Element should not exist').toBe(0);
  }
}

/**
 * 断言元素文本内容
 * @param locator 元素定位器
 * @param expected 期望的文本
 */
export async function assertText(
  locator: Locator,
  expected: string | RegExp
): Promise<void> {
  const text = await locator.first().textContent();

  if (typeof expected === 'string') {
    expect(text, `Expected text "${expected}", but found "${text}"`).toContain(expected);
  } else {
    expect(text, `Text should match pattern ${expected}`).toMatch(expected);
  }
}

/**
 * 断言元素属性
 * @param locator 元素定位器
 * @param attribute 属性名
 * @param expected 期望的属性值
 */
export async function assertAttribute(
  locator: Locator,
  attribute: string,
  expected: string | RegExp
): Promise<void> {
  const attrValue = await locator.first().getAttribute(attribute);

  if (attrValue === null) {
    throw new Error(`Attribute "${attribute}" not found on element`);
  }

  if (typeof expected === 'string') {
    expect(attrValue, `Expected attribute "${attribute}" to be "${expected}", but found "${attrValue}"`)
      .toBe(expected);
  } else {
    expect(attrValue, `Attribute "${attribute}" should match pattern ${expected}`).toMatch(
      expected
    );
  }
}

/**
 * 断言文件已打开
 * @param page Playwright Page对象
 * @param fileName 文件名
 */
export async function assertFileOpen(
  page: Page,
  fileName: string
): Promise<void> {
  const tabSelector = '[data-testid="file-tab"], .editor-tab, .tab';
  const tabs = page.locator(tabSelector);

  const found = await tabs.filter({ hasText: fileName }).count();

  expect(found, `File "${fileName}" should be open`).toBeGreaterThan(0);
}

/**
 * 断言文件在树中存在
 * @param page Playwright Page对象
 * @param fileName 文件名
 */
export async function assertFileInTree(
  page: Page,
  fileName: string
): Promise<void> {
  const fileSelector = '[data-testid*="file"], .file-item, .tree-file';
  const files = page.locator(fileSelector);

  const found = await files.filter({ hasText: fileName }).count();

  expect(found, `File "${fileName}" should exist in tree`).toBeGreaterThan(0);
}

/**
 * 断言输入框状态
 * @param page Playwright Page对象
 * @param enabled 是否启用
 */
export async function assertInputEnabled(
  page: Page,
  enabled: boolean = true
): Promise<void> {
  const inputSelector = 'textarea[placeholder*="发送"], textarea[placeholder*="Ask"], [data-testid="chat-input"]';
  const input = page.locator(inputSelector);

  if (enabled) {
    await expect(input.first()).toBeEnabled();
  } else {
    await expect(input.first()).toBeDisabled();
  }
}

/**
 * 断言Pro标识显示
 * @param page Playwright Page对象
 * @param visible 是否可见
 */
export async function assertProBadgeVisible(
  page: Page,
  visible: boolean = true
): Promise<void> {
  const proSelector = '[data-testid="pro-badge"], .pro-badge, .badge-pro';
  const proBadge = page.locator(proSelector);

  const count = await proBadge.count();

  if (visible) {
    expect(count, 'Pro badge should be visible').toBeGreaterThan(0);
  } else {
    expect(count, 'Pro badge should not be visible').toBe(0);
  }
}

/**
 * 断言版本号显示
 * @param page Playwright Page对象
 * @param version 期望的版本号
 */
export async function assertVersionDisplayed(
  page: Page,
  version: string
): Promise<void> {
  const versionSelector = '[data-testid="version"], .version, .app-version';
  const versionElement = page.locator(versionSelector);

  await assertText(versionElement, version);
}

/**
 * 断言布局切换
 * @param page Playwright Page对象
 * @param layoutType 布局类型
 */
export async function assertLayout(
  page: Page,
  layoutType: 'default' | 'custom' | 'compact'
): Promise<void> {
  const layoutSelector = `[data-layout="${layoutType}"], .layout-${layoutType}`;
  const layoutElement = page.locator(layoutSelector);

  await expect(layoutElement.first()).toBeVisible();
}

/**
 * 断言Toast消息
 * @param page Playwright Page对象
 * @param message 消息内容
 */
export async function assertToast(
  page: Page,
  message: string | RegExp
): Promise<void> {
  const toastSelector = '[data-testid="toast"], .toast, .notification';
  const toast = page.locator(toastSelector);

  await expect(toast.first()).toBeVisible();
  await assertText(toast, message);
}

/**
 * 断言对话框显示
 * @param page Playwright Page对象
 * @param title 对话框标题
 */
export async function assertDialog(
  page: Page,
  title?: string
): Promise<void> {
  const dialogSelector = '.dialog, .modal, [role="dialog"], [data-testid="dialog"]';
  const dialog = page.locator(dialogSelector);

  await expect(dialog.first()).toBeVisible();

  if (title) {
    const titleSelector = '.dialog-title, .modal-title, [data-testid="dialog-title"]';
    const titleElement = dialog.locator(titleSelector);

    await assertText(titleElement, title);
  }
}

/**
 * 断言控制台无错误
 * @param page Playwright Page对象
 */
export async function assertNoConsoleErrors(page: Page): Promise<void> {
  const errors: string[] = [];

  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });

  // 等待一小段时间，收集可能的错误
  await page.waitForTimeout(500);

  if (errors.length > 0) {
    throw new Error(`Console errors detected:\n${errors.join('\n')}`);
  }
}
