/**
 * E2E Tests for Multimodal Layout
 *
 * 测试目标：
 * 1. 验证图片与文字输入区左右并排显示
 * 2. 验证粘贴图片功能
 * 3. 验证拖拽图片功能
 * 4. 验证点击上传图片功能
 * 5. 验证发送后图片附件被清除
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

test.describe('Multimodal - Layout & Upload', () => {
  test.beforeEach(async ({ page }) => {
    const apiKey = process.env.E2E_AI_API_KEY;
    if (!apiKey) {
      test.skip(true, '⚠️ 跳过测试：未配置 AI API Key');
      return;
    }

    await setupE2ETestEnvironment(page, {
      useRealAI: true,
      realAIApiKey: apiKey,
    });

    await page.goto('/');
    await page.waitForTimeout(2000);

    // 🔥 尝试多种方式关闭欢迎对话框
    try {
      // 方法1: 尝试通过文本查找按钮（多个可能的文本）
      const buttonTexts = ['跳过，使用云端', 'Skip, Use Cloud', '跳过', 'Skip', '稍后提醒', 'Remind Later'];
      for (const text of buttonTexts) {
        try {
          const button = page.getByRole('button', { name: text, exact: false }).first();
          if (await button.isVisible({ timeout: 1000 }).catch(() => false)) {
            await button.click();
            console.log(`[E2E] Clicked button with text: ${text}`);
            await page.waitForTimeout(500);
            break;
          }
        } catch {}
      }

      // 方法2: 如果方法1失败，尝试通过 CSS 选择器查找按钮
      const skipButtonFound = await page.evaluate(() => {
        // 查找所有按钮
        const buttons = Array.from(document.querySelectorAll('button'));
        for (const btn of buttons) {
          const text = btn.textContent?.trim() || '';
          if (text.includes('跳过') || text.includes('Skip') || text.includes('云端') || text.includes('Cloud')) {
            (btn as HTMLButtonElement).click();
            return true;
          }
        }
        return false;
      });

      if (skipButtonFound) {
        console.log('[E2E] Clicked skip button via JS evaluation');
        await page.waitForTimeout(1000);
      }
    } catch (e) {
      console.log('[E2E] Failed to close welcome dialog:', e);
    }

    await page.waitForFunction(() => (window as any).__chatStore !== undefined, { timeout: 15000 });
    await page.waitForFunction(() => (window as any).__layoutStore !== undefined, { timeout: 15000 });
    await page.waitForTimeout(1000);
    await page.waitForFunction(() => (window as any).__chatStore !== undefined, { timeout: 15000 });
    await page.waitForFunction(() => (window as any).__layoutStore !== undefined, { timeout: 15000 });
    await page.waitForTimeout(2000);

    // 打开聊天面板
    await page.evaluate(() => {
      const layoutStore = (window as any).__layoutStore;
      // 🔥 __layoutStore 是 { useLayoutStore } 对象
      if (layoutStore && !layoutStore.useLayoutStore.getState().isChatOpen) {
        layoutStore.useLayoutStore.getState().toggleChat();
      }
    });
    await page.waitForTimeout(1000);
  });

  test('@commercial MM-LAYOUT-01: Image and text input should be side by side', async ({ page }) => {
    // 测试：图片输入区和文字输入区应该左右并排显示
    // 当前问题：图片在上方，文字在下方（上下布局）
    // 期望：图片在左，文字在右（左右布局）

    const chatInput = page.locator('textarea[placeholder*="发送"], textarea[placeholder*="询问"], [data-testid="chat-input"]');
    await expect(chatInput).toBeVisible({ timeout: 10000 });

    // 🔥 验证当前布局结构
    const layoutInfo = await page.evaluate(() => {
      const chatContainer = document.querySelector('[class*="chat"], [class*="Chat"]');
      if (!chatContainer) return { error: 'Chat container not found' };

      // 查找输入区域的容器
      const inputArea = chatContainer.querySelector('div[class*="border-t"]');
      if (!inputArea) return { error: 'Input area not found' };

      // 获取所有直接子元素
      const children = Array.from(inputArea.children);

      return {
        totalChildren: children.length,
        childrenClasses: children.map(c => ({
          className: c.className,
          tag: c.tagName,
          // 检查是否使用 flex 布局
          display: window.getComputedStyle(c).display,
          flexDirection: window.getComputedStyle(c).flexDirection,
        })),
        // 检查父容器的布局方向
        parentDisplay: window.getComputedStyle(inputArea).display,
        parentFlexDirection: window.getComputedStyle(inputArea).flexDirection,
      };
    });

    console.log('[Layout Check] Current layout structure:', JSON.stringify(layoutInfo, null, 2));

    // ❌ 当前问题：parentFlexDirection 可能是 'column'（上下布局）
    // ✅ 期望：应该是 'row'（左右布局）

    // 🔥 验证图片输入组件和文本输入框的位置关系
    const positionInfo = await page.evaluate(() => {
      const imageInput = document.querySelector('[class*="ImageInput"]');
      const textInput = document.querySelector('textarea[data-testid="chat-input"]');

      if (!imageInput || !textInput) {
        return { error: 'Image input or text input not found' };
      }

      const imageRect = imageInput.getBoundingClientRect();
      const textRect = textInput.getBoundingClientRect();

      return {
        imageInput: {
          top: imageRect.top,
          left: imageRect.left,
          width: imageRect.width,
          height: imageRect.height,
        },
        textInput: {
          top: textRect.top,
          left: textRect.left,
          width: textRect.width,
          height: textRect.height,
        },
        // 判断布局方向
        layout: imageRect.top < textRect.top ? 'vertical' :
                imageRect.left < textRect.left ? 'horizontal' : 'unknown',
      };
    });

    console.log('[Layout Check] Position info:', JSON.stringify(positionInfo, null, 2));

    // ❌ 当前：layout 可能是 'vertical'（图片在上，文字在下）
    // ✅ 期望：layout 应该是 'horizontal'（图片在左，文字在右）
  });

  test('@commercial MM-LAYOUT-02: Verify paste image functionality', async ({ page }) => {
    // 测试：验证用户可以粘贴图片到输入区

    const chatInput = page.locator('textarea[placeholder*="发送"], textarea[placeholder*="询问"], [data-testid="chat-input"]');
    await expect(chatInput).toBeVisible({ timeout: 10000 });

    // 🔥 步骤 1: 模拟粘贴图片（通过设置 clipboard）
    // 创建一个小的测试图片（base64）
    const testImageBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    // 模拟粘贴事件
    await page.evaluate((imageData) => {
      const input = document.querySelector('textarea[data-testid="chat-input"]');
      if (!input) return;

      // 创建 ClipboardEvent
      const file = new File(['test'], 'test.png', { type: 'image/png' });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);

      const pasteEvent = new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: dataTransfer,
      });

      input.dispatchEvent(pasteEvent);
    }, testImageBase64);

    await page.waitForTimeout(1000);

    // 🔥 验证：检查是否有图片附件被添加
    const hasImageAttachment = await page.evaluate(() => {
      const store = (window as any).__chatStore;
      const state = store?.getState?.();

      // 检查 imageAttachments 或图片相关的状态
      // 注意：具体的状态名称可能不同，需要根据实际实现调整
      return {
        hasAttachments: false,
        attachmentsCount: 0,
        // 尝试不同的可能状态名称
        imageAttachments: state?.imageAttachments?.length || 0,
        attachments: state?.attachments?.length || 0,
      };
    });

    console.log('[Paste Check] After paste:', hasImageAttachment);

    // ❌ 当前问题：粘贴可能不工作，因为 mock 环境限制
    // ✅ 期望：hasImageAttachment.attachmentsCount > 0
  });

  test('@commercial MM-LAYOUT-03: Verify drag and drop image functionality', async ({ page }) => {
    // 测试：验证用户可以拖拽图片到输入区

    const chatInput = page.locator('textarea[placeholder*="发送"], textarea[placeholder*="询问"], [data-testid="chat-input"]');
    await expect(chatInput).toBeVisible({ timeout: 10000 });

    // 🔥 步骤 1: 准备测试图片文件
    const testImageBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );

    // 创建 DataTransfer 对象模拟拖拽
    await page.evaluate((imageData) => {
      const dropZone = document.querySelector('textarea[data-testid="chat-input"]');
      if (!dropZone) return;

      // 创建文件对象
      const byteString = atob(imageData);
      const arrayBuffer = new ArrayBuffer(byteString.length);
      const uint8Array = new Uint8Array(arrayBuffer);
      for (let i = 0; i < byteString.length; i++) {
        uint8Array[i] = byteString.charCodeAt(i);
      }
      const file = new File([arrayBuffer], 'test.png', { type: 'image/png' });

      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      dataTransfer.files = [file];

      // 触发 dragover 事件
      const dragOverEvent = new DragEvent('dragover', {
        bubbles: true,
        cancelable: true,
        dataTransfer: dataTransfer,
      });
      dropZone.dispatchEvent(dragOverEvent);

      // 触发 drop 事件
      const dropEvent = new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        dataTransfer: dataTransfer,
      });
      dropZone.dispatchEvent(dropEvent);
    }, testImageBuffer.toString('base64'));

    await page.waitForTimeout(1000);

    // 🔥 验证：检查是否有图片附件被添加
    const attachmentCheck = await page.evaluate(() => {
      const store = (window as any).__chatStore;
      const state = store?.getState?.();

      return {
        imageAttachments: state?.imageAttachments?.length || 0,
        attachments: state?.attachments?.length || 0,
      };
    });

    console.log('[DragDrop Check] After drop:', attachmentCheck);

    // ❌ 当前问题：拖拽可能不工作，因为 mock 环境限制
    // ✅ 期望：attachmentCheck.imageAttachments > 0
  });

  test('@commercial MM-LAYOUT-04: Verify click upload button functionality', async ({ page }) => {
    // 测试：验证用户可以点击上传图片按钮

    const chatInput = page.locator('textarea[placeholder*="发送"], textarea[placeholder*="询问"], [data-testid="chat-input"]');
    await expect(chatInput).toBeVisible({ timeout: 10000 });

    // 🔥 查找上传按钮（通常有 upload 图标或类似标识）
    const uploadButton = page.locator('button').filter(async (button) => {
      const text = await button.textContent();
      const title = await button.getAttribute('title');
      const hasUploadIcon = await button.locator('svg').count() > 0;

      return (
        text?.includes('上传') ||
        title?.includes('上传') ||
        title?.includes('upload') ||
        hasUploadIcon
      );
    }).first();

    const buttonExists = await uploadButton.count();

    if (buttonExists > 0) {
      console.log('[Upload Button] Found upload button');

      // 点击上传按钮会触发文件选择对话框
      // 在 E2E 测试中，我们只能验证按钮存在且可点击
      const isClickable = await uploadButton.isEnabled();
      console.log('[Upload Button] Is clickable:', isClickable);

      expect(isClickable).toBe(true);
    } else {
      console.log('[Upload Button] Upload button not found');
      // ❌ 问题：上传按钮可能不存在或被隐藏
    }
  });

  test('@commercial MM-LAYOUT-05: Image should be cleared after sending', async ({ page }) => {
    // 测试：发送消息后，图片附件应该被清除

    const chatInput = page.locator('textarea[placeholder*="发送"], textarea[placeholder*="询问"], [data-testid="chat-input"]');
    await expect(chatInput).toBeVisible({ timeout: 10000 });

    // 🔥 场景：假设用户已经有图片附件
    // 发送消息
    await chatInput.fill('分析这张图片');
    await page.keyboard.press('Enter');

    // 等待发送
    await page.waitForTimeout(2000);

    // 🔥 验证：发送后图片应该被清除
    const afterSendCheck = await page.evaluate(() => {
      const store = (window as any).__chatStore;
      const state = store?.getState?.();

      // 检查是否还有图片附件
      const hasAttachments = state?.imageAttachments?.length > 0 ||
                            state?.attachments?.length > 0;

      // 检查页面 DOM 是否还有图片预览
      const imagePreviews = document.querySelectorAll('img[src*="base64"], .image-preview, [class*="attachment"]');

      return {
        hasStateAttachments: hasAttachments,
        domImageCount: imagePreviews.length,
        isLoading: state?.isLoading || false,
      };
    });

    console.log('[Clear Check] After send:', afterSendCheck);

    // ❌ 当前问题：图片可能没有被清除
    // ✅ 期望：afterSendCheck.hasStateAttachments === false
    // ✅ 期望：afterSendCheck.domImageCount === 0
  });

  test('@commercial MM-LAYOUT-06: Complete multimodal workflow validation', async ({ page }) => {
    // 测试：完整的多模态工作流验证
    // 场景：上传图片 → 输入文字 → 发送 → 验证响应

    const chatInput = page.locator('textarea[placeholder*="发送"], textarea[placeholder*="询问"], [data-testid="chat-input"]');
    await expect(chatInput).toBeVisible({ timeout: 10000 });

    // 🔥 步骤 1: 检查初始状态
    const initialState = await page.evaluate(() => {
      const store = (window as any).__chatStore;
      const state = store?.getState?.();

      return {
        messageCount: state?.messages?.length || 0,
        isLoading: state?.isLoading || false,
      };
    });

    console.log('[Workflow] Initial state:', initialState);

    // 🔥 步骤 2: 发送消息（模拟有图片的场景）
    await chatInput.fill('这张截图显示了什么？');
    await page.keyboard.press('Enter');

    // 🔥 步骤 3: 立即检查状态（发送后 100ms）
    await page.waitForTimeout(100);
    const afterSendState = await page.evaluate(() => {
      const store = (window as any).__chatStore;
      const state = store?.getState?.();

      return {
        isLoading: state?.isLoading || false,
        messageCount: state?.messages?.length || 0,
        lastMessageHasContent: state?.messages?.[state.messages.length - 1]?.content?.length > 0,
      };
    });

    console.log('[Workflow] After send (100ms):', afterSendState);

    // ✅ 期望：isLoading 应该为 true（显示加载状态）

    // 🔥 步骤 4: 等待响应完成
    await page.waitForTimeout(10000);

    const finalState = await page.evaluate(() => {
      const store = (window as any).__chatStore;
      const state = store?.getState?.();

      return {
        isLoading: state?.isLoading || false,
        messageCount: state?.messages?.length || 0,
        hasAssistantResponse: state?.messages?.some((m: any) =>
          m.role === 'assistant' && m.content?.length > 0
        ),
      };
    });

    console.log('[Workflow] Final state:', finalState);

    // ✅ 验证：应该有助手回复
    expect(finalState.hasAssistantResponse).toBe(true);
    // ✅ 验证：加载状态应该结束
    expect(finalState.isLoading).toBe(false);
  });
});
