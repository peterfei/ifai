/**
 * 工具参数UI优化单元测试
 * 验证ToolArgsViewer、StreamingToolArgsViewer和ToolExecutionIndicator组件功能
 */

import { describe, test, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { ToolArgsViewer, CompactToolArgsViewer } from '../../src/components/AIChat/ToolArgsViewer';
import { StreamingToolArgsViewer } from '../../src/components/AIChat/StreamingToolArgsViewer';
import { ToolExecutionIndicator } from '../../src/components/AIChat/ToolExecutionIndicator';

// Mock react-i18next: t() returns the key as-is
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('Tool Args UI Optimization', () => {
  test('should render simple arguments correctly', () => {
    const args = {
      path: '/tmp/test.js',
      content: 'console.log("test");',
    };

    const { container } = render(<ToolArgsViewer args={args} />);

    expect(container.textContent).toContain('/tmp/test.js');
    expect(container.textContent).toContain('console.log("test");');
  });

  test('should render nested object arguments', () => {
    const args = {
      config: {
        debug: true,
        timeout: 5000,
        options: {
          verbose: false,
        },
      },
    };

    const { container } = render(<ToolArgsViewer args={args} />);

    expect(container.textContent).toContain('config');
    expect(container.textContent).toContain('debug');
    expect(container.textContent).toContain('timeout');
  });

  test('should render array arguments', () => {
    const args = {
      paths: ['/tmp/a.js', '/tmp/b.js', '/tmp/c.js'],
    };

    const { container } = render(<ToolArgsViewer args={args} />);

    expect(container.textContent).toContain('paths');
    expect(container.textContent).toContain('aiChat.toolArgsViewer.arrayCount');
  });

  test('should render partial state with loading indicator', () => {
    const args = {
      path: '/tmp/partial.js',
      content: '',
    };

    const { container } = render(<ToolArgsViewer args={args} isPartial={true} />);

    expect(container.textContent).toContain('aiChat.toolArgsViewer.generating');
  });

  test('should render empty args', () => {
    const { container } = render(<ToolArgsViewer args={{}} />);

    expect(container.textContent).toContain('aiChat.toolArgsViewer.none');
  });
});

describe('Compact Tool Args Viewer', () => {
  test('should render compact view', () => {
    const args = {
      path: '/tmp/test.js',
      content: 'test content',
    };

    const { container } = render(<CompactToolArgsViewer args={args} />);

    expect(container.textContent).toContain('path:');
    expect(container.textContent).toContain('content:');
  });

  test('should show count for many args', () => {
    const args = {
      a: 1,
      b: 2,
      c: 3,
      d: 4,
    };

    const { container } = render(<CompactToolArgsViewer args={args} />);

    expect(container.textContent).toContain('aiChat.toolArgsViewer.moreParameters');
  });
});

describe('Tool Execution Indicator', () => {
  test('should render pending status', () => {
    const { container } = render(<ToolExecutionIndicator status="pending" />);

    expect(container.textContent).toContain('aiChat.toolExecution.status.pending');
  });

  test('should render running status with animation', () => {
    const { container } = render(
      <ToolExecutionIndicator status="running" message="正在执行..." />
    );

    expect(container.textContent).toContain('aiChat.toolExecution.status.running');
    expect(container.textContent).toContain('正在执行...');
  });

  test('should render completed status', () => {
    const { container } = render(<ToolExecutionIndicator status="completed" />);

    expect(container.textContent).toContain('aiChat.toolExecution.status.completed');
  });

  test('should render failed status', () => {
    const { container } = render(<ToolExecutionIndicator status="failed" />);

    expect(container.textContent).toContain('aiChat.toolExecution.status.failed');
  });

  test('should render progress bar when progress provided', () => {
    const { container } = render(
      <ToolExecutionIndicator status="running" progress={50} />
    );

    expect(container.textContent).toContain('50%');
    expect(container.textContent).toContain('aiChat.toolExecution.progress');
  });

  test('should render compact mode', () => {
    const { container } = render(
      <ToolExecutionIndicator status="running" compact={true} />
    );

    expect(container.firstChild).toHaveClass('flex');
  });
});

describe('Streaming Tool Args Viewer', () => {
  test('should render empty state', () => {
    const { container } = render(
      <StreamingToolArgsViewer args={{}} isStreaming={false} />
    );

    expect(container.textContent).toContain('aiChat.streamingToolArgs.none');
  });

  test('should render checkbox-style parameters', () => {
    const args = {
      path: '/tmp/test.txt',
      content: 'hello world',
    };

    const { container } = render(
      <StreamingToolArgsViewer args={args} isStreaming={false} />
    );

    expect(container.textContent).toContain('path:');
    expect(container.textContent).toContain('content:');
    expect(container.textContent).toContain('/tmp/test.txt');
  });

  test('should show streaming indicator when isStreaming is true', () => {
    const args = {
      path: '/tmp/test.txt',
    };

    const { container } = render(
      <StreamingToolArgsViewer
        args={args}
        isStreaming={true}
        streamingKeys={['path']}
      />
    );

    expect(container.textContent).toContain('/tmp/test.txt');
    // 应该不再包含“生成中...”，因为 hasValue 为 true
    expect(container.textContent).not.toContain('生成中...');
  });

  test('should show checked state for completed parameters', () => {
    const args = {
      path: '/tmp/test.txt',
      content: 'test',
    };

    const { container } = render(
      <StreamingToolArgsViewer args={args} isStreaming={false} />
    );

    // 应该有成功样式的checkbox
    const checkbox = container.querySelector('.theme-surface-success');
    expect(checkbox).toBeTruthy();
  });

  test('should truncate long values', () => {
    const args = {
      content: 'x'.repeat(200),
    };

    const { container } = render(
      <StreamingToolArgsViewer args={args} isStreaming={false} />
    );

    const text = container.textContent || '';
    expect(text).toContain('...');
  });

  test('should show loading spinner when streaming with no args', () => {
    const { container } = render(
      <StreamingToolArgsViewer args={{}} isStreaming={true} />
    );

    expect(container.textContent).toContain('aiChat.streamingToolArgs.generatingArgs');
  });
});
