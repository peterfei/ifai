/**
 * TaskNode - 工业级任务树节点组件
 * v0.2.6
 *
 * 特性：
 * - 连接线显示层级
 * - 平滑展开/折叠动画
 * - 状态图标和颜色
 * - 悬停和选中效果
 * - 优先级标签
 * - 工时显示
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronRight,
  ChevronDown,
  Circle,
  Loader,
  CheckCircle2,
  XCircle,
  Clock,
  Tag,
  GitBranch,
} from 'lucide-react';
import { TaskNode as TaskNodeType } from '../../types/taskBreakdown';
import { useTranslation } from 'react-i18next';
import { useTaskTree } from './TaskTreeContext';
import { formatTaskHours, getTaskCategoryLabel, getTaskPriorityMeta, getTaskStatusMeta } from './taskBreakdownMeta';

interface TaskNodeProps {
  node: TaskNodeType;
  depth?: number;
  /** 父节点是否有后续兄弟（用于连接线） */
  hasSiblingAfter?: boolean;
}

/**
 * TaskNode 组件
 */
export const TaskNode: React.FC<TaskNodeProps> = ({
  node,
  depth = 0,
  hasSiblingAfter = false,
}) => {
  const { t } = useTranslation();
  const { selectNode, expandedState, toggleExpanded, selectedNode } = useTaskTree();
  const [isHovered, setIsHovered] = useState(false);

  const isExpanded = expandedState[node.id] || false;
  const isSelected = selectedNode?.id === node.id;
  const hasChildren = node.children && node.children.length > 0;
  const statusMeta = getTaskStatusMeta(node.status, t);
  const priorityMeta = getTaskPriorityMeta(node.priority, t);
  const categoryLabel = getTaskCategoryLabel(node.category, t);
  const iconMap = {
    pending: Circle,
    inProgress: Loader,
    completed: CheckCircle2,
    failed: XCircle,
  };
  const StatusIcon = iconMap[statusMeta.key];

  /**
   * 处理节点点击
   */
  const handleClick = () => {
    selectNode(node);
  };

  /**
   * 处理展开/折叠按钮点击
   */
  const handleToggleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (hasChildren) {
      toggleExpanded(node.id);
    }
  };

  /**
   * 计算进度百分比
   */
  const calculateProgress = () => {
    if (!node.children || node.children.length === 0) {
      return statusMeta.key === 'completed' ? 100 : 0;
    }

    const totalChildren = node.children.length;
    const completedChildren = node.children.filter((child) => getTaskStatusMeta(child.status, t).key === 'completed').length;
    return Math.round((completedChildren / totalChildren) * 100);
  };

  const progress = calculateProgress();

  return (
    <div className="relative">
      {/* 连接线 */}
      <div
        className="absolute bottom-0 left-0 top-0 w-px"
        style={{ marginLeft: '11px', background: 'linear-gradient(180deg, var(--border-color), transparent)' }}
      />

      {/* 节点内容 */}
      <motion.div
        className={`
          relative flex items-start gap-2 py-2 px-3 rounded-lg border cursor-pointer transition-all
          ${isSelected
            ? `${statusMeta.surfaceClass} ${statusMeta.borderClass} theme-shadow`
            : 'border-transparent theme-soft-hover hover:border-[var(--border-strong)]'
          }
        `}
        onClick={handleClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.2 }}
      >
        {/* 展开/折叠按钮 */}
        <div
          className={`
            flex items-center justify-center w-6 h-6 rounded transition-colors
            ${hasChildren ? 'theme-hoverable cursor-pointer' : 'opacity-30'}
          `}
          onClick={handleToggleClick}
        >
          {hasChildren ? (
            isExpanded ? (
              <ChevronDown className="theme-text-subtle w-4 h-4" />
            ) : (
              <ChevronRight className="theme-text-subtle w-4 h-4" />
            )
          ) : (
            <div className="theme-divider h-2 w-2 rounded-full" />
          )}
        </div>

        {/* 状态图标 */}
        <div className={`flex h-6 w-6 items-center justify-center rounded-full ${statusMeta.surfaceClass}`}>
          <StatusIcon className={`h-4 w-4 ${statusMeta.textClass} ${statusMeta.key === 'inProgress' ? 'animate-spin' : ''}`} />
        </div>

        {/* 节点信息 */}
        <div className="flex-1 min-w-0">
          {/* 标题行 */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="theme-text truncate text-sm font-medium">
              {node.title}
            </span>

            {/* 状态标签 */}
            <span className={`rounded border px-1.5 py-0.5 text-[10px] ${statusMeta.badgeClass}`}>
              {statusMeta.label}
            </span>

            {/* 优先级标签 */}
            {priorityMeta && (
              <span className={`rounded px-1.5 py-0.5 text-[10px] ${priorityMeta.badgeClass}`}>
                {priorityMeta.label}
              </span>
            )}

            {/* 类别标签 */}
            {categoryLabel && (
              <span className="theme-panel-elevated theme-border theme-text-subtle flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px]">
                <Tag className="w-3 h-3" />
                {categoryLabel}
              </span>
            )}

            {/* 工时 */}
            {node.estimatedHours && (
              <span className="theme-text-subtle flex items-center gap-1 text-[10px]">
                <Clock className="w-3 h-3" />
                {formatTaskHours(node.estimatedHours, t, true)}
              </span>
            )}

            {/* 依赖关系 */}
            {node.dependencies && node.dependencies.length > 0 && (
              <span className="theme-text-subtle flex items-center gap-1 text-[10px]" title={t('taskBreakdown.labels.dependenciesTitle', { items: node.dependencies.join(', ') })}>
                <GitBranch className="w-3 h-3" />
                {node.dependencies.length}
              </span>
            )}
          </div>

          {/* 描述（如果有） */}
          {node.description && (isHovered || isSelected) && (
            <motion.p
              className="theme-text-subtle mt-1 line-clamp-2 text-xs"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
            >
              {node.description}
            </motion.p>
          )}

          {/* 进度条（有子任务时显示） */}
          {hasChildren && (
            <div className="mt-2">
              <div className="flex items-center gap-2">
                <div className="theme-panel-elevated flex-1 overflow-hidden rounded-full h-1">
                  <motion.div
                    className={`h-full ${statusMeta.progressClass}`}
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
                <span className="theme-text-subtle text-[10px]">
                  {progress}%
                </span>
              </div>
            </div>
          )}
        </div>
      </motion.div>

      {/* 子节点 */}
      <AnimatePresence>
        {isExpanded && hasChildren && (
          <motion.div
            className="theme-border ml-6 mt-1 space-y-1 border-l pl-4"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
          >
            {node.children!.map((child, index) => (
              <TaskNode
                key={child.id}
                node={child}
                depth={depth + 1}
                hasSiblingAfter={index < node.children!.length - 1}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default TaskNode;
