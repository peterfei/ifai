/**
 * TaskDetailPanel - 工业级任务详情面板
 * v0.2.6
 *
 * 特性：
 * - 显示完整任务信息
 * - 状态切换（快捷操作）
 * - 验收标准显示
 * - 依赖关系可视化
 * - 子任务列表
 * - 响应式布局
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Copy, CheckCircle2, Clock, Circle, XCircle, Loader2, Calendar, User, GitBranch } from 'lucide-react';
import { TaskNode, TaskStatus } from '../../types/taskBreakdown';

interface TaskDetailPanelProps {
  node: TaskNode;
  /** 面板位置 */
  position?: 'right' | 'bottom';
  /** 关闭回调 */
  onClose?: () => void;
  /** 状态变更回调 */
  onStatusChange?: (nodeId: string, status: TaskStatus) => void;
}

/**
 * 状态选项
 */
const STATUS_OPTIONS: { value: TaskStatus; label: string; icon: any; color: string; bgColor: string }[] = [
  { value: 'pending', label: '待办', icon: Circle, color: 'text-gray-400', bgColor: 'bg-gray-500/10' },
  { value: 'in_progress', label: '进行中', icon: Loader2, color: 'text-blue-400', bgColor: 'bg-blue-500/10' },
  { value: 'completed', label: '已完成', icon: CheckCircle2, color: 'text-green-400', bgColor: 'bg-green-500/10' },
  { value: 'failed', label: '失败', icon: XCircle, color: 'text-red-400', bgColor: 'bg-red-500/10' },
];

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
 * TaskDetailPanel 组件
 */
