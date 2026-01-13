/**
 * E2E 测试辅助工具 - 文件拖拽模拟
 * v0.3.0: 多模态文件拖拽测试
 */

/**
 * 文件数据格式（可在 page.evaluate 之间传递）
 */
export interface FileData {
  data: string; // base64 编码的数据
  name: string;
  type: string;
}

/**
 * 创建测试图片文件数据
 */
export async function createTestImageData(
  page: any,
  filename: string = 'test-image.png',
  size: number = 100
): Promise<FileData> {
  return await page.evaluate(async ({ name, width, height }) => {
    // 创建一个简单的测试图片（红色方块）
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#FF0000';
    ctx.fillRect(0, 0, width, height);

    // 转换为 Blob
    const blob = await new Promise<Blob>((resolve) => {
      canvas.toBlob((b) => resolve(b!), 'image/png');
    });

    // 转换为 base64 以便传递
    const arrayBuffer = await blob.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

    return {
      data: base64,
      name: name,
      type: 'image/png'
    };
  }, { name: filename, width: size, height: size });
}

/**
 * @deprecated 使用 createTestImageData 代替
 * 创建测试图片文件（返回 File 对象，不推荐用于跨 page.evaluate 传递）
 */
export async function createTestImage(
  page: any,
  filename: string = 'test-image.png',
  size: number = 100
): Promise<File> {
  return await page.evaluate(async ({ name, width, height }) => {
    // 创建一个简单的测试图片（红色方块）
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#FF0000';
    ctx.fillRect(0, 0, width, height);

    // 转换为 Blob
    const blob = await new Promise<Blob>((resolve) => {
      canvas.toBlob((b) => resolve(b!), 'image/png');
    });

    return new File([blob], name, { type: 'image/png' });
  }, { name: filename, width: size, height: size });
}

/**
 * 模拟完整的拖拽流程：dragenter → dragover → drop
 */
export async function simulateFileDrag(
  page: any,
  file: File,
  targetSelector: string
): Promise<void> {
  await page.evaluate(async ({ fileData, selector }) => {
    // 重建 File 对象
    const file = new File([fileData.data], fileData.name, { type: fileData.type });

    // 查找目标元素
    const target = document.querySelector(selector);
    if (!target) {
      console.error(`[DragDrop] Target not found: ${selector}`);
      return;
    }

    console.log(`[DragDrop] Simulating drag to:`, selector, target);

    // 创建 DataTransfer
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);

    // 获取元素位置
    const rect = target.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    // 1. dragenter
    const dragEnterEvent = new DragEvent('dragenter', {
      bubbles: true,
      cancelable: true,
      dataTransfer: dataTransfer,
      clientX: centerX,
      clientY: centerY
    });
    target.dispatchEvent(dragEnterEvent);
    console.log(`[DragDrop] dragenter dispatched`);

    // 等待一下
    await new Promise(resolve => setTimeout(resolve, 50));

    // 2. dragover (多次触发，模拟真实拖拽)
    for (let i = 0; i < 3; i++) {
      const dragOverEvent = new DragEvent('dragover', {
        bubbles: true,
        cancelable: true,
        dataTransfer: dataTransfer,
        clientX: centerX,
        clientY: centerY
      });
      target.dispatchEvent(dragOverEvent);
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    console.log(`[DragDrop] dragover dispatched (3 times)`);

    // 3. drop
    const dropEvent = new DragEvent('drop', {
      bubbles: true,
      cancelable: true,
      dataTransfer: dataTransfer,
      clientX: centerX,
      clientY: centerY
    });
    target.dispatchEvent(dropEvent);
    console.log(`[DragDrop] drop dispatched`);

  }, {
    fileData: {
      data: await file.arrayBuffer(),
      name: file.name,
      type: file.type
    },
    selector: targetSelector
  });
}

/**
 * 检查图片附件是否已添加
 */
