/**
 * BatchRenderer 测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock requestAnimationFrame and window.setTimeout
beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    return window.setTimeout(() => cb(Date.now()), 16) as unknown as number;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    window.clearTimeout(id);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('BatchRenderer', () => {
  it('应该批量累积文本并按需刷新', async () => {
    const { BatchRenderer } = await import('../BatchRenderer');

    const flushSpy = vi.fn();

    class TestRenderer extends BatchRenderer {
      protected onFlush(text: string): void {
        flushSpy(text);
      }
    }

    const renderer = new TestRenderer();

    // 添加文本（不会立即刷新）
    renderer.append('Hello');
    renderer.append(' World');

    // 此时应该还没有刷新（RAF 还未触发）
    expect(flushSpy).not.toHaveBeenCalled();

    // 等待 RAF (~16ms)
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(flushSpy).toHaveBeenCalledWith('Hello World');

    renderer.destroy();
  });

  it('应该在遇到标点符号时立即刷新', async () => {
    const { BatchRenderer } = await import('../BatchRenderer');

    const flushSpy = vi.fn();

    class TestRenderer extends BatchRenderer {
      protected onFlush(text: string): void {
        flushSpy(text);
      }
    }

    const renderer = new TestRenderer();
    renderer.append('你好');
    renderer.append('。');

    // 遇到标点后 scheduleFlush，等待一帧
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(flushSpy).toHaveBeenCalledWith('你好。');

    renderer.destroy();
  });

  it('应该在超时后强制刷新', async () => {
    const { BatchRenderer } = await import('../BatchRenderer');

    const flushSpy = vi.fn();

    class TestRenderer extends BatchRenderer {
      protected onFlush(text: string): void {
        flushSpy(text);
      }
    }

    const renderer = new TestRenderer();
    renderer.append('Hello');

    // 模拟 50ms 超时
    await new Promise(resolve => setTimeout(resolve, 60));
    expect(flushSpy).toHaveBeenCalledWith('Hello');

    renderer.destroy();
  });

  it('工具调用应该立即刷新', async () => {
    const { BatchRenderer } = await import('../BatchRenderer');

    const flushSpy = vi.fn();

    class TestRenderer extends BatchRenderer {
      protected onFlush(text: string): void {
        flushSpy(text);
      }
    }

    const renderer = new TestRenderer();
    renderer.append('执行命令', true);

    // 工具调用应该立即刷新
    expect(flushSpy).toHaveBeenCalledWith('执行命令');

    renderer.destroy();
  });

  it('应该正确清理定时器', async () => {
    const { BatchRenderer } = await import('../BatchRenderer');

    const flushSpy = vi.fn();

    class TestRenderer extends BatchRenderer {
      protected onFlush(text: string): void {
        flushSpy(text);
      }
    }

    const renderer = new TestRenderer();
    renderer.append('Test');

    // 销毁渲染器
    renderer.destroy();

    // 等待 RAF
    await new Promise(resolve => setTimeout(resolve, 50));

    // 不应该调用 flush（因为已销毁）
    expect(flushSpy).not.toHaveBeenCalled();
  });
});

describe('ChatMessageRenderer', () => {
  it('应该正确更新消息状态', async () => {
    const { ChatMessageRenderer } = await import('../BatchRenderer');

    const messages = new Map<string, string>();
    const updateState = (id: string, text: string) => {
      messages.set(id, text);
    };

    const renderer = new ChatMessageRenderer('msg-1', updateState);

    renderer.append('Hello');
    renderer.append(' World');

    // 触发刷新
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(messages.get('msg-1')).toBe('Hello World');

    renderer.destroy();
  });
});
