/**
 * ProgressCard — 进度卡片（消息流内嵌式）
 *
 * 嵌入在 Chat 消息流中的小型进度指示器：
 * - Agent 彩色头像（32px 圆形）+ 任务标题
 * - 步骤文本（如 "步骤 4/8"）
 * - 进度条（4px 高，圆角 2px）
 *
 * 设计原则：
 * - 小巧紧凑，嵌入消息流
 * - 颜色从 AGENT_DSL 查表
 * - 数据从 WORKFLOW_DSL 派生
 */

import React from 'react';
import { getAgent } from '../AGENT_DSL';
import type { MessageCardProps } from '../MessageCardRegistry';
import type { TaskProgress } from '../WORKFLOW_DSL';

/* ===== 组件 Props ===== */

interface ProgressCardData {
  title: string;
  agentId: string;
  progress: TaskProgress;
}

/* ===== 主组件 ===== */

export function ProgressCard({ message, compact }: MessageCardProps) {
  const data = message.data as ProgressCardData;
  const agent = getAgent(data.agentId as any);

  if (!agent) {
    return null;
  }

  return (
    <div
      className="bg-[#1F2937] rounded-lg p-3 border border-[#374151]"
      style={{
        fontSize: compact ? '12px' : '14px',
      }}
    >
      {/* 标题行：Agent 头像 + 任务标题 */}
      <div className="flex items-center gap-2 mb-2">
        {/* Agent 彩色头像 */}
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
          style={{ backgroundColor: agent.color.bg }}
          title={agent.name}
        >
          {agent.abbr}
        </div>

        {/* 任务标题 */}
        <h4
          className="text-white font-semibold truncate flex-1"
          style={{ fontSize: compact ? '12px' : '14px' }}
        >
          {data.title}
        </h4>
      </div>

      {/* 步骤文本 */}
      <div
        className="text-[#9CA3AF] text-xs mb-1.5"
        style={{ fontSize: compact ? '11px' : '12px' }}
      >
        步骤 {data.progress.currentStep}/{data.progress.totalSteps}
      </div>

      {/* 进度条 */}
      <div
        className="h-1 rounded-full bg-[#374151] overflow-hidden"
        style={{ height: compact ? '3px' : '4px' }}
      >
        <div
          className="h-full bg-[#3B82F6] transition-all duration-300"
          style={{
            width: `${data.progress.percentage}%`,
          }}
        />
      </div>
    </div>
  );
}
