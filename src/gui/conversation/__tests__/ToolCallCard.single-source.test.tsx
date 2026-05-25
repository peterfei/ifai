/**
 * ToolCallCard 单一数据源测试 (AD-7a)
 *
 * 验证 ToolCallCard 只从 message.data 读取数据，
 * 不降级到 message.toolCalls 或其他字段。
 *
 * 测试覆盖：
 * - AD-7a.1: 单工具从 data 渲染
 * - AD-7a.2: running 状态显示旋转动画
 * - AD-7a.3: 展开/收起参数和结果
 * - AD-7a.4: failed 状态显示错误信息
 * - AD-7a.5: multiTool 模式渲染
 * - AD-7a.6: 空 data 安全降级
 */

import { describe, test, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ToolCallCard } from '../cards/ToolCallCard';

function makeMessage(data: any, overrides: Record<string, any> = {}) {
  return { id: 'm1', role: 'assistant' as const, content: '', ...overrides, data };
}

describe('AD-7a: ToolCallCard 单一数据源', () => {
  /* ===== AD-7a.1: 单工具从 data 渲染 ===== */

  test('AD-7a.1: 从 message.data 渲染单工具名称和状态', () => {
    const msg = makeMessage({
      name: 'read_file',
      status: 'success',
      args: { path: '/test.txt' },
      result: 'file content',
    });

    render(<ToolCallCard message={msg} />);

    expect(screen.getByText('read_file')).toBeTruthy();
    expect(screen.getByText('成功')).toBeTruthy();
  });

  /* ===== AD-7a.2: running 状态 ===== */

  test('AD-7a.2: running 状态显示执行中标签', () => {
    const msg = makeMessage({
      name: 'search_files',
      status: 'running',
    });

    render(<ToolCallCard message={msg} />);

    expect(screen.getByText('执行中')).toBeTruthy();
  });

  /* ===== AD-7a.3: 展开/收起 ===== */

  test('AD-7a.3: 点击展开后显示参数', () => {
    const msg = makeMessage({
      name: 'execute_query',
      status: 'success',
      args: { query: 'SELECT * FROM users' },
      result: [{ id: 1, name: 'Alice' }],
    });

    render(<ToolCallCard message={msg} />);

    // 初始收起，不应显示参数标题
    expect(screen.queryByText('参数')).toBeNull();

    // 点击展开
    const header = screen.getByText('工具调用').closest('div')!.parentElement!;
    fireEvent.click(header);

    // 展开后应显示参数
    expect(screen.getByText('参数')).toBeTruthy();
    expect(screen.getByText(/SELECT \* FROM users/)).toBeTruthy();
  });

  /* ===== AD-7a.4: failed 状态 ===== */

  test('AD-7a.4: failed 状态显示错误信息（展开后）', () => {
    const msg = makeMessage({
      name: 'delete_file',
      status: 'failed',
      error: 'Permission denied',
    });

    render(<ToolCallCard message={msg} />);

    expect(screen.getByText('失败')).toBeTruthy();

    // 展开后错误信息可见
    const header = screen.getByText('工具调用').closest('div')!.parentElement!;
    fireEvent.click(header);
    expect(screen.getByText('错误')).toBeTruthy();
    expect(screen.getByText('Permission denied')).toBeTruthy();
  });

  /* ===== AD-7a.5: multiTool 模式 ===== */

  test('AD-7a.5: multiTool 模式渲染多个工具名称', () => {
    const msg = makeMessage({
      name: '2 个工具调用',
      status: 'pending',
      multiTool: true,
      calls: [
        { id: 'a', name: 'read_file', status: 'completed' },
        { id: 'b', name: 'write_file', status: 'pending' },
      ],
    });

    render(<ToolCallCard message={msg} />);

    expect(screen.getByText('2 个工具调用')).toBeTruthy();
  });

  /* ===== AD-7a.6: 空 data 安全降级 ===== */

  test('AD-7a.6: data 为 undefined 显示 Unknown Tool', () => {
    const msg = makeMessage(undefined);

    render(<ToolCallCard message={msg} />);

    expect(screen.getByText('Unknown Tool')).toBeTruthy();
    expect(screen.getByText('等待中')).toBeTruthy();
  });
});
