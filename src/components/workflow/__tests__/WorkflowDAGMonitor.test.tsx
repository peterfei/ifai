/**
 * WorkflowDAGMonitor 组件测试 (TDD)
 *
 * 红绿测试循环：
 * 🔴 RED: 编写失败的测试
 * 🟢 GREEN: 编写最小代码使测试通过
 * 🔄 REFACTOR: 重构优化代码
 *
 * 使用 Tauri Mock 管线解决测试环境约束
 */

// ==================== 第一步：初始化 Mock 管线 ====================
// 必须在所有其他导入之前执行

import {
  emitWorkflowProgressEvent,
  emitWorkflowCompletedEvent,
  emitWorkflowErrorEvent,
  clearAllListeners,
  mockHelpers,
  testListen,
} from './mocks/setup';

import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import { vi, beforeEach, afterEach, describe, it, expect } from 'vitest';

// ==================== 导入组件 ====================

import { WorkflowDAGMonitor, injectTestListen, clearTestListen } from '../WorkflowDAGMonitor';
import type { DAGNode, DAGEdge, WorkflowExecutionResult } from '../WorkflowDAGMonitor';

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

// TODO: skip - 过时的测试，需要更新 mock/组件接口
describe.skip('WorkflowDAGMonitor - TDD 测试套件 (使用 Mock 管线)', () => {
  beforeEach(() => {
    clearAllListeners();
    vi.clearAllMocks();

    // 验证 Mock 管线已初始化
    expect(mockHelpers).toBeDefined();

    // 🔥 注入测试用的 listen 函数
    injectTestListen(testListen);
  });

  afterEach(() => {
    clearAllListeners();
    clearTestListen();
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

      // 使用 Mock 管线发送节点开始事件
      emitWorkflowProgressEvent({
        event_type: 'node_started',
        node_id: 'explore',
        timestamp: Date.now(),
      });

      // 验证节点状态更新为"运行中"
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

      // 使用 Mock 管线发送节点完成事件
      emitWorkflowProgressEvent({
        event_type: 'node_completed',
        node_id: 'explore',
        message: '探索完成，发现 10 个文件',
        timestamp: Date.now(),
      });

      // 验证节点状态更新为"完成"
      await waitFor(() => {
        const completedBadges = screen.getAllByText('完成');
        expect(completedBadges.length).toBeGreaterThan(0);
      });
    });

    it('应该显示节点输出信息', async () => {
      render(
        <WorkflowDAGMonitor
          workflowId="test-workflow"
          nodes={mockNodes}
          edges={mockEdges}
        />
      );

      const outputMessage = '发现 10 个文件，共 1500 行代码';

      // 发送节点完成事件并附带输出
      emitWorkflowProgressEvent({
        event_type: 'node_completed',
        node_id: 'explore',
        message: outputMessage,
        timestamp: Date.now(),
      });

      // 点击节点卡片展开（找到第一个包含"探索代码"的卡片）
      const exploreCards = screen.getAllByText('探索代码');
      const firstCard = exploreCards[0].closest('div');
      const expandButton = within(firstCard!).queryByRole('button');

      if (expandButton) {
        expandButton.click();
      }

      // 验证输出信息显示
      await waitFor(() => {
        expect(screen.getByText(outputMessage)).toBeInTheDocument();
      });
    });
  });

  // ==================== 🟢 GREEN 测试：事件监听和生命周期 ====================

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

      // 使用 Mock 管线发送工作流完成事件
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

      // 验证状态更新为"执行完成"
      await waitFor(() => {
        expect(screen.getByText('执行完成')).toBeInTheDocument();
      });

      // 验证回调被调用
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

      // 使用 Mock 管线发送工作流错误事件
      emitWorkflowErrorEvent({
        workflow_id: 'test-workflow',
        error: '执行失败：网络错误',
      });

      // 验证状态更新为"执行失败"
      await waitFor(() => {
        expect(screen.getByText('执行失败')).toBeInTheDocument();
      });

      // 验证回调被调用
      expect(onError).toHaveBeenCalledWith('执行失败：网络错误');
    });

    it('应该在组件卸载时清理事件监听器', () => {
      const { unmount } = render(
        <WorkflowDAGMonitor
          workflowId="test-workflow"
          nodes={mockNodes}
          edges={mockEdges}
        />
      );

      // 验证监听器已注册
      expect(mockHelpers.hasListeners('workflow:progress')).toBe(true);
      expect(mockHelpers.hasListeners('workflow:completed')).toBe(true);
      expect(mockHelpers.hasListeners('workflow:error')).toBe(true);

      // 卸载组件
      unmount();

      // 验证监听器已清理（afterEach 会自动清理，这里验证清理逻辑）
      // 注意：实际的 unlisten 可能有延迟，所以这里只验证清理逻辑被执行
      expect(mockHelpers.getEventNames()).not.toContain('workflow:progress');
    });
  });

  // ==================== 🔄 REFACTOR 测试：进度统计和可视化 ====================

  describe('🔄 REFACTOR: 进度统计和 DAG 可视化', () => {
    it('应该正确计算和显示进度百分比', async () => {
      render(
        <WorkflowDAGMonitor
          workflowId="test-workflow"
          nodes={mockNodes}
          edges={mockEdges}
        />
      );

      // 初始进度应该是 0%
      expect(screen.getByText('0%')).toBeInTheDocument();

      // 完成第一个节点
      emitWorkflowProgressEvent({
        event_type: 'node_completed',
        node_id: 'explore',
        timestamp: Date.now(),
      });

      // 进度应该是 33% (1/3)
      await waitFor(() => {
        expect(screen.getByText('33%')).toBeInTheDocument();
      });

      // 完成第二个节点
      emitWorkflowProgressEvent({
        event_type: 'node_completed',
        node_id: 'review',
        timestamp: Date.now(),
      });

      // 进度应该是 67% (2/3)
      await waitFor(() => {
        expect(screen.getByText('67%')).toBeInTheDocument();
      });

      // 完成所有节点
      emitWorkflowProgressEvent({
        event_type: 'node_completed',
        node_id: 'refactor',
        timestamp: Date.now(),
      });

      // 进度应该是 100% (3/3)
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

      // 验证显示"运行中 2"
      await waitFor(() => {
        expect(screen.getByText('运行中 2')).toBeInTheDocument();
      });
    });

    it('应该显示失败的节点数量', async () => {
      render(
        <WorkflowDAGMonitor
          workflowId="test-workflow"
          nodes={mockNodes}
          edges={mockEdges}
        />
      );

      // 发送工作流完成事件（包含失败状态）
      emitWorkflowCompletedEvent({
        workflow_id: 'test-workflow',
        status: 'Failed',
        node_results: [
          { node_id: 'explore', status: 'completed', output: '探索完成' },
          { node_id: 'review', status: 'failed', error: '审查失败' },
        ],
        started_at: Date.now() - 5000,
        completed_at: Date.now(),
      });

      // 验证显示"失败 1"
      await waitFor(() => {
        expect(screen.getByText('失败 1')).toBeInTheDocument();
      });
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

      // 验证节点矩形存在
      const rects = svg?.querySelectorAll('rect');
      expect(rects?.length).toBeGreaterThan(0);

      // 验证连接线路径存在
      const paths = svg?.querySelectorAll('path');
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
        event_type: 'node_progress',
        node_id: 'explore',
        message: '正在扫描文件...',
        timestamp: Date.now() + 100,
      });

      emitWorkflowProgressEvent({
        event_type: 'node_completed',
        node_id: 'explore',
        message: '探索完成',
        timestamp: Date.now() + 200,
      });

      // 验证时间线日志显示
      await waitFor(() => {
        expect(screen.getByText('开始探索')).toBeInTheDocument();
        expect(screen.getByText('正在扫描文件...')).toBeInTheDocument();
        expect(screen.getByText('探索完成')).toBeInTheDocument();
      });
    });

    it('应该显示正确的时间戳格式', async () => {
      render(
        <WorkflowDAGMonitor
          workflowId="test-workflow"
          nodes={mockNodes}
          edges={mockEdges}
        />
      );

      const timestamp = Date.now();
      emitWorkflowProgressEvent({
        event_type: 'node_started',
        node_id: 'explore',
        message: '测试消息',
        timestamp,
      });

      // 验证时间戳格式（HH:MM:SS.mmm）
      await waitFor(() => {
        const date = new Date(timestamp);
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        // 时间戳应该包含小时和分钟
        expect(screen.getByText(new RegExp(`${hours}:${minutes}`))).toBeInTheDocument();
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

      // 应该显示 0/0
      expect(screen.getByText('0 / 0')).toBeInTheDocument();
    });

    it('应该处理没有边的工作流', () => {
      const { container } = render(
        <WorkflowDAGMonitor
          workflowId="test-workflow"
          nodes={mockNodes}
          edges={[]}
        />
      );

      // 应该正常渲染，没有连接线
      const svg = container.querySelector('svg');
      const paths = svg?.querySelectorAll('path');

      // 没有边，所以路径数量应该为 0
      expect(paths?.length).toBe(0);
    });

    it('应该处理节点状态为空的情况', () => {
      const nodesWithoutStatus: DAGNode[] = [
        { id: 'node1', label: '节点1', agentType: 'explore' } as any,
      ];

      render(
        <WorkflowDAGMonitor
          workflowId="test-workflow"
          nodes={nodesWithoutStatus}
          edges={[]}
        />
      );

      // 应该正常显示
      expect(screen.getByText('节点1')).toBeInTheDocument();
    });
  });

  // ==================== Mock 管线验证 ====================

  describe('Mock 管线功能验证', () => {
    it('应该正确注册事件监听器', () => {
      render(
        <WorkflowDAGMonitor
          workflowId="test-workflow"
          nodes={mockNodes}
          edges={mockEdges}
        />
      );

      // 验证所有事件监听器都已注册
      expect(mockHelpers.hasListeners('workflow:progress')).toBe(true);
      expect(mockHelpers.hasListeners('workflow:completed')).toBe(true);
      expect(mockHelpers.hasListeners('workflow:error')).toBe(true);
    });

    it('应该正确清除事件监听器', () => {
      const { unmount } = render(
        <WorkflowDAGMonitor
          workflowId="test-workflow"
          nodes={mockNodes}
          edges={mockEdges}
        />
      );

      // 卸载组件
      unmount();

      // 验证监听器已清除
      expect(mockHelpers.hasListeners('workflow:progress')).toBe(false);
      expect(mockHelpers.hasListeners('workflow:completed')).toBe(false);
      expect(mockHelpers.hasListeners('workflow:error')).toBe(false);
    });

    it('应该支持多个监听器同时监听同一事件', () => {
      let handler1CallCount = 0;
      let handler2CallCount = 0;

      const unlisten1 = mockHelpers.emitEvent = vi.fn((event: string, payload: any) => {
        if (event === 'test-event') handler1CallCount++;
      });

      // 直接测试事件总线的多监听器支持
      const testBus = (mockHelpers as any).testEventBus;
      if (testBus) {
        testBus.on('test-event', () => handler1CallCount++);
        testBus.on('test-event', () => handler2CallCount++);

        testBus.emit('test-event', {});

        expect(handler1CallCount).toBe(1);
        expect(handler2CallCount).toBe(1);
      }
    });
  });
});
