/**
 * Editor Page Object Model
 *
 * 提供对编辑器操作的封装，遵循 Page Object 模式
 * 改善测试可维护性和可读性
 */

import { Page, Locator, expect } from '@playwright/test';
import { getAppEdition, type AppEdition } from '../config/test-environment';

// 重新导出类型以保持向后兼容
export type { AppEdition };

/**
 * 编辑器页面封装
 */
export class EditorPage {
  readonly page: Page;
  private readonly _edition: AppEdition;

  // ========== 选择器常量 ==========
  private static readonly SELECTORS = {
    // Monaco 编辑器
    monacoEditor: '.monaco-editor',
    editorContainer: '.monaco-editor .editor-container',
    viewLines: '.view-lines',
    currentLine: '.current-line',

    // 文件标签页
    tabContainer: '.tabs-container',
    fileTab: '[data-testid="file-tab"], .editor-tab, .tab',
    tabLabel: '.tab-label',

    // 文件树
    fileTree: '[data-testid="file-tree"], .file-tree',
    fileItem: '[data-testid*="file"], .file-item',
    treeFile: '.tree-file',

    // 聊天组件
    chatInput: 'textarea[placeholder*="发送"], textarea[placeholder*="Ask"], [data-testid="chat-input"]',
    chatMessages: '[data-testid="chat-messages"], .messages-container, .message-list',
    messageContent: '[data-testid="message-content"], .message-content, .markdown-content',
    sendMessageButton: '[data-testid="send-message"], button:has-text("发送"), button:has-text("Send")',

    // 终端
    terminalPanel: '[data-testid="terminal-panel"], .terminal-panel',
    terminalContent: '.xterm-text-layer',

    // 侧边栏
    sidebar: '[data-testid="sidebar"], .sidebar',
    explorerPanel: '[data-testid="explorer-panel"], .explorer-panel',

    // 对话框/模态框
    dialog: '.dialog, .modal, [role="dialog"], [data-testid="dialog"]',
    dialogTitle: '.dialog-title, .modal-title, [data-testid="dialog-title"]',
    dialogClose: '[data-testid="dialog-close"], .dialog-close, button[aria-label="Close"]',

    // 通知/Toast
    toast: '[data-testid="toast"], .toast, .notification, .sonner-toast',

    // 状态栏
    statusBar: '[data-testid="status-bar"], .status-bar',

    // 命令面板
    commandPalette: '[data-testid="command-palette"], .command-palette',

    // 版本相关
    proBadge: '[data-testid="pro-badge"], .pro-badge, .badge-pro',
    version: '[data-testid="version"], .version, .app-version',
  };

  // ========== 构造函数 ==========

  constructor(page: Page, edition: AppEdition = 'community') {
    this.page = page;
    this._edition = edition;
  }

  // ========== 属性访问器 ==========

  /**
   * 获取当前应用版本
   */
  get edition(): AppEdition {
    return this._edition;
  }

  /**
   * 获取 Monaco 编辑器定位器
   */
  get monacoEditor(): Locator {
    return this.page.locator(EditorPage.SELECTORS.monacoEditor).first();
  }

  /**
   * 获取聊天输入框
   */
  get chatInput(): Locator {
    return this.page.locator(EditorPage.SELECTORS.chatInput);
  }

  /**
   * 获取消息列表
   */
  get messages(): Locator {
    return this.page.locator(EditorPage.SELECTORS.messageContent);
  }

  /**
   * 获取文件树
   */
  get fileTree(): Locator {
    return this.page.locator(EditorPage.SELECTORS.fileTree);
  }

  /**
   * 获取所有文件标签
   */
  get tabs(): Locator {
    return this.page.locator(EditorPage.SELECTORS.fileTab);
  }

  /**
   * 获取终端面板
   */
  get terminal(): Locator {
    return this.page.locator(EditorPage.SELECTORS.terminalPanel);
  }

  // ========== 初始化与等待 ==========

  /**
   * 等待编辑器就绪
   */
  async waitForReady(options?: { timeout?: number }): Promise<void> {
    const { timeout = 15000 } = options || {};

    await this.monacoEditor.waitFor({ state: 'visible', timeout });
    await this.page.locator(EditorPage.SELECTORS.viewLines).waitFor({ state: 'attached', timeout });
  }

  /**
   * 导航到基础 URL
   */
  async goto(): Promise<void> {
    await this.page.goto('/');
    await this.waitForReady();
  }

  // ========== 编辑器操作 ==========

  /**
   * 设置编辑器内容
   * @param content 代码内容
   */
  async setContent(content: string): Promise<void> {
    await this.page.evaluate((code) => {
      const monaco = (window as any).monaco;
      if (monaco?.editor?.getModels?.().length > 0) {
        const model = monaco.editor.getModels()[0];
        model.setValue(code);
      }
    }, content);

    // 等待内容更新
    await this.page.waitForTimeout(100);
  }

  /**
   * 获取编辑器内容
   */
  async getContent(): Promise<string> {
    return await this.page.evaluate(() => {
      const monaco = (window as any).monaco;
      if (monaco?.editor?.getModels?.().length > 0) {
        return monaco.editor.getModels()[0].getValue();
      }
      return '';
    });
  }

