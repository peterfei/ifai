/**
 * TaskTree Context - 工业级任务树状态管理
 * v0.2.6
 *
 * 提供统一的状态管理：
 * - 折叠/展开状态
 * - 选中节点
 * - 详情面板显示
 */

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { TaskNode, TaskStatus } from '../../types/taskBreakdown';

/**
 * 节点展开状态映射
 */
interface ExpandedState {
  [nodeId: string]: boolean;
}

/**
 * TaskTree Context 状态
 */
interface TaskTreeContextValue {
  /** 当前选中的节点 */
  selectedNode: TaskNode | null;
  /** 展开状态映射 */
  expandedState: ExpandedState;
  /** 是否显示详情面板 */
  showDetailPanel: boolean;
  /** 选中节点 */
  selectNode: (node: TaskNode | null) => void;
  /** 切换节点展开状态 */
  toggleExpanded: (nodeId: string) => void;
  /** 展开所有节点 */
  expandAll: () => void;
  /** 折叠所有节点 */
  collapseAll: () => void;
  /** 显示详情面板 */
  showDetail: () => void;
  /** 隐藏详情面板 */
  hideDetail: () => void;
  /** 更新节点状态（通过 store） */
  updateNodeStatus: (nodeId: string, status: TaskStatus) => void;
}

const TaskTreeContext = createContext<TaskTreeContextValue | undefined>(undefined);

/**
 * TaskTree Provider Props
 */
interface TaskTreeProviderProps {
  children: ReactNode;
  /** 初始化时默认展开的层级深度 */
  defaultExpandDepth?: number;
  /** 更新节点状态的回调 */
  onUpdateNodeStatus?: (nodeId: string, status: TaskStatus) => void;
}

/**
 * TaskTree Provider 组件
 */
export const TaskTreeProvider: React.FC<TaskTreeProviderProps> = ({
  children,
  defaultExpandDepth = 1,
  onUpdateNodeStatus,
}) => {
  const [selectedNode, setSelectedNode] = useState<TaskNode | null>(null);
  const [expandedState, setExpandedState] = useState<ExpandedState>({});
  const [showDetailPanel, setShowDetailPanel] = useState(false);

  /**
   * 初始化展开状态（递归）
   */
  const initializeExpanded = useCallback((node: TaskNode, depth: number): ExpandedState => {
    const state: ExpandedState = {};

    // 默认展开到指定深度
    if (depth < defaultExpandDepth && node.children && node.children.length > 0) {
      state[node.id] = true;
      node.children.forEach(child => {
        Object.assign(state, initializeExpanded(child, depth + 1));
      });
    }

    return state;
  }, [defaultExpandDepth]);

  /**
   * 选中节点
   */
  const selectNode = useCallback((node: TaskNode | null) => {
    setSelectedNode(node);
    if (node) {
      setShowDetailPanel(true);
    }
  }, []);

  /**
   * 切换节点展开状态
   */
  const toggleExpanded = useCallback((nodeId: string) => {
    setExpandedState(prev => ({
      ...prev,
      [nodeId]: !prev[nodeId],
    }));
  }, []);

  /**
   * 展开所有节点
   */
  const expandAll = useCallback(() => {
    setExpandedState(prev => {
      const newState: ExpandedState = { ...prev };
      // 遍历所有节点，设置为展开
      // 注意：这里需要在 TaskTree 中传入完整树结构
      return newState;
    });
  }, []);

  /**
   * 折叠所有节点
   */
  const collapseAll = useCallback(() => {
    setExpandedState({});
  }, []);

  /**
   * 显示详情面板
   */
  const showDetail = useCallback(() => {
    setShowDetailPanel(true);
  }, []);

  /**
   * 隐藏详情面板
   */
  const hideDetail = useCallback(() => {
    setShowDetailPanel(false);
  }, []);

  /**
   * 更新节点状态
   */
  const updateNodeStatus = useCallback((nodeId: string, status: TaskStatus) => {
    if (onUpdateNodeStatus) {
      onUpdateNodeStatus(nodeId, status);
    }
  }, [onUpdateNodeStatus]);

  const value: TaskTreeContextValue = {
    selectedNode,
    expandedState,
    showDetailPanel,
    selectNode,
    toggleExpanded,
    expandAll,
    collapseAll,
    showDetail,
    hideDetail,
    updateNodeStatus,
  };

  return (
    <TaskTreeContext.Provider value={value}>
      {children}
    </TaskTreeContext.Provider>
  );
};

/**
 * Hook: 使用 TaskTree Context
 */
export const useTaskTree = () => {
  const context = useContext(TaskTreeContext);
  if (!context) {
    throw new Error('useTaskTree must be used within TaskTreeProvider');
  }
  return context;
};

export default TaskTreeContext;
