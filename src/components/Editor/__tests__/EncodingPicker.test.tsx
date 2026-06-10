/**
 * EncodingPicker 点击交互链测试
 *
 * 测试覆盖：
 * - 渲染触发按钮显示当前编码
 * - 点击触发按钮打开下拉菜单（createPortal 到 document.body）
 * - 列出所有编码选项
 * - 选择非当前编码 -> 调用 changeFileEncoding
 * - 选择当前编码 -> 不调用 changeFileEncoding（短路返回）
 * - 选择后下拉菜单自动关闭
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';

// ---------- Mock Stores ----------

const mockChangeFileEncoding = vi.fn(async () => {});

vi.mock('../../../stores/fileStore', () => ({
  useFileStore: (selector: (s: any) => any) =>
    selector({ changeFileEncoding: mockChangeFileEncoding }),
}));

// ---------- Mock sonner toast ----------

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { EncodingPicker } from '../EncodingPicker';

describe('EncodingPicker 点击交互链', () => {
  const testFileId = 'file-001';

  beforeEach(() => {
    mockChangeFileEncoding.mockReset();
    // 重置 document.body，清除前一次测试的 portal 残留
    document.body.innerHTML = '';
  });

  // ──────────────────────────────────────────────
  // 1. 渲染触发按钮
  // ──────────────────────────────────────────────

  it('应渲染触发按钮并显示当前编码', () => {
    render(<EncodingPicker fileId={testFileId} currentEncoding="UTF-8" />);

    const trigger = screen.getByTestId('encoding-picker-trigger');
    expect(trigger).toBeTruthy();
    expect(trigger.textContent).toBe('UTF-8');
  });

  // ──────────────────────────────────────────────
  // 2. 点击触发按钮 -> 下拉菜单出现
  // ──────────────────────────────────────────────

  it('点击触发按钮后应出现下拉菜单', () => {
    render(<EncodingPicker fileId={testFileId} currentEncoding="UTF-8" />);

    fireEvent.click(screen.getByTestId('encoding-picker-trigger'));

    // 下拉菜单通过 createPortal 渲染到 document.body
    const dropdown = screen.getByTestId('encoding-picker-dropdown');
    expect(dropdown).toBeTruthy();
  });

  // ──────────────────────────────────────────────
  // 3. 下拉菜单应列出所有编码选项
  // ──────────────────────────────────────────────

  it('下拉菜单应列出所有编码选项', () => {
    render(<EncodingPicker fileId={testFileId} currentEncoding="UTF-8" />);

    fireEvent.click(screen.getByTestId('encoding-picker-trigger'));

    // 验证 CP936 选项存在且标签正确
    const cp936Option = screen.getByTestId('encoding-option-CP936');
    expect(cp936Option).toBeTruthy();
    expect(cp936Option.textContent).toContain('CP936 (GBK)');

    // 验证 UTF-8 选项存在
    const utf8Option = screen.getByTestId('encoding-option-UTF-8');
    expect(utf8Option).toBeTruthy();
    expect(utf8Option.textContent).toContain('UTF-8');
  });

  // ──────────────────────────────────────────────
  // 4. 选择非当前编码 -> 调用 changeFileEncoding
  // ──────────────────────────────────────────────

  it('选择非当前编码时应调用 changeFileEncoding 并传入正确的 fileId 和编码', async () => {
    render(<EncodingPicker fileId={testFileId} currentEncoding="UTF-8" />);

    // 打开下拉菜单
    fireEvent.click(screen.getByTestId('encoding-picker-trigger'));

    // 选择 CP936 (GBK)
    await act(async () => {
      fireEvent.click(screen.getByTestId('encoding-option-CP936'));
    });

    expect(mockChangeFileEncoding).toHaveBeenCalledTimes(1);
    expect(mockChangeFileEncoding).toHaveBeenCalledWith(testFileId, 'CP936');
  });

  // ──────────────────────────────────────────────
  // 5. 选择后下拉菜单应关闭
  // ──────────────────────────────────────────────

  it('选择编码后下拉菜单应关闭', async () => {
    render(<EncodingPicker fileId={testFileId} currentEncoding="UTF-8" />);

    // 打开
    fireEvent.click(screen.getByTestId('encoding-picker-trigger'));
    expect(screen.getByTestId('encoding-picker-dropdown')).toBeTruthy();

    // 选择 CP936
    await act(async () => {
      fireEvent.click(screen.getByTestId('encoding-option-CP936'));
    });

    // 下拉菜单应消失
    expect(screen.queryByTestId('encoding-picker-dropdown')).toBeNull();
  });

  // ──────────────────────────────────────────────
  // 6. 选择当前编码 -> 不调用 changeFileEncoding（短路返回）
  // ──────────────────────────────────────────────

  it('选择当前编码时不调用 changeFileEncoding', async () => {
    render(<EncodingPicker fileId={testFileId} currentEncoding="CP936" />);

    // 打开下拉菜单
    fireEvent.click(screen.getByTestId('encoding-picker-trigger'));

    // 选择 CP936（当前编码）
    await act(async () => {
      fireEvent.click(screen.getByTestId('encoding-option-CP936'));
    });

    // changeFileEncoding 不应被调用（handleSelect 先比较 encoding === currentEncoding，相等则直接 return）
    expect(mockChangeFileEncoding).not.toHaveBeenCalled();
  });

  // ──────────────────────────────────────────────
  // 7. 选择当前编码后下拉菜单也应关闭
  // ──────────────────────────────────────────────

  it('选择当前编码后下拉菜单也应关闭', async () => {
    render(<EncodingPicker fileId={testFileId} currentEncoding="CP936" />);

    fireEvent.click(screen.getByTestId('encoding-picker-trigger'));
    expect(screen.getByTestId('encoding-picker-dropdown')).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByTestId('encoding-option-CP936'));
    });

    expect(screen.queryByTestId('encoding-picker-dropdown')).toBeNull();
  });
});