export async function checkImageAttachments(page: any): Promise<number> {
  return await page.evaluate(() => {
    const store = (window as any).__dragDropStore;
    return store ? store.isDragOverChat : false;
  });
}

/**
 * 获取聊天面板的位置信息
 */
export async function getChatPanelBounds(page: any): Promise<{ left: number; right: number; width: number } | null> {
  // 首先尝试使用 Playwright 的 locator API
  const chatPanel = page.locator('[data-testid="chat-panel"]').first();

  // 检查元素是否存在
  const count = await chatPanel.count();
  console.log(`[DragDrop] Chat panel count: ${count}`);

  if (count === 0) {
    // 回退到 evaluate 方法
    return await page.evaluate(() => {
      const chatPanel = document.querySelector('[data-testid="chat-panel"]');
      if (!chatPanel) {
        console.error('[DragDrop] Chat panel not found in DOM');
        return null;
      }

      const rect = (chatPanel as HTMLElement).getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        width: rect.width
      };
    });
  }

  // 使用 Playwright 的 boundingBox API
  const box = await chatPanel.boundingBox();
  if (!box) return null;

  return {
    left: box.x,
    right: box.x + box.width,
    width: box.width
  };
}

/**
 * 在特定坐标位置模拟拖拽
 */
export async function simulateDragAtPosition(
  page: any,
  fileData: FileData,
  x: number,
  y: number
): Promise<void> {
  await page.evaluate(async ({ fd, posX, posY }) => {
    // 将 base64 转回 ArrayBuffer
    const binaryString = atob(fd.data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const arrayBuffer = bytes.buffer;

    // 重建 File 对象
    const file = new File([arrayBuffer], fd.name, { type: fd.type });

    // 查找该位置的元素
    const element = document.elementFromPoint(posX, posY);
    if (!element) {
      console.error(`[DragDrop] No element at position:`, { x: posX, y: posY });
      return;
    }

    console.log(`[DragDrop] Element at position:`, element);

    // 创建 DataTransfer
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);

    // 触发拖拽事件链
    const events = ['dragenter', 'dragover', 'dragover', 'drop'];
    for (const eventType of events) {
      const event = new DragEvent(eventType, {
        bubbles: true,
        cancelable: true,
        dataTransfer: dataTransfer,
        clientX: posX,
        clientY: posY
      });
      element.dispatchEvent(event);
      console.log(`[DragDrop] ${eventType} dispatched at`, { x: posX, y: posY });
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  }, {
    fd: fileData,
    posX: x,
    posY: y
  });
}

/**
 * 模拟拖拽到聊天面板区域
 */
export async function simulateDragToChatPanel(
  page: any,
  fileData: FileData
): Promise<void> {
  // 使用改进的 getChatPanelBounds 函数
  const bounds = await getChatPanelBounds(page);

  if (!bounds) {
    throw new Error('Chat panel not found');
  }

  // 获取窗口高度
  const windowHeight = await page.evaluate(() => window.innerHeight);

  // 计算聊天面板中心点
  const centerX = Math.floor((bounds.left + bounds.right) / 2);
  const centerY = Math.floor(windowHeight / 2);

  console.log(`[DragDrop] Chat panel bounds:`, bounds);
  console.log(`[DragDrop] Dragging to center:`, { x: centerX, y: centerY });

  await simulateDragAtPosition(page, fileData, centerX, centerY);
}

/**
 * 获取当前拖拽状态
 */
export async function getDragDropState(page: any): Promise<{ isDragOverChat: boolean }> {
  return await page.evaluate(() => {
    const store = (window as any).__dragDropStore;
    if (!store) {
      console.log('[DragDrop] __dragDropStore not found on window');
      return { isDragOverChat: false };
    }
    // Zustand store 需要调用 .getState() 获取状态
    const state = store.getState();
    return {
      isDragOverChat: state ? state.isDragOverChat : false
    };
  });
}
