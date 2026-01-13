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

  // 等待编辑器容器或欢迎屏幕加载
  // 情况1: Monaco 编辑器已打开文件
  // 情况2: 欢迎屏幕（无文件打开时显示）
  const monacoLocator = page.locator('.monaco-editor, [data-testid="monaco-editor-container"], .editor-container');
  const welcomeLocator = page.getByText('IfAI Editor', { exact: true }).first();

  try {
    // 尝试等待 Monaco 编辑器
    await monacoLocator.waitFor({ state: 'visible', timeout });
  } catch {
    // 如果 Monaco 编辑器未出现，等待欢迎屏幕
    await welcomeLocator.waitFor({ state: 'visible', timeout });
  }

  // 如果是 Monaco 编辑器，等待内容区域加载
  const hasMonaco = await monacoLocator.count() > 0;
  if (hasMonaco) {
    await page.waitForSelector('.view-line, .monaco-editor .view-lines', {
      state: 'attached',
      timeout: 2000
    }).catch(() => {
      // 忽略错误，可能是 WelcomeScreen 状态
    });
  }

  await page.waitForTimeout(100);
}

/**
 * 关闭首次启动的 WelcomeDialog（本地模型下载提示）
 * @param page Playwright Page对象
 */
export async function closeWelcomeDialog(
  page: Page,
  options: { timeout?: number } = {}
): Promise<void> {
  const { timeout = 5000 } = options;

  try {
    // WelcomeDialog 有 "bg-black/50" 背景和 "跳过，使用云端" 按钮
    const dialogLocator = page.locator('.bg-black\\/50, [class*="fixed"][class*="inset-0"]').first();
    const skipButton = page.getByText('跳过，使用云端');

    // 等待对话框出现
    const dialogCount = await dialogLocator.count();
    if (dialogCount > 0) {
      await skipButton.click({ timeout });
      await page.waitForTimeout(300); // 等待动画完成
    }
  } catch {
    // 如果对话框未出现或已关闭，忽略错误
  }
}

/**
 * 关闭新手引导 Tour（如果出现）
 * @param page Playwright Page对象
 */
export async function closeTour(
  page: Page,
  options: { timeout?: number } = {}
): Promise<void> {
  const { timeout = 10000 } = options; // 增加超时时间，Tour 有 1000ms 延迟

  try {
    // 等待 Tour 出现（Tour 有 1000ms 延迟启动）
    const tourTooltip = page.locator('.react-joyride__tooltip, .driver-popover, .introjs-tooltip');
    await tourTooltip.waitFor({ state: 'visible', timeout }).catch(() => {});

    const tourCount = await tourTooltip.count();
    if (tourCount > 0) {
      // 使用 JavaScript 直接点击跳过按钮，绕过覆盖层
      // react-joyride 的按钮可能是最后一个按钮（通常是 Next 和 Skip）
      await page.evaluate(() => {
        // 查找所有按钮，找到包含 "Skip" 或 "跳过" 文本的按钮
        const buttons = Array.from(document.querySelectorAll('button'));
        let skipButton = buttons.find(btn =>
          btn.textContent?.includes('Skip') ||
          btn.textContent?.includes('跳过')
        );

        // 如果没找到文本匹配，尝试通过 class 查找
        if (!skipButton) {
          skipButton = buttons.find(btn =>
            btn.classList.contains('react-joyride__button--skip') ||
            btn.classList.contains('joyride-skip')
          );
        }

        // 如果还是没找到，尝试查找最后一个按钮（通常 Skip 是最后一个）
        if (!skipButton && buttons.length > 0) {
          // 最后一个按钮通常是 Skip，倒数第二个是 Next
          const lastButton = buttons[buttons.length - 1];
          if (lastButton.textContent?.toLowerCase().includes('skip') ||
              lastButton.textContent?.includes('跳过')) {
            skipButton = lastButton;
          }
        }

        if (skipButton) {
          console.log('Found skip button, clicking:', skipButton.textContent);
          (skipButton as HTMLElement).click();
        } else {
          console.warn('Skip button not found, available buttons:', buttons.map(b => b.textContent));
        }
      });

      await page.waitForTimeout(1000); // 等待动画完成

      // 验证 Tour 已关闭
      await tourTooltip.waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {});
    }
  } catch (error) {
    console.log('closeTour error:', error);
    // 如果 Tour 未出现或已关闭，忽略错误
  }
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
