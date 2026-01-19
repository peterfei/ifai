/**
 * 任务树格式化工具
 * 将任务树结构转换为可读的日志格式
 * @module taskTree
 */

/**
 * 任务树节点接口
 */
export interface ParsedTaskNode {
  id: string;
  title: string;
  children?: ParsedTaskNode[];
}

/**
 * 从任务树构建树状日志显示
 * @param node - 任务节点
 * @param depth - 深度（用于缩进）
 * @param prefix - 前缀（用于树状连接线）
 * @param isRoot - 是否是根节点
 * @returns 日志数组
 */
export function buildTaskTreeLogs(
  node: ParsedTaskNode,
  depth: number = 0,
  prefix: string = '',
  isRoot: boolean = false
): string[] {
  const logs: string[] = [];

  // 如果是根节点，直接显示标题
  if (isRoot) {
    logs.push(`📋 ${node.title}`);
    // 处理子节点
    if (node.children && node.children.length > 0) {
      node.children.forEach((child, index) => {
        const isLast = index === node.children!.length - 1;
        const childPrefix = isLast ? '  └─ ' : '  ├─ ';
        const childLogs = buildTaskTreeLogs(child, depth + 1, childPrefix, false);
        logs.push(...childLogs);
      });
    }
  } else {
    // 非根节点，添加前缀
    logs.push(`${prefix}📋 ${node.title}`);

    // 处理子节点（递归）
    if (node.children && node.children.length > 0) {
      // 计算子节点的前缀
      const parentIsLast = prefix.includes('└─');
      const childBasePrefix = parentIsLast ? '    ' : '│   ';

      node.children.forEach((child, index) => {
        const isLast = index === node.children!.length - 1;
        const childPrefix = `${childBasePrefix}${isLast ? '└─ ' : '├─ '}`;
        const childLogs = buildTaskTreeLogs(child, depth + 1, childPrefix, false);
        logs.push(...childLogs);
      });
    }
  }

  return logs;
}
