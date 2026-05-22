/**
 * TaskProgressPanel — 任务进度面板（对话模式左栏）
 *
 * 数据驱动的任务进度显示：
 * - 任务标题区：Agent 头像 + 任务名称
 * - 进度指示区：Agent 角色 + 步骤进度条
 * - Agent 角色行：涉及的 Agent 圆形图标
 * - 任务清单：可勾选的步骤列表
 *
 * 设计原则：
 * - 颜色从 AGENT_DSL 查表，零硬编码
 * - Mock 数据驱动渲染
 */

import React from 'react';
import { getAgent } from '../conversation/AGENT_DSL';
import type { TaskData } from '../conversation/WORKFLOW_DSL';

/* ===== 组件 Props ===== */

interface TaskProgressPanelProps {
  /** 任务数据 */
  taskData: TaskData;
}

/* ===== 主组件 ===== */

export function TaskProgressPanel({ taskData }: TaskProgressPanelProps) {
  const activeAgent = getAgent(taskData.activeAgent);

  return (
    <div
      data-testid="task-progress-panel"
      className="flex h-full flex-col bg-[#1E1E1E] border-r border-[#2D2D2D]"
    >
      {/* 任务标题区 */}
      <div className="px-4 py-3 border-b border-[#2D2D2D]">
        <div className="flex items-center gap-3">
          {/* Agent 头像 */}
          <div
            data-testid="task-agent-avatar"
            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
            style={{ backgroundColor: activeAgent?.color.bg || '#6B7280' }}
          >
            {activeAgent?.abbr || '??'}
          </div>

          {/* 任务名称 */}
          <h3 className="text-white text-sm font-semibold truncate flex-1">
            {taskData.title}
          </h3>
        </div>
      </div>

      {/* 进度指示区 */}
      <div className="px-4 py-3 border-b border-[#2D2D2D]">
        <div className="flex items-center justify-between mb-2">
          {/* Agent 名称 */}
          <span className="text-[#9CA3AF] text-xs">
            {activeAgent?.name || 'Unknown'}
          </span>

          {/* 步骤进度 */}
          <span className="text-[#9CA3AF] text-xs">
            步骤 {taskData.progress.currentStep}/{taskData.progress.totalSteps}
          </span>
        </div>

        {/* 进度条 */}
        <div
          data-testid="task-progress-bar"
          className="h-1 rounded-full bg-[#374151] overflow-hidden"
        >
          <div
            data-testid="task-progress-fill"
            className="h-full bg-[#3B82F6] transition-all duration-300"
            style={{ width: `${taskData.progress.percentage}%` }}
          />
        </div>
      </div>

      {/* Agent 角色行 */}
      <div className="px-4 py-3 border-b border-[#2D2D2D]">
        <div className="flex items-center gap-2">
          {taskData.agents.map((agentId) => {
            const agent = getAgent(agentId);
            if (!agent) return null;

            const isActive = agentId === taskData.activeAgent;

            return (
              <div
                key={agentId}
                data-testid={`agent-icon-${agentId}`}
                className="relative"
              >
                {/* Agent 圆形图标 */}
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold transition-all"
                  style={{
                    backgroundColor: agent.color.bg,
                    ...(isActive && {
                      boxShadow: `0 0 0 2px ${agent.color.border}`,
                    }),
                  }}
                  title={agent.name}
                >
                  {agent.abbr}
                </div>

                {/* 活跃指示器 */}
                {isActive && (
                  <div
                    className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-2 h-2 rounded-full"
                    style={{ backgroundColor: agent.color.dot }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 任务清单 */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <div className="space-y-0">
          {taskData.taskList.map((item, index) => (
            <React.Fragment key={index}>
              {/* 任务项 */}
              <div className="flex items-center gap-3 py-2">
                {/* 复选框 */}
                <input
                  type="checkbox"
                  checked={item.completed}
                  readOnly
                  className="w-3 h-3 rounded border-[#374151] cursor-pointer"
                  style={{
                    backgroundColor: item.completed ? '#10B981' : 'transparent',
                    borderColor: item.completed ? '#10B981' : '#374151',
                  }}
                />

                {/* 任务文本 */}
                <span
                  className="text-xs flex-1"
                  style={{
                    color: item.completed ? '#10B981' : '#6B7280',
                    textDecoration: item.completed ? 'line-through' : 'none',
                  }}
                >
                  {item.text}
                </span>
              </div>

              {/* 分隔线（最后一项不需要） */}
              {index < taskData.taskList.length - 1 && (
                <div
                  data-testid="task-item-divider"
                  className="h-px border-b border-[#374151]"
                />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
