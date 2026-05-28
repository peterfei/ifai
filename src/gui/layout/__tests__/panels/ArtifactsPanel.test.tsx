/**
 * ArtifactsPanel 组件测试
 *
 * AP-1 ~ AP-5: 产出物子面板
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ArtifactsPanel } from '../../panels/ArtifactsPanel';
import type { FileChangeData } from '../../panels/useArtifactData';

// Mock useArtifactData
const mockArtifacts: FileChangeData[] = [];

vi.mock('../../panels/previewRules', () => ({
  isHtmlFile: (name: string) => /\.html?$/i.test(name),
}));

vi.mock('../../panels/useArtifactData', () => ({
  useArtifactData: () => mockArtifacts,
}));

describe('ArtifactsPanel', () => {
  beforeEach(() => {
    mockArtifacts.length = 0;
  });

  // AP-1: 渲染文件列表
  it('AP-1: 渲染文件列表', () => {
    mockArtifacts.push(
      { name: 'useForm.ts', size: '2.4 KB', type: 'ts', path: '/src/hooks/useForm.ts', additions: 80, deletions: 0 },
      { name: 'Button.tsx', size: '1.8 KB', type: 'tsx', path: '/src/components/Button.tsx', additions: 60, deletions: 0 },
    );

    render(<ArtifactsPanel />);

    expect(screen.getByText('useForm.ts')).toBeTruthy();
    expect(screen.getByText('Button.tsx')).toBeTruthy();
  });

  // AP-2: 点击文件触发 onFileSelect
  it('AP-2: 点击文件触发 onFileSelect', () => {
    const file = { name: 'useForm.ts', size: '2.4 KB', type: 'ts', path: '/src/hooks/useForm.ts', additions: 80, deletions: 0 };
    mockArtifacts.push(file);

    const onFileSelect = vi.fn();
    render(<ArtifactsPanel onFileSelect={onFileSelect} />);

    fireEvent.click(screen.getByText('useForm.ts'));
    expect(onFileSelect).toHaveBeenCalledWith(file);
  });

  // AP-3: 文件图标根据类型显示
  it('AP-3: 文件图标根据类型显示', () => {
    mockArtifacts.push(
      { name: 'app.ts', size: '1.0 KB', type: 'ts', path: '/src/app.ts', additions: 30, deletions: 0 },
      { name: 'app.test.ts', size: '2.0 KB', type: 'test', path: '/src/app.test.ts', additions: 60, deletions: 0 },
      { name: 'styles.css', size: '0.5 KB', type: 'css', path: '/src/styles.css', additions: 15, deletions: 0 },
    );

    render(<ArtifactsPanel />);

    // 每种类型都应有图标标签
    expect(screen.getByText('TS')).toBeTruthy();  // ts → TS
    expect(screen.getByText('T')).toBeTruthy();   // test → T
    expect(screen.getByText('C')).toBeTruthy();   // css → C
  });

  // AP-4: 无产出物时显示空状态
  it('AP-4: 无产出物时显示空状态', () => {
    render(<ArtifactsPanel />);

    expect(screen.getByText(/暂无产出物/i)).toBeTruthy();
  });

  // AP-5: data-testid="artifacts-panel"
  it('AP-5: data-testid="artifacts-panel"', () => {
    render(<ArtifactsPanel />);

    expect(screen.getByTestId('artifacts-panel')).toBeTruthy();
  });

  // AP-6: HTML 文件显示预览图标
  it('AP-6: HTML 文件显示预览图标', () => {
    mockArtifacts.push(
      { name: 'index.html', size: '3.2 KB', type: 'html', path: '/src/index.html', additions: 100, deletions: 0 },
      { name: 'app.js', size: '1.2 KB', type: 'js', path: '/src/app.js', additions: 40, deletions: 0 },
    );

    render(<ArtifactsPanel />);

    // HTML 文件名旁应有预览图标
    expect(screen.getByText('🔗')).toBeTruthy();
    // JS 文件名旁不应有预览图标
    expect(screen.getByText('app.js')).toBeTruthy();
  });
});
