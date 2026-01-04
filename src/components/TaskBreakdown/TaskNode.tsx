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
import { TaskNode as TaskNodeType, TaskStatus } from '../../types/taskBreakdown';
import { useTaskTree } from './TaskTreeContext';

interface TaskNodeProps {
  node: TaskNodeType;
  depth?: number;
  /** 父节点是否有后续兄弟（用于连接线） */
  hasSiblingAfter?: boolean;
}

/**
 * 获取状态对应的样式
 */
const getStatusConfig = (status: TaskStatus) => {
  switch (status) {
    case 'pending':
      return {
        icon: Circle,
        color: 'text-gray-400',
        bgColor: 'bg-gray-500/10',
        borderColor: 'border-gray-500/30',
        label: '待办',
        labelColor: 'text-gray-400',
      };
    case 'in_progress':
      return {
        icon: Loader,
        color: 'text-blue-400',
        bgColor: 'bg-blue-500/10',
        borderColor: 'border-blue-500/30',
        label: '进行中',
        labelColor: 'text-blue-400',
      };
    case 'completed':
      return {
        icon: CheckCircle2,
        color: 'text-green-400',
        bgColor: 'bg-green-500/10',
        borderColor: 'border-green-500/30',
        label: '已完成',
        labelColor: 'text-green-400',
      };
    case 'failed':
      return {
        icon: XCircle,
        color: 'text-red-400',
        bgColor: 'bg-red-500/10',
        borderColor: 'border-red-500/30',
        label: '失败',
        labelColor: 'text-red-400',
      };
    default:
      return {
        icon: Circle,
        color: 'text-gray-400',
        bgColor: 'bg-gray-500/10',
        borderColor: 'border-gray-500/30',
        label: '待办',
        labelColor: 'text-gray-400',
      };
  }
};

/**
 * 获取优先级样式
 */
const getPriorityStyle = (priority?: string) => {
  switch (priority) {
    case 'urgent':
      return 'bg-red-500/20 text-red-300 border-red-500/30';
    case 'high':
      return 'bg-orange-500/20 text-orange-300 border-orange-500/30';
    case 'medium':
      return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30';
    case 'low':
      return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    default:
      return 'bg-gray-500/10 text-gray-500 border-gray-500/20';
  }
};

/**
 * 获取类别标签
 */
const getCategoryLabel = (category?: string) => {
  if (!category) return null;
  const labels: Record<string, string> = {
    development: '开发',
    testing: '测试',
    documentation: '文档',
    design: '设计',
    research: '研究',
    deployment: '部署',
  };
  return labels[category] || category;
};

/**
 * TaskNode 组件
 */
export const TaskNode: React.FC<TaskNodeProps> = ({
  node,
  depth = 0,
  hasSiblingAfter = false,
}) => {
  const { selectNode, expandedState, toggleExpanded, selectedNode } = useTaskTree();
  const [isHovered, setIsHovered] = useState(false);

  const isExpanded = expandedState[node.id] || false;
  const isSelected = selectedNode?.id === node.id;
  const hasChildren = node.children && node.children.length > 0;
  const statusConfig = getStatusConfig(node.status);
  const StatusIcon = statusConfig.icon;

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
      return node.status === 'completed' ? 100 : 0;
    }

    const totalChildren = node.children.length;
    const completedChildren = node.children.filter(c => c.status === 'completed').length;
    return Math.round((completedChildren / totalChildren) * 100);
  };

  const progress = calculateProgress();

  return (
    <div className="relative">
      {/* 连接线 */}
      <div className="absolute left-0 top-0 bottom-0 w-px bg-gradient-to-b from-gray-700/50 to-transparent" style={{ marginLeft: '11px' }} />

      {/* 节点内容 */}
      <motion.div
        className={`
          relative flex items-start gap-2 py-2 px-3 rounded-lg border cursor-pointer transition-all
          ${isSelected
            ? `${statusConfig.bgColor} ${statusConfig.borderColor} border shadow-lg shadow-black/20`
            : 'border-transparent hover:bg-[#2a2a2a] hover:border-gray-700/50'
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
            ${hasChildren ? 'hover:bg-[#3a3a3a] cursor-pointer' : 'opacity-30'}
          `}
          onClick={handleToggleClick}
        >
          {hasChildren ? (
            isExpanded ? (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronRight className="w-4 h-4 text-gray-400" />
            )
          ) : (
            <div className="w-2 h-2 rounded-full bg-gray-600" />
          )}
        </div>

        {/* 状态图标 */}
        <div className={`flex items-center justify-center w-6 h-6 rounded-full ${statusConfig.bgColor}`}>
          <StatusIcon className={`w-4 h-4 ${statusConfig.color} ${node.status === 'in_progress' ? 'animate-spin' : ''}`} />
        </div>

        {/* 节点信息 */}
        <div className="flex-1 min-w-0">
          {/* 标题行 */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-sm font-medium ${statusConfig.color} truncate`}>
              {node.title}
            </span>

            {/* 状态标签 */}
            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${statusConfig.bgColor} ${statusConfig.borderColor} ${statusConfig.labelColor}`}>
              {statusConfig.label}
            </span>

            {/* 优先级标签 */}
            {node.priority && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded border ${getPriorityStyle(node.priority)}`}>
                {node.priority === 'urgent' ? '紧急' :
                 node.priority === 'high' ? '高' :
                 node.priority === 'medium' ? '中' :
                 node.priority === 'low' ? '低' : ''}
              </span>
            )}

            {/* 类别标签 */}
            {node.category && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700/50 text-gray-400 border border-gray-600/30 flex items-center gap-1">
                <Tag className="w-3 h-3" />
                {getCategoryLabel(node.category)}
              </span>
            )}

            {/* 工时 */}
            {node.estimatedHours && (
              <span className="text-[10px] text-gray-500 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {node.estimatedHours}h
              </span>
            )}

            {/* 依赖关系 */}
            {node.dependencies && node.dependencies.length > 0 && (
              <span className="text-[10px] text-gray-600 flex items-center gap-1" title={`依赖: ${node.dependencies.join(', ')}`}>
                <GitBranch className="w-3 h-3" />
                {node.dependencies.length}
              </span>
            )}
          </div>

          {/* 描述（如果有） */}
          {node.description && (isHovered || isSelected) && (
            <motion.p
              className="text-xs text-gray-500 mt-1 line-clamp-2"
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
                <div className="flex-1 h-1 bg-gray-700/50 rounded-full overflow-hidden">
                  <motion.div
                    className={`h-full ${statusConfig.color.replace('text', 'bg')}`}
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
                <span className="text-[10px] text-gray-500">
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
            className="ml-6 pl-4 border-l border-gray-700/30 mt-1 space-y-1"
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
