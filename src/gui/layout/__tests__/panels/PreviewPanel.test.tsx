/**
 * PreviewPanel 组件测试 — 内置浏览器预览
 *
 * PP-1 ~ PP-8: 预览面板测试
 * Tauri 模式（invoke + blob URL）通过 isTauri() 运行时检测自动切换，
 * 单元测试覆盖浏览器模式 + 空态/错误态/控件
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PreviewPanel } from '../../panels/PreviewPanel';
import type { FileChangeData } from '../../panels/useArtifactData';

// =============================================================
// Mock: fileStore.rootPath
// =============================================================
let mockRootPath: string | null = '/home/user/project';

vi.mock('../../../../stores/fileStore', () => ({
  useFileStore: (selector?: any) => {
    const state = { rootPath: mockRootPath };
    return selector ? selector(state) : state;
  },
}));

// =============================================================
// 辅助
// =============================================================

function makeHtmlFile(name: string, path?: string): FileChangeData {
  return {
    name,
    size: '3.2 KB',
    type: 'html',
    path: path || `/home/user/project/${name}`,
    additions: 120,
    deletions: 0,
  };
}

describe('PreviewPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRootPath = '/home/user/project';
    // 测试浏览器模式（非 Tauri 环境）
    delete (window as any).__TAURI_INTERNALS__;
  });

  // PP-1: 空态
  it('PP-1: 无选中文件时显示提示', () => {
    render(<PreviewPanel />);
    expect(screen.getByText(/选择产出物中的 HTML 文件以预览/i)).toBeTruthy();
    expect(screen.getByTestId('preview-panel')).toBeTruthy();
  });

  // PP-2: 非 HTML 文件
  it('PP-2: 非 HTML 文件显示提示', () => {
    render(<PreviewPanel file={{ name: 'app.js', size: '1.2 KB', type: 'js', path: '/src/app.js', additions: 40, deletions: 0 }} />);
    expect(screen.getByText(/当前文件不是 HTML，无法预览/i)).toBeTruthy();
  });

  // PP-3: HTML 文件 → 渲染 iframe（浏览器模式 HTTP URL）
  it('PP-3: 浏览器模式渲染 iframe with HTTP URL', async () => {
    render(<PreviewPanel file={makeHtmlFile('index.html')} />);

    await waitFor(() => {
      const iframe = document.querySelector('iframe');
      expect(iframe).toBeTruthy();
      expect(iframe?.getAttribute('src')).toBe('http://localhost:8080/index.html');
    });
  });

  // PP-4: 子目录 URL 正确
  it('PP-4: 浏览器模式子目录 URL', async () => {
    render(<PreviewPanel file={makeHtmlFile('game.html', '/home/user/project/sub/dir/game.html')} />);

    await waitFor(() => {
      const iframe = document.querySelector('iframe');
      expect(iframe?.getAttribute('src')).toBe('http://localhost:8080/sub/dir/game.html');
    });
  });

  // PP-5: 根路径不匹配时使用完整路径
  it('PP-5: 路径不匹配时使用完整路径', async () => {
    render(<PreviewPanel file={makeHtmlFile('game.html', '/other/project/game.html')} />);

    await waitFor(() => {
      const iframe = document.querySelector('iframe');
      // 不匹配 rootPath，直接用 file.path
      expect(iframe?.getAttribute('src')).toBe('http://localhost:8080/other/project/game.html');
    });
  });

  // PP-6: 刷新按钮 → 递增 key 重新挂载 iframe
  it('PP-6: 刷新按钮存在且可点击', () => {
    render(<PreviewPanel file={makeHtmlFile('game.html')} />);
    expect(screen.getByText(/刷新/i)).toBeTruthy();
    fireEvent.click(screen.getByText(/刷新/i));
    // 不报错即可
  });

  // PP-7: 关闭按钮存在
  it('PP-7: 关闭按钮存在', () => {
    render(<PreviewPanel file={makeHtmlFile('index.html')} />);
    expect(screen.getByText(/关闭/i)).toBeTruthy();
  });

  // PP-8: 设备模拟切换
  it('PP-8: 设备模式下拉切换', () => {
    render(<PreviewPanel file={makeHtmlFile('index.html')} />);
    expect(screen.getByText(/Desktop/i)).toBeTruthy();
    fireEvent.click(screen.getByText(/Desktop/i));
    expect(screen.getByText(/Mobile/i)).toBeTruthy();
    expect(screen.getByText(/Tablet/i)).toBeTruthy();
  });
});
