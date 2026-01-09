import { Page, Locator } from '@playwright/test';

/**
 * E2E测试等待辅助函数
 * 提供统一的等待逻辑，减少测试代码重复
 */

/**
 * 等待聊天组件就绪
 * @param page Playwright Page对象
 * @param options 可选配置
 */
export async function waitForChatReady(
  page: Page,
  options: { timeout?: number } = {}
): Promise<void> {
  const { timeout = 10000 } = options;

  // 等待聊天输入框可见
  await page.waitForSelector('textarea[placeholder*="发送"], textarea[placeholder*="Ask"], [data-testid="chat-input"]', {
    state: 'visible',
    timeout
  });

  // 等待消息容器附加到DOM
  await page.waitForSelector('[data-testid="chat-messages"], .messages-container, .message-list', {
    state: 'attached',
    timeout
  });

  // 等待一小段时间确保动画完成
  await page.waitForTimeout(100);
}

/**
 * 等待编辑器就绪
 * @param page Playwright Page对象
 * @param options 可选配置
 */
export async function waitForEditorReady(
  page: Page,
  options: { timeout?: number } = {}
): Promise<void> {
  const { timeout = 10000 } = options;

  // 等待Monaco编辑器加载
  await page.waitForSelector('.monaco-editor, [data-testid="editor"], .editor-container', {
    state: 'visible',
    timeout
  });

  // 等待编辑器内容区域
  await page.waitForSelector('.view-line, .monaco-editor .view-lines', {
    state: 'attached',
    timeout
  });

  await page.waitForTimeout(100);
}

/**
 * 等待Agent执行完成
 * @param page Playwright Page对象
 * @param options 可选配置
 */
export async function waitForAgentComplete(
  page: Page,
  options: { timeout?: number; agentId?: string } = {}
): Promise<void> {
  const { timeout = 30000 } = options;

  // 等待Agent状态变为完成
  await page.waitForSelector(
    '[data-status="completed"], .agent-status.completed, [data-testid="agent-complete"]',
    {
      state: 'visible',
      timeout
    }
  );

  await page.waitForTimeout(200);
}

/**
 * 等待消息出现
 * @param page Playwright Page对象
 * @param content 消息内容（字符串或正则表达式）
 * @param options 可选配置
 */
export async function waitForMessage(
  page: Page,
  content: string | RegExp,
  options: { timeout?: number } = {}
): Promise<void> {
  const { timeout = 10000 } = options;

  const messageSelector = '[data-testid="message-content"], .message-content, .markdown-content';

  await page.waitForSelector(messageSelector, {
    state: 'visible',
    timeout
  });

  // 等待特定内容出现
  await page.waitForFunction(
    ({ selector, text } : { selector: string, text: string | RegExp }) => {
      const elements = document.querySelectorAll(selector);
      return Array.from(elements).some(el => {
        const content = el.textContent || '';
        if (typeof text === 'string') {
          return content.includes(text);
        }
        return text.test(content);
      });
    },
    { selector: messageSelector, text: content },
    { timeout }
  );
}

/**
 * 等待加载状态结束
 * @param page Playwright Page对象
 * @param options 可选配置
 */
export async function waitForLoading(
  page: Page,
  options: { timeout?: number } = {}
): Promise<void> {
  const { timeout = 15000 } = options;

  // 等待加载指示器消失
  const loadingSelector = '.loading, .spinner, [data-testid="loading"]';

  try {
    await page.waitForSelector(loadingSelector, {
      state: 'attached',
      timeout: 1000
    });

    await page.waitForSelector(loadingSelector, {
      state: 'hidden',
      timeout
    });
  } catch {
    // 如果没有加载指示器，认为已加载完成
  }
}

/**
 * 等待文件在文件树中出现
 * @param page Playwright Page对象
 * @param fileName 文件名
 * @param options 可选配置
 */
export async function waitForFileInTree(
  page: Page,
  fileName: string,
  options: { timeout?: number } = {}
): Promise<void> {
  const { timeout = 5000 } = options;

  await page.waitForFunction(
    ({ name } : { name: string }) => {
      const elements = document.querySelectorAll('[data-testid*="file"], .file-item, .tree-file');
      return Array.from(elements).some(el => {
        return el.textContent?.includes(name);
      });
    },
    { name: fileName },
    { timeout }
  );
}

/**
 * 等待对话框关闭
 * @param page Playwright Page对象
 * @param options 可选配置
 */
export async function waitForDialogClose(
  page: Page,
  options: { timeout?: number } = {}
): Promise<void> {
  const { timeout = 5000 } = options;

  await page.waitForSelector(
    '.dialog, .modal, [role="dialog"], [data-testid="dialog"]',
    {
      state: 'hidden',
      timeout
    }
  );
}

/**
 * 等待元素稳定（位置和大小不再变化）
 * @param locator 元素定位器
 * @param options 可选配置
 */
export async function waitForStablePosition(
  locator: Locator,
  options: { timeout?: number; stabilityDuration?: number } = {}
): Promise<void> {
  const { timeout = 5000, stabilityDuration = 500 } = options;

  const startTime = Date.now();
  let lastBoundingBox = await locator.boundingBox();

  while (Date.now() - startTime < timeout) {
    await locator.page().waitForTimeout(stabilityDuration);
    const currentBoundingBox = await locator.boundingBox();

    if (
      lastBoundingBox?.x === currentBoundingBox?.x &&
      lastBoundingBox?.y === currentBoundingBox?.y &&
      lastBoundingBox?.width === currentBoundingBox?.width &&
      lastBoundingBox?.height === currentBoundingBox?.height
    ) {
      return;
    }

    lastBoundingBox = currentBoundingBox;
  }

  throw new Error(`Element did not reach stable position within ${timeout}ms`);
}

/**
 * 批量等待多个条件
 * @param page Playwright Page对象
 * @param conditions 等待条件函数数组
 * @param options 可选配置
 */
export async function waitForAll(
  page: Page,
  conditions: Array<() => Promise<void>>,
  options: { timeout?: number } = {}
): Promise<void> {
  const { timeout = 10000 } = options;

  await Promise.race([
    Promise.all(conditions),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Timeout waiting for all conditions')), timeout)
    )
  ]);
}
