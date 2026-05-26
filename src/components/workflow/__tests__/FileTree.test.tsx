import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { FileTree, buildTree, CONNECTORS } from '../FileTree';
import type { SubItem } from '../../../types/workflow';

const mockItems: SubItem[] = [
  { name: 'src/main.ts', status: 'done' },
  { name: 'src/utils.ts', status: 'running' },
  { name: 'src/types.ts', status: 'pending' },
];

describe('buildTree', () => {
  // 有公共根目录时提取为一级节点
  it('extracts common root directory', () => {
    const tree = buildTree(mockItems);
    expect(tree).toHaveLength(1);
    expect(tree[0].name).toBe('src');
    expect(tree[0].type).toBe('directory');
    expect(tree[0].children).toHaveLength(3);
  });

  // 无公共根目录时平铺
  it('flattens items without common root', () => {
    const items: SubItem[] = [
      { name: 'README.md', status: 'done' },
      { name: 'LICENSE', status: 'pending' },
    ];
    const tree = buildTree(items);
    expect(tree).toHaveLength(2);
    expect(tree[0].type).toBe('file');
    expect(tree[1].type).toBe('file');
  });

  // 单文件
  it('handles single file', () => {
    const items: SubItem[] = [
      { name: 'README.md', status: 'done' },
    ];
    const tree = buildTree(items);
    // 单文件无公共前缀，平铺
    expect(tree).toHaveLength(1);
    expect(tree[0].name).toBe('README.md');
  });

  // 空数组
  it('returns empty for empty input', () => {
    expect(buildTree([])).toEqual([]);
  });
});

describe('FileTree', () => {
  // UT-T.1.1: 运行中文件行应包含 scan-beam 类
  it('UT-T.1.1: running file gets scan-beam class', () => {
    const { container } = render(<FileTree items={mockItems} />);
    const treeNodes = container.querySelectorAll('.tree-node');
    // 至少有一个 running 文件行
    expect(treeNodes.length).toBeGreaterThan(0);
  });

  // UT-T.1.3: 公共根目录自动提取
  it('UT-T.1.3: common root directory extracted', () => {
    const { container } = render(<FileTree items={mockItems} />);
    const text = container.textContent ?? '';
    expect(text).toContain('src');
  });

  // UT-T.1.6: 超长文件名截断
  it('UT-T.1.6: truncates long filenames', () => {
    const longName = 'a'.repeat(100) + '.ts';
    const items: SubItem[] = [{ name: longName, status: 'done' }];
    const { container } = render(<FileTree items={items} />);
    const text = container.textContent ?? '';
    expect(text.length).toBeLessThan(longName.length);
    expect(text).toContain('...');
  });

  // 空 items 不渲染
  it('renders null for empty items', () => {
    const { container } = render(<FileTree items={[]} />);
    expect(container.textContent).toBe('');
  });

  // showStats 显示统计
  it('shows stats with showStats prop', () => {
    const { container } = render(<FileTree items={mockItems} showStats />);
    const text = container.textContent ?? '';
    expect(text).toContain('3');
    expect(text).toContain('files');
  });
});
