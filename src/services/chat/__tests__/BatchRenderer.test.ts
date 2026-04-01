/**
 * BatchRenderer 测试
 */

import { BatchRenderer, ChatMessageRenderer } from '../BatchRenderer';

describe('BatchRenderer', () => {
  it('应该批量累积文本并按需刷新', () => {
    const flushSpy = jest.fn();

    class TestRenderer extends BatchRenderer {
      constructor(private onFlushSpy: jest.Mock) {
        super();
      }

      protected onFlush(text: string): void {
        this.onFlushSpy(text);
      }
    }

    const renderer = new TestRenderer(flushSpy);

    // 添加文本（不会立即刷新）
    renderer.append('Hello');
    renderer.append(' World');

    // 此时应该还没有刷新
    expect(flushSpy).not.toHaveBeenCalled();

    // 等待 RAF
    jest.advanceTimersByTime(16);
    expect(flushSpy).toHaveBeenCalledWith('Hello World');
  });

  it('应该在遇到标点符号时立即刷新', () => {
    const flushSpy = jest.fn();

    class TestRenderer extends BatchRenderer {
      protected onFlush(text: string): void {
        flushSpy(text);
      }
    }

    const renderer = new TestRenderer();
    renderer.append('你好');
    renderer.append('。');

    // 遇到标点应该立即刷新
    expect(flushSpy).toHaveBeenCalledWith('你好。');
  });

  it('应该在超时后强制刷新', () => {
    jest.useFakeTimers();
    const flushSpy = jest.fn();

    class TestRenderer extends BatchRenderer {
      protected onFlush(text: string): void {
        flushSpy(text);
      }
    }

    const renderer = new TestRenderer();
    renderer.append('Hello');

    // 模拟 50ms 超时
    jest.advanceTimersByTime(50);
    expect(flushSpy).toHaveBeenCalledWith('Hello');

    jest.useRealTimers();
  });

  it('工具调用应该立即刷新', () => {
    const flushSpy = jest.fn();

    class TestRenderer extends BatchRenderer {
      protected onFlush(text: string): void {
        flushSpy(text);
      }
    }

    const renderer = new TestRenderer();
    renderer.append('执行命令', true);

    // 工具调用应该立即刷新
    expect(flushSpy).toHaveBeenCalledWith('执行命令');
  });

  it('应该正确清理定时器', () => {
    jest.useFakeTimers();
    const flushSpy = jest.fn();

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
    jest.advanceTimersByTime(16);

    // 不应该调用 flush（因为已销毁）
    expect(flushSpy).not.toHaveBeenCalled();

    jest.useRealTimers();
  });
});

describe('ChatMessageRenderer', () => {
  it('应该正确更新消息状态', () => {
    const messages = new Map<string, string>();
    const updateState = (id: string, text: string) => {
      messages.set(id, text);
    };

    const renderer = new ChatMessageRenderer('msg-1', updateState);

    renderer.append('Hello');
    renderer.append(' World');

    // 触发刷新
    jest.advanceTimersByTime(16);

    expect(messages.get('msg-1')).toBe('Hello World');
  });
});
