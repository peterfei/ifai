/**
 * 简单任务树视图组件
 * v0.2.6 新增：用于快速展示任务树结构
 */

import React from 'react';
import { TaskNode } from '../../types/taskBreakdown';

interface SimpleTaskViewProps {
  taskTree: TaskNode;
  depth?: number;
}

/**
 * 获取任务状态对应的颜色和图标
 */
const getStatusStyle = (status: TaskNode['status']) => {
  switch (status) {
    case 'pending':
      return { color: 'text-gray-400', bg: 'bg-gray-500', icon: '○' };
    case 'in_progress':
      return { color: 'text-blue-400', bg: 'bg-blue-500', icon: '◐' };
    case 'completed':
      return { color: 'text-green-400', bg: 'bg-green-500', icon: '●' };
    case 'failed':
      return { color: 'text-red-400', bg: 'bg-red-500', icon: '✕' };
    default:
      return { color: 'text-gray-400', bg: 'bg-gray-500', icon: '○' };
  }
};

/**
 * 获取任务类别对应的标签
 */
const getCategoryLabel = (category?: TaskNode['category']) => {
  if (!category) return null;
  const labels = {
    development: '开发',
    testing: '测试',
    documentation: '文档',
    design: '设计',
    research: '研究',
  };
  return labels[category] || category;
};

/**
 * 递归渲染任务节点
 */
const TaskNodeItem: React.FC<{ node: TaskNode; depth: number }> = ({ node, depth }) => {
  const statusStyle = getStatusStyle(node.status);
  const indent = depth * 16; // 每层缩进 16px
  const categoryLabel = getCategoryLabel(node.category);

  return (
    <div className="mb-1">
      {/* 任务节点 */}
      <div
        className="flex items-center gap-2 py-1 px-2 rounded hover:bg-[#2d2d2d] transition-colors"
        style={{ marginLeft: `${indent}px` }}
      >
        {/* 状态图标 */}
        <span className={`text-xs ${statusStyle.color}`} title={node.status}>
          {statusStyle.icon}
        </span>

        {/* 任务标题 */}
        <span className="text-sm text-gray-200 flex-1">{node.title}</span>

        {/* 工时估算 */}
        {node.estimatedHours && (
          <span className="text-xs text-gray-500">
            {node.estimatedHours}h
          </span>
        )}

        {/* 类别标签 */}
        {categoryLabel && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#3c3c3c] text-gray-400">
            {categoryLabel}
          </span>
        )}

        {/* 优先级 */}
        {node.priority && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${
            node.priority === 'high' || node.priority === 'critical'
              ? 'bg-red-900/50 text-red-300'
              : node.priority === 'medium'
              ? 'bg-yellow-900/50 text-yellow-300'
              : 'bg-gray-700 text-gray-400'
          }`}>
            {node.priority === 'high' ? '高' :
             node.priority === 'medium' ? '中' :
             node.priority === 'low' ? '低' :
             node.priority === 'critical' ? '紧急' : ''}
          </span>
        )}
      </div>

      {/* 任务描述（如果有） */}
      {node.description && (
        <div
          className="text-xs text-gray-500 ml-6 mb-1"
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
            <div key={index} className="text-xs text-gray-600 flex items-start gap-1">
              <span>✓</span>
              <span>{criteria}</span>
            </div>
          ))}
        </div>
      )}

      {/* 依赖关系（如果有） */}
      {node.dependencies && node.dependencies.length > 0 && (
        <div
          className="text-xs text-gray-600 ml-6 mb-1"
          style={{ marginLeft: `${indent + 20}px` }}
        >
          依赖: {node.dependencies.join(', ')}
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
