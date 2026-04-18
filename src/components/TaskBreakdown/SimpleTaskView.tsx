/**
 * 简单任务树视图组件
 * v0.2.6 新增：用于快速展示任务树结构
 */

import React from 'react';
import { Check, CheckCircle2, Circle, Loader2, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { TaskNode as TaskNodeType } from '../../types/taskBreakdown';
import { formatTaskHours, getTaskCategoryLabel, getTaskPriorityMeta, getTaskStatusMeta } from './taskBreakdownMeta';

interface SimpleTaskViewProps {
  taskTree: TaskNodeType;
  depth?: number;
}

/**
 * 递归渲染任务节点
 */
const TaskNodeItem: React.FC<{ node: TaskNodeType; depth: number }> = ({ node, depth }) => {
  const { t } = useTranslation();
  const statusMeta = getTaskStatusMeta(node.status, t);
  const priorityMeta = getTaskPriorityMeta(node.priority, t);
  const indent = depth * 16; // 每层缩进 16px
  const categoryLabel = getTaskCategoryLabel(node.category, t);
  const statusIcon = {
    pending: <Circle className={`h-3.5 w-3.5 ${statusMeta.textClass}`} />,
    inProgress: <Loader2 className={`h-3.5 w-3.5 animate-spin ${statusMeta.textClass}`} />,
    completed: <CheckCircle2 className={`h-3.5 w-3.5 ${statusMeta.textClass}`} />,
    failed: <XCircle className={`h-3.5 w-3.5 ${statusMeta.textClass}`} />,
  }[statusMeta.key];

  return (
    <div className="mb-1">
      {/* 任务节点 */}
      <div
        className="theme-hoverable flex items-center gap-2 rounded px-2 py-1 transition-colors"
        style={{ marginLeft: `${indent}px` }}
      >
        {/* 状态图标 */}
        <span className="text-xs" title={statusMeta.label}>
          {statusIcon}
        </span>

        {/* 任务标题 */}
        <span className="theme-text flex-1 text-sm">{node.title}</span>

        {/* 工时估算 */}
        {node.estimatedHours && (
          <span className="theme-text-subtle text-xs">
            {formatTaskHours(node.estimatedHours, t, true)}
          </span>
        )}

        {/* 类别标签 */}
        {categoryLabel && (
          <span className="theme-panel-elevated theme-border theme-text-subtle rounded border px-1.5 py-0.5 text-[10px]">
            {categoryLabel}
          </span>
        )}

        {/* 优先级 */}
        {priorityMeta && (
          <span className={`rounded px-1.5 py-0.5 text-[10px] ${priorityMeta.badgeClass}`}>
            {priorityMeta.label}
          </span>
        )}
      </div>

      {/* 任务描述（如果有） */}
      {node.description && (
        <div
          className="theme-text-subtle mb-1 ml-6 text-xs"
          style={{ marginLeft: `${indent + 20}px` }}
        >
          {node.description}
        </div>
      )}

      {/* 验收标准（如果有） */}
      {node.acceptanceCriteria && node.acceptanceCriteria.length > 0 && (
        <div
          className="ml-6 mb-2"
          style={{ marginLeft: `${indent + 20}px` }}
        >
          {node.acceptanceCriteria.map((criteria, index) => (
            <div key={index} className="theme-text-subtle flex items-start gap-1 text-xs">
              <Check className="theme-text-success mt-0.5 h-3 w-3 flex-shrink-0" />
              <span>{criteria}</span>
            </div>
          ))}
        </div>
      )}

      {/* 依赖关系（如果有） */}
      {node.dependencies && node.dependencies.length > 0 && (
        <div
          className="theme-text-subtle mb-1 ml-6 text-xs"
          style={{ marginLeft: `${indent + 20}px` }}
        >
          {t('taskBreakdown.labels.dependenciesTitle', { items: node.dependencies.join(', ') })}
        </div>
      )}

      {/* 子任务 */}
      {node.children && node.children.length > 0 && (
        <div>
          {node.children.map((child) => (
            <TaskNodeItem key={child.id} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * 简单任务树视图
 */
export const SimpleTaskView: React.FC<SimpleTaskViewProps> = ({ taskTree, depth = 0 }) => {
  return (
    <div className="font-mono text-sm">
      <TaskNodeItem node={taskTree} depth={depth} />
    </div>
  );
};

export default SimpleTaskView;