export const TaskDetailPanel: React.FC<TaskDetailPanelProps> = ({
  node,
  position = 'right',
  onClose,
  onStatusChange,
}) => {
  const [copied, setCopied] = useState(false);
  const currentStatus = STATUS_OPTIONS.find(s => s.value === node.status) || STATUS_OPTIONS[0];
  const StatusIcon = currentStatus.icon;

  /**
   * 复制节点 ID
   */
  const handleCopyId = () => {
    navigator.clipboard.writeText(node.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  /**
   * 处理状态变更
   */
  const handleStatusChange = (status: TaskStatus) => {
    if (onStatusChange) {
      onStatusChange(node.id, status);
    }
  };

  /**
   * 格式化时间戳
   */
  const formatTimestamp = (timestamp?: number) => {
    if (!timestamp) return null;
    const date = new Date(timestamp);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <>
      <motion.div
        className={`
          bg-[#1e1e1e] border-l border-gray-700 flex-shrink-0
          ${position === 'right' ? 'w-96' : 'h-64'}
        `}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 20 }}
        transition={{ duration: 0.2, ease: 'easeInOut' }}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <StatusIcon className={`w-5 h-5 ${currentStatus.color} ${node.status === 'in_progress' ? 'animate-spin' : ''}`} />
            <h3 className="text-sm font-medium text-gray-200 truncate flex-1">
              {node.title}
            </h3>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 rounded-md hover:bg-[#2a2a2a] text-gray-400 hover:text-gray-200 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* 内容区 */}
        <div className="p-4 space-y-4 overflow-auto max-h-[calc(100vh-120px)]">
          {/* 状态切换 */}
          <div>
            <label className="text-xs text-gray-500 mb-2 block">任务状态</label>
            <div className="grid grid-cols-2 gap-2">
              {STATUS_OPTIONS.map((option) => {
                const Icon = option.icon;
                const isActive = option.value === node.status;
                return (
                  <button
                    key={option.value}
                    onClick={() => handleStatusChange(option.value)}
                    className={`
                      flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all
                      ${isActive
                        ? `${option.bgColor} ${option.color} border-current`
                        : 'bg-[#2a2a2a] border-gray-700 text-gray-400 hover:border-gray-600'
                      }
                    `}
                  >
                    <Icon className={`w-4 h-4 ${option.value === 'in_progress' && isActive ? 'animate-spin' : ''}`} />
                    <span>{option.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 基本信息 */}
          <div className="space-y-3">
            {/* 描述 */}
            {node.description && (
              <div>
                <label className="text-xs text-gray-500 mb-1 block">描述</label>
                <p className="text-sm text-gray-300 leading-relaxed">{node.description}</p>
              </div>
            )}

            {/* 任务 ID */}
            <div>
              <label className="text-xs text-gray-500 mb-1 block">任务 ID</label>
              <div className="flex items-center gap-2">
                <code className="text-xs text-gray-400 bg-[#2a2a2a] px-2 py-1 rounded flex-1 truncate">
                  {node.id}
                </code>
                <button
                  onClick={handleCopyId}
                  className="p-1 rounded hover:bg-[#2a2a2a] text-gray-400 hover:text-gray-200 transition-colors"
                  title="复制 ID"
                >
                  <Copy className="w-4 h-4" />
                </button>
                {copied && (
                  <span className="text-xs text-green-400">已复制</span>
                )}
              </div>
            </div>

            {/* 属性网格 */}
            <div className="grid grid-cols-2 gap-3">
              {/* 优先级 */}
              {node.priority && (
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">优先级</label>
                  <span className={`
                    text-xs px-2 py-1 rounded inline-block
                    ${node.priority === 'urgent' ? 'bg-red-500/20 text-red-300' :
                      node.priority === 'high' ? 'bg-orange-500/20 text-orange-300' :
                      node.priority === 'medium' ? 'bg-yellow-500/20 text-yellow-300' :
                      'bg-gray-500/20 text-gray-400'}
                  `}>
                    {node.priority === 'urgent' ? '紧急' :
                     node.priority === 'high' ? '高' :
                     node.priority === 'medium' ? '中' :
                     node.priority === 'low' ? '低' : node.priority}
                  </span>
                </div>
              )}

              {/* 类别 */}
              {node.category && (
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">类别</label>
                  <span className="text-xs px-2 py-1 rounded bg-gray-700/50 text-gray-300 inline-block">
                    {getCategoryLabel(node.category)}
                  </span>
                </div>
              )}

              {/* 工时估算 */}
              {node.estimatedHours && (
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">预估工时</label>
                  <span className="text-xs text-gray-300 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    {node.estimatedHours} 小时
                  </span>
                </div>
              )}
            </div>

            {/* 依赖关系 */}
            {node.dependencies && node.dependencies.length > 0 && (
              <div>
                <label className="text-xs text-gray-500 mb-2 block flex items-center gap-1">
                  <GitBranch className="w-3.5 h-3.5" />
                  依赖关系 ({node.dependencies.length})
                </label>
                <div className="flex flex-wrap gap-2">
                  {node.dependencies.map((depId) => (
                    <code
                      key={depId}
                      className="text-xs text-blue-400 bg-blue-500/10 px-2 py-1 rounded border border-blue-500/20"
                    >
                      {depId}
                    </code>
                  ))}
                </div>
              </div>
            )}

            {/* 验收标准 */}
            {node.acceptanceCriteria && node.acceptanceCriteria.length > 0 && (
              <div>
                <label className="text-xs text-gray-500 mb-2 block">验收标准</label>
                <ul className="space-y-1.5">
                  {node.acceptanceCriteria.map((criteria, index) => (
                    <li
                      key={index}
                      className="text-xs text-gray-300 flex items-start gap-2"
                    >
                      <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                      <span>{criteria}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* 子任务统计 */}
            {node.children && node.children.length > 0 && (
              <div>
                <label className="text-xs text-gray-500 mb-2 block">子任务</label>
                <div className="space-y-1">
                  {node.children.map((child) => {
                    const childStatus = STATUS_OPTIONS.find(s => s.value === child.status);
                    const ChildIcon = childStatus?.icon || Circle;
                    return (
                      <div
                        key={child.id}
                        className="text-xs text-gray-400 flex items-center gap-2 p-2 rounded hover:bg-[#2a2a2a] transition-colors"
                      >
                        <ChildIcon className={`w-3.5 h-3.5 ${childStatus?.color} ${child.status === 'in_progress' ? 'animate-spin' : ''}`} />
                        <span className="flex-1 truncate">{child.title}</span>
                        {child.estimatedHours && (
                          <span className="text-[10px] text-gray-500">{child.estimatedHours}h</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </>
  );
};

export default TaskDetailPanel;
