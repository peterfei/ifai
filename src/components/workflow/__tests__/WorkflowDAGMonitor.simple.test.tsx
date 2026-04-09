/**
 * WorkflowDAGMonitor 组件测试 (TDD)
 *
 * 红绿测试循环：
 * 🔴 RED: 编写失败的测试
 * 🟢 GREEN: 编写最小代码使测试通过
 * 🔄 REFACTOR: 重构优化代码
 *
 * 使用全局测试事件总线解决 Tauri 架构约束
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { vi, beforeEach, afterEach, describe, it, expect } from 'vitest';

// ==================== 导入组件 ====================

import { WorkflowDAGMonitor } from '../WorkflowDAGMonitor';
import type { DAGNode, DAGEdge } from '../WorkflowDAGMonitor';

// ==================== 测试辅助函数 ====================

/** 获取全局测试事件总线 */
function getTestEventBus() {
  return (globalThis as any).__TEST_EVENT_BUS__;
}

/** 发送工作流进度事件 */
function emitWorkflowProgressEvent(data: {
  event_type: 'node_started' | 'node_progress' | 'node_completed' | 'tool_call';
  node_id?: string;
  message?: string;
  timestamp: number;
}) {
  getTestEventBus().emit('workflow:progress', data);
}

/** 发送工作流完成事件 */
function emitWorkflowCompletedEvent(data: {
  workflow_id: string;
  status: string;
  node_results: Array<{
    node_id: string;
    status: string;
    output?: string;
    error?: string;
  }>;
  started_at?: number;
  completed_at?: number;
}) {
  getTestEventBus().emit('workflow:completed', data);
}

/** 发送工作流错误事件 */
function emitWorkflowErrorEvent(data: {
  workflow_id: string;
  error: string;
}) {
  getTestEventBus().emit('workflow:error', data);
}

// ==================== 测试数据 ====================

const mockNodes: DAGNode[] = [
  { id: 'explore', label: '探索代码', agentType: 'explore', status: 'pending' },
  { id: 'review', label: '代码审查', agentType: 'review', status: 'pending' },
  { id: 'refactor', label: '重构建议', agentType: 'refactor', status: 'pending' },
];

const mockEdges: DAGEdge[] = [
  { from: 'explore', to: 'review' },
  { from: 'review', to: 'refactor' },
];

// ==================== 测试套件 ====================

