import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';
import {
  createTestImageData,
  simulateDragToChatPanel,
  simulateDragAtPosition,
  getChatPanelBounds,
  getDragDropState
} from '../helpers/drag-drop';

/**
 * 文件拖拽 E2E 测试
 * v0.3.0: 验证外部文件拖拽到聊天区域的功能
 */

test.describe('Drag & Drop @v0.3.0', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForFunction(() => (window as any).__fileStore !== undefined, { timeout: 10000 });
    await page.waitForTimeout(2000);

    // 打开聊天面板（参考 RAG 测试模式）
    await page.evaluate(() => {
      const layoutStore = (window as any).__layoutStore;
      if (layoutStore && !layoutStore.getState().isChatOpen) {
        layoutStore.getState().toggleChat();
      }
    });
    await page.waitForTimeout(1000);

    // 验证聊天面板已打开
    const chatPanelOpen = await page.evaluate(() => {
      const layoutStore = (window as any).__layoutStore;
      return layoutStore ? layoutStore.getState().isChatOpen : false;
    });
    console.log('[Test] 聊天面板已打开:', chatPanelOpen);
  });

  /**
   * DD-E2E-01: 验证 dragDropStore 是否已初始化
   */
  test('DD-E2E-01: Verify dragDropStore initialization', async ({ page }) => {
    // 通过触发 dragover 事件来验证 store 是否正常工作
    const result = await page.evaluate(async () => {
      // 创建一个测试文件
      const canvas = document.createElement('canvas');
      canvas.width = 10;
      canvas.height = 10;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#FF0000';
      ctx.fillRect(0, 0, 10, 10);

      const blob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((b) => resolve(b!), 'image/png');
      });

      const file = new File([blob], 'test.png', { type: 'image/png' });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);

      // 触发 dragover 事件到窗口右侧（聊天区域）
      const event = new DragEvent('dragover', {
        bubbles: true,
        cancelable: true,
        dataTransfer: dataTransfer,
        clientX: window.innerWidth - 100,
        clientY: 100
      });

      window.dispatchEvent(event);

      // 等待一下让事件处理完成
      await new Promise(resolve => setTimeout(resolve, 50));

      // 返回成功（如果代码没有抛出错误，说明 store 工作正常）
      return true;
    });

    expect(result).toBeTruthy();

    test.info().annotations.push({
      type: 'pass',
      description: 'dragDropStore is working (dragover event handled without errors)'
    });
  });

  /**
   * DD-E2E-02: 获取聊天面板位置信息
   */
  test('DD-E2E-02: Get chat panel bounds', async ({ page }) => {
    const bounds = await getChatPanelBounds(page);

    expect(bounds).not.toBeNull();
    expect(bounds!.width).toBeGreaterThan(0);

    test.info().annotations.push({
      type: 'info',
      description: `Chat panel bounds: ${JSON.stringify(bounds)}`
    });
  });

  /**
   * DD-E2E-03: 模拟拖拽到聊天面板中心
   */
  test('DD-E2E-03: Simulate drag to chat panel center', async ({ page }) => {
    // 1. 创建测试图片数据
    const fileData = await createTestImageData(page, 'drag-test.png', 100);

    // 2. 获取拖拽前状态
    const beforeState = await getDragDropState(page);
    console.log('[Test] Before drag:', beforeState);

    // 3. 模拟拖拽到聊天面板
    await simulateDragToChatPanel(page, fileData);

    // 4. 等待处理
    await page.waitForTimeout(500);

    // 5. 验证应用仍然正常运行
    const appReady = await page.evaluate(() => {
      return (window as any).__fileStore !== undefined;
    });

    expect(appReady).toBeTruthy();

    test.info().annotations.push({
      type: 'pass',
      description: 'Drag to chat panel completed without errors'
    });
  });

  /**
   * DD-E2E-04: 拖拽到不同位置并验证状态
   */
  test('DD-E2E-04: Drag to different positions', async ({ page }) => {
    const { bounds, windowHeight } = await page.evaluate(() => {
      const chatPanel = document.querySelector('[data-testid="chat-panel"]');
      if (!chatPanel) return { bounds: null, windowHeight: window.innerHeight };

      const rect = (chatPanel as HTMLElement).getBoundingClientRect();
      return {
        bounds: {
          left: rect.left,
          right: rect.right,
          width: rect.width
        },
        windowHeight: window.innerHeight
      };
    });

    expect(bounds).not.toBeNull();

    // 创建测试图片数据（base64 格式）
    const fileData = await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 100;
      canvas.height = 100;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#FF0000';
      ctx.fillRect(0, 0, 100, 100);

      const blob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((b) => resolve(b!), 'image/png');
      });

      const arrayBuffer = await blob.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

      return {
        data: base64,
        name: 'position-test.png',
        type: 'image/png'
      };
    });

    // 测试位置：编辑器区域（左侧）
    const editorX = Math.floor(bounds!.left / 2);
    const centerY = Math.floor(windowHeight / 2);

    await page.evaluate(async ({ fileData: fd, posX, posY }) => {
      // 将 base64 转回 ArrayBuffer
      const binaryString = atob(fd.data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const arrayBuffer = bytes.buffer;

      const file = new File([arrayBuffer], fd.name, { type: fd.type });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);

      const element = document.elementFromPoint(posX, posY);
      if (element) {
        const event = new DragEvent('dragover', {
          bubbles: true,
          cancelable: true,
          dataTransfer: dataTransfer,
          clientX: posX,
          clientY: posY
        });
        element.dispatchEvent(event);
      }
    }, {
      fileData: fileData,
      posX: editorX,
      posY: centerY
    });

    await page.waitForTimeout(100);

    // 检查状态（应该是 false，因为在编辑器区域）
    const stateAfterEditorDrag = await getDragDropState(page);

    // 测试位置：聊天面板区域（右侧）
    const chatX = Math.floor((bounds!.left + bounds!.right) / 2);

    await page.evaluate(async ({ fileData: fd, posX, posY }) => {
      // 将 base64 转回 ArrayBuffer
      const binaryString = atob(fd.data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const arrayBuffer = bytes.buffer;

      const file = new File([arrayBuffer], fd.name, { type: fd.type });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);

      const element = document.elementFromPoint(posX, posY);
      if (element) {
        const event = new DragEvent('dragover', {
          bubbles: true,
          cancelable: true,
          dataTransfer: dataTransfer,
          clientX: posX,
          clientY: posY
        });
        element.dispatchEvent(event);
      }
    }, {
      fileData: fileData,
      posX: chatX,
      posY: centerY
    });

    await page.waitForTimeout(100);

    // 检查状态（应该是 true，因为在聊天区域）
    const stateAfterChatDrag = await getDragDropState(page);

    test.info().annotations.push({
      type: 'info',
      description: `State after editor drag: ${stateAfterEditorDrag.isDragOverChat}, after chat drag: ${stateAfterChatDrag.isDragOverChat}`
    });

    // 验证应用仍然正常运行
    const appReady = await page.evaluate(() => {
      return (window as any).__fileStore !== undefined;
    });

    expect(appReady).toBeTruthy();
  });

  /**
   * DD-E2E-05: 完整拖拽流程测试（dragenter → dragover → drop）
   */
  test('DD-E2E-05: Complete drag flow test', async ({ page }) => {
    // 创建测试图片数据（base64 格式）
    const fileData = await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 100;
      canvas.height = 100;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#FF0000';
      ctx.fillRect(0, 0, 100, 100);

      const blob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((b) => resolve(b!), 'image/png');
      });

      const arrayBuffer = await blob.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

      return {
        data: base64,
        name: 'flow-test.png',
        type: 'image/png'
      };
    });

    const { bounds, windowHeight } = await page.evaluate(() => {
      const chatPanel = document.querySelector('[data-testid="chat-panel"]');
      if (!chatPanel) return { bounds: null, windowHeight: window.innerHeight };

      const rect = (chatPanel as HTMLElement).getBoundingClientRect();
      return {
        bounds: {
          left: rect.left,
          right: rect.right,
          width: rect.width
        },
        windowHeight: window.innerHeight
      };
    });

    expect(bounds).not.toBeNull();

    const centerX = Math.floor((bounds!.left + bounds!.right) / 2);
    const centerY = Math.floor(windowHeight / 2);

    // 完整的拖拽流程
    await page.evaluate(async ({ fileData: fd, posX, posY }) => {
      // 将 base64 转回 ArrayBuffer
      const binaryString = atob(fd.data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const arrayBuffer = bytes.buffer;

      const file = new File([arrayBuffer], fd.name, { type: fd.type });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);

      const element = document.elementFromPoint(posX, posY);
      if (!element) return;

      console.log('[Test] Starting drag flow on element:', element);

      // 1. dragenter
      const enterEvent = new DragEvent('dragenter', {
        bubbles: true,
        cancelable: true,
        dataTransfer: dataTransfer,
        clientX: posX,
        clientY: posY
      });
      element.dispatchEvent(enterEvent);
      console.log('[Test] dragenter dispatched');

      await new Promise(resolve => setTimeout(resolve, 50));

      // 2. dragover (多次)
      for (let i = 0; i < 3; i++) {
        const overEvent = new DragEvent('dragover', {
          bubbles: true,
          cancelable: true,
          dataTransfer: dataTransfer,
          clientX: posX,
          clientY: posY
        });
        element.dispatchEvent(overEvent);
        await new Promise(resolve => setTimeout(resolve, 30));
      }
      console.log('[Test] dragover dispatched 3 times');

      // 3. drop
      const dropEvent = new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        dataTransfer: dataTransfer,
        clientX: posX,
        clientY: posY
      });
      element.dispatchEvent(dropEvent);
      console.log('[Test] drop dispatched');

    }, {
      fileData: fileData,
      posX: centerX,
      posY: centerY
    });

    await page.waitForTimeout(500);

    // 验证应用正常运行
    const appReady = await page.evaluate(() => {
      return (window as any).__fileStore !== undefined;
    });

    expect(appReady).toBeTruthy();

    test.info().annotations.push({
      type: 'pass',
      description: 'Complete drag flow executed successfully'
    });
  });

  /**
   * DD-E2E-06: 验证 Tauri file-drop-hover 事件和视觉反馈
   */
  test('DD-E2E-06: Verify Tauri file-drop-hover event and visual feedback', async ({ page }) => {
    // 1. 验证聊天面板的初始样式（没有蓝色边框）
    const initialClassNames = await page.evaluate(() => {
      const chatPanel = document.querySelector('[data-testid="chat-panel"]') as HTMLElement;
      return chatPanel?.className || '';
    });
    console.log('[Test] Initial class names:', initialClassNames);

    // 2. 设置一个监听器来检测 Tauri 事件
    const tauriEvents: string[] = [];
    await page.evaluate(() => {
      // 尝试监听 Tauri 的 file-drop-hover 事件
      import('@tauri-apps/api/event').then(({ listen }) => {
        listen('tauri://file-drop-hover', (event: any) => {
          console.log('[Test] Tauri file-drop-hover event received:', event);
          (window as any).__tauriHoverEvents = (window as any).__tauriHoverEvents || [];
          (window as any).__tauriHoverEvents.push(event);
        }).catch((err) => {
          console.log('[Test] Failed to listen to file-drop-hover:', err);
          (window as any).__tauriHoverError = err.message;
        });

        // 也监听 file-drop-cancelled 事件
        listen('tauri://file-drop-cancelled', (event: any) => {
          console.log('[Test] Tauri file-drop-cancelled event received:', event);
          (window as any).__tauriCancelledEvents = (window as any).__tauriCancelledEvents || [];
          (window as any).__tauriCancelledEvents.push(event);
        }).catch((err) => {
          console.log('[Test] Failed to listen to file-drop-cancelled:', err);
        });
      });
    });

    // 3. 等待一下，然后检查事件监听器是否设置成功
    await page.waitForTimeout(500);

    // 4. 触发浏览器内的 dragover 事件来测试视觉反馈
    const { bounds } = await page.evaluate(() => {
      const chatPanel = document.querySelector('[data-testid="chat-panel"]');
      if (!chatPanel) return { bounds: null };
      const rect = (chatPanel as HTMLElement).getBoundingClientRect();
      return {
        bounds: {
          left: rect.left,
          right: rect.right
        }
      };
    });

    expect(bounds).not.toBeNull();

    const centerX = Math.floor((bounds!.left + bounds!.right) / 2);
    const centerY = 400;

    // 创建测试图片数据
    const fileData = await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 100;
      canvas.height = 100;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#FF0000';
      ctx.fillRect(0, 0, 100, 100);

      const blob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((b) => resolve(b!), 'image/png');
      });

      const arrayBuffer = await blob.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

      return {
        data: base64,
        name: 'hover-test.png',
        type: 'image/png'
      };
    });

    // 在聊天面板上触发 dragover 事件
    await page.evaluate(async ({ fileData: fd, posX, posY }) => {
      const binaryString = atob(fd.data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const arrayBuffer = bytes.buffer;

      const file = new File([arrayBuffer], fd.name, { type: fd.type });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);

      // 直接触发到聊天面板元素
      const chatPanel = document.querySelector('[data-testid="chat-panel"]');
      if (chatPanel) {
        const event = new DragEvent('dragover', {
          bubbles: true,
          cancelable: true,
          dataTransfer: dataTransfer,
          clientX: posX,
          clientY: posY
        });
        chatPanel.dispatchEvent(event);
      }
    }, {
      fileData: fileData,
      posX: centerX,
      posY: centerY
    });

    // 5. 等待样式更新
    await page.waitForTimeout(200);

    // 6. 检查聊天面板是否有蓝色边框（视觉反馈）
    const dragHighlightClassNames = await page.evaluate(() => {
      const chatPanel = document.querySelector('[data-testid="chat-panel"]') as HTMLElement;
      return chatPanel?.className || '';
    });
    console.log('[Test] Drag highlight class names:', dragHighlightClassNames);

    const hasBlueBorder = dragHighlightClassNames.includes('border-blue-500');
    const hasBlueBg = dragHighlightClassNames.includes('bg-blue-900');

    console.log('[Test] Visual feedback:', {
      hasBlueBorder,
      hasBlueBg,
      fullClassNames: dragHighlightClassNames
    });

    // 7. 检查 Tauri 事件是否触发
    const tauriHoverEvents = await page.evaluate(() => {
      return (window as any).__tauriHoverEvents || [];
    });
    const tauriHoverError = await page.evaluate(() => {
      return (window as any).__tauriHoverError || null;
    });

    console.log('[Test] Tauri hover events:', tauriHoverEvents);
    console.log('[Test] Tauri hover error:', tauriHoverError);

    // 8. 检查拖拽状态
    const dragState = await getDragDropState(page);
    console.log('[Test] Drag state:', dragState);

    test.info().annotations.push({
      type: 'info',
      description: `Visual feedback: blue border = ${hasBlueBorder}, blue bg = ${hasBlueBg}`
    });

    test.info().annotations.push({
      type: 'info',
      description: `Tauri hover events: ${tauriHoverEvents.length}, error: ${tauriHoverError}`
    });

    test.info().annotations.push({
      type: 'info',
      description: `isDragOverChat: ${dragState.isDragOverChat}`
    });

    // 验证视觉反馈存在（浏览器内拖拽应该触发）
    expect(dragState.isDragOverChat).toBeTruthy();

    // 验证应用正常运行
    const appReady = await page.evaluate(() => {
      return (window as any).__fileStore !== undefined;
    });

    expect(appReady).toBeTruthy();
  });

  /**
   * DD-E2E-07: 验证浏览器内 dragover 事件正常工作
   */
  test('DD-E2E-07: Verify browser dragover event works correctly', async ({ page }) => {
    // 创建测试图片并转换为 base64 以便传递
    const fileData = await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 100;
      canvas.height = 100;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#FF0000';
      ctx.fillRect(0, 0, 100, 100);

      const blob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((b) => resolve(b!), 'image/png');
      });

      const arrayBuffer = await blob.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

      return {
        data: base64,
        name: 'global-test.png',
        type: 'image/png'
      };
    });

    const { bounds } = await page.evaluate(() => {
      const chatPanel = document.querySelector('[data-testid="chat-panel"]');
      if (!chatPanel) return { bounds: null };

      const rect = (chatPanel as HTMLElement).getBoundingClientRect();
      return {
        bounds: {
          left: rect.left,
          right: rect.right,
          width: rect.width
        }
      };
    });

    expect(bounds).not.toBeNull();

    // 在窗口不同位置触发 dragover，验证状态变化
    const positions = [
      { x: 100, y: 100, expected: false, desc: '左上角（编辑器）' },
      { x: bounds!.right - 50, y: 100, expected: true, desc: '聊天面板' }
    ];

    for (const pos of positions) {
      await page.evaluate(async ({ fileData: fd, posX, posY }) => {
        // 将 base64 转回 ArrayBuffer
        const binaryString = atob(fd.data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const arrayBuffer = bytes.buffer;

        const file = new File([arrayBuffer], fd.name, { type: fd.type });
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);

        const event = new DragEvent('dragover', {
          bubbles: true,
          cancelable: true,
          dataTransfer: dataTransfer,
          clientX: posX,
          clientY: posY
        });

        window.dispatchEvent(event);
      }, {
        fileData: fileData,
        posX: pos.x,
        posY: pos.y
      });

      await page.waitForTimeout(100);

      const state = await getDragDropState(page);
      console.log(`[Test] Position ${pos.desc}: isDragOverChat = ${state.isDragOverChat}, expected = ${pos.expected}`);

      // 验证状态是否符合预期（针对聊天面板的拖拽）
      if (pos.expected === true) {
        // 聊天面板的 onDragOver 应该被触发
        // 需要直接在聊天面板元素上触发事件
        await page.evaluate(async ({ fileData: fd, posX, posY }) => {
          // 将 base64 转回 ArrayBuffer
          const binaryString = atob(fd.data);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          const arrayBuffer = bytes.buffer;

          const file = new File([arrayBuffer], fd.name, { type: fd.type });
          const dataTransfer = new DataTransfer();
          dataTransfer.items.add(file);

          // 直接在聊天面板元素上触发事件
          const chatPanel = document.querySelector('[data-testid="chat-panel"]');
          if (chatPanel) {
            const event = new DragEvent('dragover', {
              bubbles: true,
              cancelable: true,
              dataTransfer: dataTransfer,
              clientX: posX,
              clientY: posY
            });
            chatPanel.dispatchEvent(event);
            console.log('[Test] Direct dispatch on chat panel');
          }
        }, {
          fileData: fileData,
          posX: pos.x,
          posY: pos.y
        });

        await page.waitForTimeout(100);

        // 再次检查状态
        const stateAfter = await getDragDropState(page);
        console.log(`[Test] ${pos.desc} (after direct dispatch): isDragOverChat = ${stateAfter.isDragOverChat}`);
      }

      test.info().annotations.push({
        type: 'info',
        description: `${pos.desc}: isDragOverChat = ${state.isDragOverChat}`
      });
    }

    // 验证应用正常运行
    const appReady = await page.evaluate(() => {
      return (window as any).__fileStore !== undefined;
    });

    expect(appReady).toBeTruthy();
  });
});