  /**
   * 在编辑器中输入文本
   * @param text 要输入的文本
   */
  async type(text: string): Promise<void> {
    await this.page.keyboard.type(text);
  }

  /**
   * 按键操作
   * @param key 按键名称 (如 'Enter', 'Control+Enter', 'Meta+s')
   */
  async press(key: string): Promise<void> {
    await this.page.keyboard.press(key);
  }

  /**
   * 触发 "转到定义" (Go to Definition)
   */
  async goToDefinition(): Promise<void> {
    await this.press('F12');
  }

  // ========== 聊天操作 ==========

  /**
   * 发送聊天消息
   * @param message 消息内容
   */
  async sendMessage(message: string): Promise<void> {
    await this.chatInput.fill(message);
    await this.chatInput.press('Enter');
  }

  /**
   * 等待新消息出现
   * @param timeout 超时时间
   */
  async waitForNewMessage(timeout: number = 10000): Promise<Locator> {
    const currentCount = await this.messages.count();
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const newCount = await this.messages.count();
      if (newCount > currentCount) {
        return this.messages.nth(currentCount);
      }
      await this.page.waitForTimeout(100);
    }

    throw new Error(`Timeout waiting for new message after ${timeout}ms`);
  }

  // ========== 文件操作 ==========

  /**
   * 打开文件（通过文件树）
   * @param fileName 文件名
   */
  async openFile(fileName: string): Promise<void> {
    const fileItem = this.fileTree.locator(EditorPage.SELECTORS.treeFile).filter({ hasText: fileName });
    await fileItem.dblclick();
  }

  /**
   * 验证文件是否已打开
   * @param fileName 文件名
   */
  async isFileOpen(fileName: string): Promise<boolean> {
    const tab = this.tabs.filter({ hasText: fileName });
    return await tab.count() > 0;
  }

  // ========== 终端操作 ==========

  /**
   * 打开终端面板
   */
  async openTerminal(): Promise<void> {
    await this.press('Control+`');
    await this.terminal.waitFor({ state: 'visible', timeout: 5000 });
  }

  /**
   * 在终端中执行命令
   * @param command 命令字符串
   */
  async executeCommand(command: string): Promise<void> {
    await this.openTerminal();
    await this.page.keyboard.type(command);
    await this.page.keyboard.press('Enter');
  }

  // ========== 对话框操作 ==========

  /**
   * 等待对话框出现
   * @param title 对话框标题（可选）
   */
  async waitForDialog(title?: string): Promise<Locator> {
    const dialog = this.page.locator(EditorPage.SELECTORS.dialog);
    await dialog.waitFor({ state: 'visible' });

    if (title) {
      const titleElement = dialog.locator(EditorPage.SELECTORS.dialogTitle);
      await expect(titleElement).toContainText(title);
    }

    return dialog;
  }

  /**
   * 关闭对话框
   */
  async closeDialog(): Promise<void> {
    const closeBtn = this.page.locator(EditorPage.SELECTORS.dialogClose).first();
    await closeBtn.click();
    await this.page.locator(EditorPage.SELECTORS.dialog).waitFor({ state: 'hidden', timeout: 5000 });
  }

  // ========== 断言辅助方法 ==========

  /**
   * 断言 Pro 徽章可见性
   * @param visible 是否可见
   */
  async assertProBadgeVisible(visible: boolean = true): Promise<void> {
    const badge = this.page.locator(EditorPage.SELECTORS.proBadge);

    if (visible) {
      await expect(badge.first()).toBeVisible();
    } else {
      await expect(badge).toHaveCount(0);
    }
  }

  /**
   * 断言 Toast 消息
   * @param message 消息内容
   */
  async assertToast(message: string | RegExp): Promise<void> {
    const toast = this.page.locator(EditorPage.SELECTORS.toast);
    await expect(toast.first()).toBeVisible();
    await expect(toast.first()).toContainText(message);
  }

  // ========== 版本特定行为 ==========

  /**
   * 检查是否为商业版
   */
  isCommercial(): boolean {
    return this._edition === 'commercial';
  }

  /**
   * 检查是否为社区版
   */
  isCommunity(): boolean {
    return this._edition === 'community';
  }

  /**
   * 根据版本执行不同逻辑
   * @param communityFn 社区版回调
   * @param commercialFn 商业版回调
   */
  async byEdition<T>(
    communityFn: () => Promise<T>,
    commercialFn: () => Promise<T>
  ): Promise<T> {
    if (this.isCommercial()) {
      return await commercialFn();
    }
    return await communityFn();
  }
}

/**
 * 创建编辑器页面实例
 * @param page Playwright Page 对象
 * @param edition 应用版本（可选，默认从环境变量读取）
 */
export function createEditorPage(page: Page, edition?: AppEdition): EditorPage {
  // 从统一配置读取版本，如果没有提供
  const appEdition = edition || getAppEdition();
  return new EditorPage(page, appEdition);
}