describe('WorkflowDAGMonitor - TDD 测试套件 (全局事件总线)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==================== 🔴 RED 测试：节点状态更新 ====================

  describe('🔴 RED: 节点状态实时更新', () => {
    it('应该初始显示所有节点为等待状态', () => {
      render(
        <WorkflowDAGMonitor
          workflowId="test-workflow"
          nodes={mockNodes}
          edges={mockEdges}
        />
      );

      // 验证节点标签显示
      expect(screen.getAllByText('探索代码').length).toBeGreaterThan(0);
      expect(screen.getAllByText('代码审查').length).toBeGreaterThan(0);
      expect(screen.getAllByText('重构建议').length).toBeGreaterThan(0);

      // 验证等待状态
      const pendingBadges = screen.getAllByText('等待');
      expect(pendingBadges.length).toBeGreaterThanOrEqual(3);
    });

    it('应该在收到 node_started 事件时更新节点状态为运行中', async () => {
      render(
        <WorkflowDAGMonitor
          workflowId="test-workflow"
          nodes={mockNodes}
          edges={mockEdges}
        />
      );

      // 发送节点开始事件
      emitWorkflowProgressEvent({
        event_type: 'node_started',
        node_id: 'explore',
        timestamp: Date.now(),
      });

      // 验证节点状态更新
      await waitFor(() => {
        const runningBadges = screen.getAllByText('运行中');
        expect(runningBadges.length).toBeGreaterThan(0);
      });
    });

    it('应该在收到 node_completed 事件时更新节点状态为完成', async () => {
      render(
        <WorkflowDAGMonitor
          workflowId="test-workflow"
          nodes={mockNodes}
          edges={mockEdges}
        />
      );

      // 发送节点完成事件
      emitWorkflowProgressEvent({
        event_type: 'node_completed',
        node_id: 'explore',
        message: '探索完成',
        timestamp: Date.now(),
      });

      // 验证节点状态更新
      await waitFor(() => {
        const completedBadges = screen.getAllByText('完成');
        expect(completedBadges.length).toBeGreaterThan(0);
      });
    });
  });

  // ==================== 🟢 GREEN 测试：工作流完成和错误处理 ====================

  describe('🟢 GREEN: 工作流完成和错误处理', () => {
    it('应该在收到 workflow:completed 事件时更新整体状态', async () => {
      const onComplete = vi.fn();

      render(
        <WorkflowDAGMonitor
          workflowId="test-workflow"
          nodes={mockNodes}
          edges={mockEdges}
          onComplete={onComplete}
        />
      );

      // 发送工作流完成事件
      emitWorkflowCompletedEvent({
        workflow_id: 'test-workflow',
        status: 'Completed',
        node_results: [
          { node_id: 'explore', status: 'completed', output: '探索完成' },
          { node_id: 'review', status: 'completed', output: '审查完成' },
          { node_id: 'refactor', status: 'completed', output: '重构完成' },
        ],
        started_at: Date.now() - 5000,
        completed_at: Date.now(),
      });

      // 验证状态更新
      await waitFor(() => {
        expect(screen.getByText('执行完成')).toBeInTheDocument();
      });

      expect(onComplete).toHaveBeenCalledTimes(1);
    });

    it('应该在收到 workflow:error 事件时显示错误状态', async () => {
      const onError = vi.fn();

      render(
        <WorkflowDAGMonitor
          workflowId="test-workflow"
          nodes={mockNodes}
          edges={mockEdges}
          onError={onError}
        />
      );

      // 发送工作流错误事件
      emitWorkflowErrorEvent({
        workflow_id: 'test-workflow',
        error: '执行失败：网络错误',
      });

      // 验证状态更新
      await waitFor(() => {
        expect(screen.getByText('执行失败')).toBeInTheDocument();
      });

      expect(onError).toHaveBeenCalledWith('执行失败：网络错误');
    });
  });

  // ==================== 🔄 REFACTOR 测试：进度统计 ====================

  describe('🔄 REFACTOR: 进度统计', () => {
    it('应该正确计算和显示进度百分比', async () => {
      render(
        <WorkflowDAGMonitor
          workflowId="test-workflow"
          nodes={mockNodes}
          edges={mockEdges}
        />
      );

      // 初始进度 0%
      expect(screen.getByText('0%')).toBeInTheDocument();

      // 完成第一个节点
      emitWorkflowProgressEvent({
        event_type: 'node_completed',
        node_id: 'explore',
        timestamp: Date.now(),
      });

      await waitFor(() => {
        expect(screen.getByText('33%')).toBeInTheDocument();
      });

      // 完成第二个节点
      emitWorkflowProgressEvent({
        event_type: 'node_completed',
        node_id: 'review',
        timestamp: Date.now(),
      });

      await waitFor(() => {
        expect(screen.getByText('67%')).toBeInTheDocument();
      });

      // 完成所有节点
      emitWorkflowProgressEvent({
        event_type: 'node_completed',
        node_id: 'refactor',
        timestamp: Date.now(),
      });

      await waitFor(() => {
        expect(screen.getByText('100%')).toBeInTheDocument();
      });
    });

    it('应该显示运行中的节点数量', async () => {
      render(
        <WorkflowDAGMonitor
          workflowId="test-workflow"
          nodes={mockNodes}
          edges={mockEdges}
        />
      );

      // 启动两个节点
      emitWorkflowProgressEvent({
        event_type: 'node_started',
        node_id: 'explore',
        timestamp: Date.now(),
      });

      emitWorkflowProgressEvent({
        event_type: 'node_started',
        node_id: 'review',
        timestamp: Date.now(),
      });

      await waitFor(() => {
        expect(screen.getByText('运行中 2')).toBeInTheDocument();
      });
    });
  });

  // ==================== 边界情况测试 ====================

  describe('边界情况处理', () => {
    it('应该处理空的节点列表', () => {
      render(
        <WorkflowDAGMonitor
          workflowId="test-workflow"
          nodes={[]}
          edges={[]}
        />
      );

      expect(screen.getByText('0 / 0')).toBeInTheDocument();
    });

    it('应该渲染 DAG 可视化图', () => {
      const { container } = render(
        <WorkflowDAGMonitor
          workflowId="test-workflow"
          nodes={mockNodes}
          edges={mockEdges}
        />
      );

      // 验证 SVG 元素存在
      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();

      // 验证节点和连接线存在
      const rects = svg?.querySelectorAll('rect');
      const paths = svg?.querySelectorAll('path');

      expect(rects?.length).toBeGreaterThan(0);
      expect(paths?.length).toBeGreaterThan(0);
    });
  });

  // ==================== 时间线日志测试 ====================

  describe('时间线日志功能', () => {
    it('应该显示时间线日志', async () => {
      render(
        <WorkflowDAGMonitor
          workflowId="test-workflow"
          nodes={mockNodes}
          edges={mockEdges}
        />
      );

      // 发送多个进度事件
      emitWorkflowProgressEvent({
        event_type: 'node_started',
        node_id: 'explore',
        message: '开始探索',
        timestamp: Date.now(),
      });

      emitWorkflowProgressEvent({
        event_type: 'node_completed',
        node_id: 'explore',
        message: '探索完成',
        timestamp: Date.now() + 100,
      });

      // 验证日志显示
      await waitFor(() => {
        expect(screen.getByText('开始探索')).toBeInTheDocument();
        expect(screen.getByText('探索完成')).toBeInTheDocument();
      });
    });
  });
});
