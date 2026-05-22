/**
 * PreviewPanel 组件测试
 *
 * PP-1 ~ PP-4: 代码预览子面板
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PreviewPanel } from '../../panels/PreviewPanel';
import type { FileChangeData } from '../../panels/useArtifactData';

const sampleFile: FileChangeData = {
  name: 'useForm.ts',
  size: '2.4 KB',
  type: 'ts',
  path: '/src/hooks/useForm.ts',
  additions: 80,
  deletions: 0,
};

describe('PreviewPanel', () => {
  // PP-1: 无选中文件时显示占位
  it('PP-1: 无选中文件时显示占位', () => {
    render(<PreviewPanel />);

    expect(screen.getByText(/选择文件查看预览/i)).toBeTruthy();
  });

  // PP-2: 选中文件后显示代码内容
  it('PP-2: 选中文件后显示代码内容', () => {
    render(<PreviewPanel file={sampleFile} />);

    // 显示文件名
    expect(screen.getByText('useForm.ts')).toBeTruthy();
    // 显示文件路径
    expect(screen.getByText('/src/hooks/useForm.ts')).toBeTruthy();
  });

  // PP-3: data-testid="preview-panel"
  it('PP-3: data-testid="preview-panel"', () => {
    render(<PreviewPanel />);

    expect(screen.getByTestId('preview-panel')).toBeTruthy();
  });

  // PP-4: 支持 FileChangeData prop
  it('PP-4: 支持 FileChangeData prop', () => {
    const { rerender } = render(<PreviewPanel />);

    // 无文件
    expect(screen.getByText(/选择文件查看预览/i)).toBeTruthy();

    // 有文件
    rerender(<PreviewPanel file={sampleFile} />);
    expect(screen.getByText('useForm.ts')).toBeTruthy();

    // 切换文件
    const otherFile: FileChangeData = {
      name: 'Button.tsx',
      size: '1.8 KB',
      type: 'tsx',
      path: '/src/components/Button.tsx',
      additions: 60,
      deletions: 0,
    };
    rerender(<PreviewPanel file={otherFile} />);
    expect(screen.getByText('Button.tsx')).toBeTruthy();
  });
});
