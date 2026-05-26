// ============================================================
// FileTree — 工作流文件树组件
//
// 递归 TreeItem + 公共根目录提取 + TUI 连接符 (├─/└─/┌─)。
// 复用 PivoProjectTree 的递归树模式，扩展 TreeNode 加 status。
// 参考: design.md §2 + §7.1
// ============================================================

import React, { useMemo } from 'react';
import { StatusIcon } from './StatusIcon';
import type { SubItem, PhaseStatus } from '../../types/workflow';

/** 文件树节点（扩展 TreeNode 加 status） */
export interface ScanNode {
  name: string;
  type: 'file' | 'directory';
  status: PhaseStatus;
  children?: ScanNode[];
}

interface FileTreeProps {
  /** 文件列表（不包含根目录的平铺路径） */
  items: SubItem[];
  /** 是否显示统计数据 */
  showStats?: boolean;
}

interface TreeItemProps {
  node: ScanNode;
  level: number;
  isLast: boolean;
  isRoot: boolean;
}

// ============================================================
// 工具函数
// ============================================================

/** 从 SubItem[] 构建 ScanNode 树（公共根目录提取） */
export function buildTree(items: SubItem[]): ScanNode[] {
  if (!items.length) return [];

  // 提取公共根目录
  const paths = items.map(i => i.name.split('/').filter(Boolean));

  // 找出公共前缀
  const commonPrefix = findCommonPrefix(paths);

  if (commonPrefix.length > 0) {
    // 有公共根目录 → 根目录为一级节点
    const children = paths.map(parts => {
      const relative = parts.slice(commonPrefix.length);
      const fullPath = parts.join('/');
      const item = items.find(i => i.name === fullPath)!;
      return {
        name: relative.join('/'),
        type: 'file' as const,
        status: item.status,
      };
    });

    const rootName = commonPrefix.join('/');
    const rootStatus = items.some(i => i.status === 'running') ? 'running' as const
      : items.every(i => i.status === 'done') ? 'done' as const
      : 'pending' as const;

    return [{
      name: rootName,
      type: 'directory' as const,
      status: rootStatus,
      children,
    }];
  }

  // 无公共根目录 → 所有文件平铺
  return items.map(item => ({
    name: item.name,
    type: 'file' as const,
    status: item.status,
  }));
}

/** 查找路径数组的公共前缀 */
function findCommonPrefix(paths: string[][]): string[] {
  if (!paths.length) return [];
  if (paths.length === 1) {
    // 单文件时返回空（用 ┌─ 连接符）
    return [];
  }

  const first = paths[0];
  let prefixLen = first.length;

  for (let i = 1; i < paths.length; i++) {
    let j = 0;
    while (j < prefixLen && j < paths[i].length && paths[i][j] === first[j]) {
      j++;
    }
    prefixLen = j;
    if (prefixLen === 0) break;
  }

  return first.slice(0, prefixLen);
}

/** 截断超长文件名 */
function truncateName(name: string, maxLen: number = 30): string {
  if (name.length <= maxLen) return name;
  return '...' + name.slice(-(maxLen - 3));
}

// ============================================================
// 连接符
// ============================================================

const CONNECTORS = {
  branch: '├─ ',
  leaf: '└─ ',
  single: '┌─ ',
  indent: '   ',
  pipe: '│  ',
} as const;

// ============================================================
// TreeItem 递归组件
// ============================================================

const TreeItem: React.FC<TreeItemProps> = ({ node, level, isLast, isRoot }) => {
  const connector = isRoot
    ? ''
    : isLast
      ? CONNECTORS.leaf
      : CONNECTORS.branch;

  const indent = level > 0
    ? Array.from({ length: level - 1 }, (_, i) =>
        // 缩进线（border-l 模拟）
        '  '
      ).join('')
    : '';

  const isRunning = node.status === 'running';

  return (
    <div
      className={`tree-node flex items-center gap-1 py-0.5 ${isRunning ? 'scan-beam' : ''}`}
      style={{
        paddingLeft: `${8 + level * 12}px`,
        animationDelay: `${level * 0.04}s`,
      }}
    >
      <span className="text-white/15 font-mono text-[10px] shrink-0">
        {indent}{connector}
      </span>
      <StatusIcon status={node.status} />
      <span
        className="font-mono text-[10px] truncate max-w-[180px]"
        title={node.name}
      >
        {truncateName(node.name)}
      </span>
      {node.type === 'directory' && (
        <span className="text-white/20 text-[9px]">({node.children?.length ?? 0})</span>
      )}
    </div>
  );
};

// ============================================================
// FileTree 组件
// ============================================================

export const FileTree: React.FC<FileTreeProps> = ({ items, showStats = false }) => {
  const tree = useMemo(() => buildTree(items), [items]);

  if (!tree.length) return null;

  const stats = useMemo(() => ({
    done: items.filter(i => i.status === 'done').length,
    running: items.filter(i => i.status === 'running').length,
    pending: items.filter(i => i.status === 'pending').length,
    total: items.length,
  }), [items]);

  return (
    <div className="overflow-hidden">
      {tree.map((node, i) => {
        const isLast = i === tree.length - 1;
        return (
          <div key={node.name}>
            {renderNode(node, 0, isLast, true)}
            {node.children?.map((child, ci) => (
              <TreeItem
                key={`${node.name}/${child.name}`}
                node={child}
                level={1}
                isLast={ci === (node.children?.length ?? 0) - 1}
                isRoot={false}
              />
            ))}
          </div>
        );
      })}
      {showStats && stats.total > 0 && (
        <div className="text-white/30 font-mono text-[9px] pt-1 pl-2">
          {stats.done}/{stats.total} files
          {stats.running > 0 && ` · ${stats.running} running`}
        </div>
      )}
    </div>
  );
};

function renderNode(node: ScanNode, level: number, isLast: boolean, isRoot: boolean): React.ReactNode {
  if (isRoot) {
    return (
      <div className="tree-node flex items-center gap-1 py-0.5" style={{ paddingLeft: '8px' }}>
        <StatusIcon status={node.status} />
        <span className="font-mono text-[10px] text-white/40 truncate max-w-[180px]">
          {truncateName(node.name)}
        </span>
      </div>
    );
  }
  return <TreeItem node={node} level={level} isLast={isLast} isRoot={false} />;
}

export { CONNECTORS };
