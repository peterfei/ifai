/**
 * 单元测试：文件引用上下文菜单
 *
 * 任务 1.7.7: 文件引用上下文菜单单元测试（UNIT-FR-1~5）
 *
 * 测试覆盖：
 * - UNIT-FR-1: 工具函数测试（isFilePath, extractFileInfo, formatFileSize）
 * - UNIT-FR-2: FileReferenceContextMenu 组件渲染
 * - UNIT-FR-3: 菜单项点击和策略执行
 * - UNIT-FR-4: 菜单位置计算（避免超出屏幕）
 * - UNIT-FR-5: 复制状态自动清除
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isFilePath,
  extractFileInfo,
  formatFileSize,
  calculateFileMenuPosition,
  FileReferenceContextMenu,
  createDefaultFileMenuItems,
  createDefaultFileMenuStrategies,
  type FileReference,
  type FileMenuContext,
} from '../FileReferenceContextMenu';

describe('FileReferenceContextMenu - 工具函数', () => {

  describe('isFilePath', () => {

    it('UNIT-FR-1.1: 识别绝对路径（Unix）', () => {
      expect(isFilePath('/src/components/App.tsx')).toBe(true);
      expect(isFilePath('/usr/local/bin/script.sh')).toBe(false); // 不支持的扩展名
      expect(isFilePath('/home/user/docs/readme.md')).toBe(true);
    });

    it('UNIT-FR-1.2: 识别绝对路径（Windows）', () => {
      expect(isFilePath('C:\\Users\\test\\file.ts')).toBe(true);
      expect(isFilePath('D:\\project\\src\\index.js')).toBe(true);
    });

    it('UNIT-FR-1.3: 识别相对路径', () => {
      expect(isFilePath('./src/utils/helpers.ts')).toBe(true);
      expect(isFilePath('../components/Button.tsx')).toBe(true);
      expect(isFilePath('../../package.json')).toBe(true);
    });

    it('UNIT-FR-1.4: 识别项目路径', () => {
      expect(isFilePath('src/components/AIChat/MarkdownRenderer.tsx')).toBe(true);
      expect(isFilePath('utils/helpers.js')).toBe(true);
      expect(isFilePath('config/settings.json')).toBe(true);
    });

    it('UNIT-FR-1.5: 拒绝非文件路径', () => {
      expect(isFilePath('https://github.com')).toBe(false);
      expect(isFilePath('/api/users')).toBe(false);
      expect(isFilePath('#section1')).toBe(false);
      expect(isFilePath('mailto:test@example.com')).toBe(false);
      expect(isFilePath('/path/to/file')).toBe(false); // 没有扩展名
      expect(isFilePath('/path/to/file.unknown')).toBe(false); // 不支持的扩展名
    });

    it('UNIT-FR-1.6: 支持所有预定义的文件扩展名', () => {
      const extensions = [
        'ts', 'tsx', 'js', 'jsx', 'py', 'md', 'json', 'css', 'html', 'txt',
        'yaml', 'yml', 'toml', 'xml'
      ];

      extensions.forEach(ext => {
        expect(isFilePath(`/src/file.${ext}`)).toBe(true);
        expect(isFilePath(`./file.${ext}`)).toBe(true);
      });
    });
  });

  describe('extractFileInfo', () => {

    it('UNIT-FR-1.7: 提取文件名', () => {
      const info = extractFileInfo('/src/components/App.tsx');
      expect(info.fileName).toBe('App.tsx');
    });

    it('UNIT-FR-1.8: 提取扩展名', () => {
      const testCases = [
        { path: '/src/App.tsx', expectedExt: 'tsx' },
        { path: './utils/helpers.js', expectedExt: 'js' },
        { path: '../README.md', expectedExt: 'md' },
        { path: 'config/settings.json', expectedExt: 'json' },
        { path: '/path/to/file', expectedExt: '' },
      ];

      testCases.forEach(({ path, expectedExt }) => {
        const info = extractFileInfo(path);
        expect(info.extension).toBe(expectedExt);
      });
    });

    it('UNIT-FR-1.9: 保留原始路径', () => {
      const path = '/src/components/AIChat/MarkdownRenderer.tsx';
      const info = extractFileInfo(path);
      expect(info.path).toBe(path);
    });

    it('UNIT-FR-1.10: 处理 Windows 路径', () => {
      const info = extractFileInfo('C:\\Users\\test\\file.ts');
      expect(info.fileName).toBe('file.ts');
      expect(info.extension).toBe('ts');
    });
  });

  describe('formatFileSize', () => {

    it('UNIT-FR-1.11: 格式化字节数', () => {
      expect(formatFileSize(0)).toBe('0 B');
      expect(formatFileSize(500)).toBe('500 B');
      expect(formatFileSize(1024)).toBe('1 KB');
      expect(formatFileSize(1536)).toBe('1.5 KB');
      expect(formatFileSize(1024 * 1024)).toBe('1 MB');
      expect(formatFileSize(1024 * 1024 * 1.5)).toBe('1.5 MB');
      expect(formatFileSize(1024 * 1024 * 1024)).toBe('1 GB');
    });
  });

  describe('calculateFileMenuPosition', () => {

    it('UNIT-FR-1.12: 基本位置计算', () => {
      const position = calculateFileMenuPosition(
        { x: 100, y: 100 },
        5,
        { width: 200, itemHeight: 36, padding: 10 }
      );

      expect(position.x).toBe(100);
      expect(position.y).toBe(100);
    });

    it('UNIT-FR-1.13: 避免超出右边界', () => {
      // 设置视口宽度
      global.innerWidth = 300;

      const position = calculateFileMenuPosition(
        { x: 250, y: 100 }, // 靠近右边界
        5,
        { width: 200, itemHeight: 36, padding: 10 }
      );

      // 菜单宽度 200 + padding 10 = 210
      // 视口宽度 300，最大 x 位置应该是 300 - 210 = 90
      expect(position.x).toBeLessThanOrEqual(90);
    });

    it('UNIT-FR-1.14: 避免超出下边界', () => {
      // 设置视口高度
      global.innerHeight = 200;

      const position = calculateFileMenuPosition(
        { x: 100, y: 150 }, // 靠近下边界
        5,
        { width: 200, itemHeight: 36, padding: 10 }
      );

      // 菜单高度 5 * 36 + 10 = 190
      // 视口高度 200，最大 y 位置应该是 200 - 190 = 10
      expect(position.y).toBeLessThanOrEqual(10);
    });
  });
});

describe('FileReferenceContextMenu - 组件', () => {

  let mockFile: FileReference;
  let mockPosition: { x: number; y: number };
  let mockContext: FileMenuContext;

  beforeEach(() => {
    mockFile = {
      path: '/src/components/App.tsx',
      fileName: 'App.tsx',
      extension: 'tsx',
    };

    mockPosition = { x: 100, y: 100 };

    mockContext = {
      file: mockFile,
      position: mockPosition,
      onClose: vi.fn(),
      copyToClipboard: vi.fn().mockResolvedValue(undefined),
      openInEditor: vi.fn().mockResolvedValue(undefined),
      showInFinder: vi.fn().mockResolvedValue(undefined),
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('UNIT-FR-2.1: 渲染文件引用上下文菜单', () => {
    const { container } = render(
      <FileReferenceContextMenu
        file={mockFile}
        items={createDefaultFileMenuItems()}
        strategies={createDefaultFileMenuStrategies()}
        position={mockPosition}
        context={mockContext}
      />
    );

    // 验证文件名头部
    expect(screen.getByText('App.tsx')).toBeInTheDocument();
    expect(screen.getByText('TSX')).toBeInTheDocument();

    // 验证菜单项
    expect(screen.getByText('在编辑器中打开')).toBeInTheDocument();
    expect(screen.getByText('复制文件路径')).toBeInTheDocument();
    expect(screen.getByText('复制相对路径')).toBeInTheDocument();
    expect(screen.getByText('在文件管理器中显示')).toBeInTheDocument();
    expect(screen.getByText('文件信息')).toBeInTheDocument();
  });

  it('UNIT-FR-2.2: 菜单使用 Portal 渲染到 body', () => {
    const { container } = render(
      <FileReferenceContextMenu
        file={mockFile}
        items={createDefaultFileMenuItems()}
        strategies={createDefaultFileMenuStrategies()}
        position={mockPosition}
        context={mockContext}
      />
    );

    // 验证菜单不在组件容器内（在 body 中）
    expect(container.querySelector('.fixed.z-50')).not.toBeInTheDocument();

    // 验证菜单在 body 中
    expect(document.body.querySelector('.fixed.z-50')).toBeInTheDocument();
  });

  it('UNIT-FR-3.1: 点击菜单项执行对应策略', async () => {
    render(
      <FileReferenceContextMenu
        file={mockFile}
        items={createDefaultFileMenuItems()}
        strategies={createDefaultFileMenuStrategies()}
        position={mockPosition}
        context={mockContext}
      />
    );

    // 点击"复制文件路径"
    fireEvent.click(screen.getByText('复制文件路径'));

    await waitFor(() => {
      expect(mockContext.copyToClipboard).toHaveBeenCalledWith('/src/components/App.tsx');
    });
  });

  it('UNIT-FR-3.2: 点击"在编辑器中打开"调用 openInEditor', async () => {
    render(
      <FileReferenceContextMenu
        file={mockFile}
        items={createDefaultFileMenuItems()}
        strategies={createDefaultFileMenuStrategies()}
        position={mockPosition}
        context={mockContext}
      />
    );

    fireEvent.click(screen.getByText('在编辑器中打开'));

    await waitFor(() => {
      expect(mockContext.openInEditor).toHaveBeenCalledWith('/src/components/App.tsx');
    });

    // 验证菜单被关闭
    expect(mockContext.onClose).toHaveBeenCalled();
  });

  it('UNIT-FR-3.3: 点击"在文件管理器中显示"调用 showInFinder', async () => {
    render(
      <FileReferenceContextMenu
        file={mockFile}
        items={createDefaultFileMenuItems()}
        strategies={createDefaultFileMenuStrategies()}
        position={mockPosition}
        context={mockContext}
      />
    );

    fireEvent.click(screen.getByText('在文件管理器中显示'));

    await waitFor(() => {
      expect(mockContext.showInFinder).toHaveBeenCalledWith('/src/components/App.tsx');
    });

    expect(mockContext.onClose).toHaveBeenCalled();
  });

  it('UNIT-FR-3.4: 点击"文件信息"显示信息对话框', () => {
    // 模拟 alert（在 jsdom 环境中可能不存在）
    const originalAlert = window.alert;
    const alertSpy = vi.fn();
    Object.defineProperty(window, 'alert', {
      value: alertSpy,
      writable: true,
      configurable: true,
    });

    render(
      <FileReferenceContextMenu
        file={mockFile}
        items={createDefaultFileMenuItems()}
        strategies={createDefaultFileMenuStrategies()}
        position={mockPosition}
        context={mockContext}
      />
    );

    fireEvent.click(screen.getByText('文件信息'));

    expect(alertSpy).toHaveBeenCalled();
    const alertMessage = alertSpy.mock.calls[0][0];
    expect(alertMessage).toContain('App.tsx');
    expect(alertMessage).toContain('TSX');

    // 恢复原始 alert
    Object.defineProperty(window, 'alert', {
      value: originalAlert,
      writable: true,
      configurable: true,
    });
  });

  it('UNIT-FR-4.1: 点击外部区域关闭菜单', () => {
    render(
      <FileReferenceContextMenu
        file={mockFile}
        items={createDefaultFileMenuItems()}
        strategies={createDefaultFileMenuStrategies()}
        position={mockPosition}
        context={mockContext}
      />
    );

    // 模拟点击外部
    fireEvent.mouseDown(document.body);

    expect(mockContext.onClose).toHaveBeenCalled();
  });

  it('UNIT-FR-4.2: 按 ESC 键关闭菜单', () => {
    render(
      <FileReferenceContextMenu
        file={mockFile}
        items={createDefaultFileMenuItems()}
        strategies={createDefaultFileMenuStrategies()}
        position={mockPosition}
        context={mockContext}
      />
    );

    // 模拟按 ESC
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(mockContext.onClose).toHaveBeenCalled();
  });

  it('UNIT-FR-5.1: 复制操作不关闭菜单', async () => {
    render(
      <FileReferenceContextMenu
        file={mockFile}
        items={createDefaultFileMenuItems()}
        strategies={createDefaultFileMenuStrategies()}
        position={mockPosition}
        context={mockContext}
      />
    );

    // 点击"复制文件路径"
    fireEvent.click(screen.getByText('复制文件路径'));

    await waitFor(() => {
      expect(mockContext.copyToClipboard).toHaveBeenCalled();
    });

    // 验证菜单没有被关闭
    expect(mockContext.onClose).not.toHaveBeenCalled();
  });
});

describe('FileReferenceContextMenu - 默认配置', () => {

  it('UNIT-FR-5.2: 创建默认菜单项', () => {
    const items = createDefaultFileMenuItems();

    expect(items).toHaveLength(5);
    expect(items[0].id).toBe('openInEditor');
    expect(items[1].id).toBe('copyPath');
    expect(items[2].id).toBe('copyRelativePath');
    expect(items[3].id).toBe('showInFinder');
    expect(items[4].id).toBe('fileInfo');
  });

  it('UNIT-FR-5.3: 创建默认策略', () => {
    const strategies = createDefaultFileMenuStrategies();

    expect(strategies).toHaveProperty('openInEditor');
    expect(strategies).toHaveProperty('copyPath');
    expect(strategies).toHaveProperty('copyRelativePath');
    expect(strategies).toHaveProperty('showInFinder');
    expect(strategies).toHaveProperty('showInfo');

    // 验证策略是函数
    Object.values(strategies).forEach(strategy => {
      expect(typeof strategy).toBe('function');
    });
  });

  it('UNIT-FR-5.4: 策略接受正确的参数', async () => {
    const strategies = createDefaultFileMenuStrategies();
    const mockContext: FileMenuContext = {
      file: { path: '/test.tsx', fileName: 'test.tsx' },
      position: { x: 0, y: 0 },
      onClose: vi.fn(),
      copyToClipboard: vi.fn().mockResolvedValue(undefined),
      openInEditor: vi.fn().mockResolvedValue(undefined),
      showInFinder: vi.fn().mockResolvedValue(undefined),
    } as any;

    // 添加 setCopiedItem 方法（组件内部使用）
    mockContext.setCopiedItem = vi.fn();

    // 测试 copyPath 策略
    await strategies.copyPath(mockContext.file, null, mockContext);
    expect(mockContext.copyToClipboard).toHaveBeenCalledWith('/test.tsx');
    expect(mockContext.setCopiedItem).toHaveBeenCalledWith('copyPath');
  });
});
