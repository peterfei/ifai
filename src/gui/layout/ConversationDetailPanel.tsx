import React, { useState, useMemo } from 'react';
import { useThreadStore } from '../../stores/threadStore';
import {
  FileText, Package, Eye, Clock, MessageSquare,
} from 'lucide-react';
import clsx from 'clsx';

/* ===== DSL 数据驱动 ===== */

type DetailTab = 'log' | 'artifacts' | 'preview';

const TAB_DESCRIPTOR: { key: DetailTab; label: string; icon: React.ReactNode }[] = [
  { key: 'log', label: '工作日志', icon: <FileText size={14} /> },
  { key: 'artifacts', label: '产出物', icon: <Package size={14} /> },
  { key: 'preview', label: '预览', icon: <Eye size={14} /> },
];

/* Agent 颜色 DSL */
const AGENT_COLORS: Record<string, { bg: string; text: string }> = {
  refactor: { bg: 'bg-[#10B981]', text: 'text-[#10B981]' },
  pm: { bg: 'bg-[#3B82F6]', text: 'text-[#3B82F6]' },
  test: { bg: 'bg-[#F59E0B]', text: 'text-[#F59E0B]' },
  design: { bg: 'bg-[#8B5CF6]', text: 'text-[#8B5CF6]' },
  ops: { bg: 'bg-[#EF4444]', text: 'text-[#EF4444]' },
};

/* Mock 工作日志数据 — 后续对接真实 Agent 事件流 */
const MOCK_LOGS = [
  { agent: 'refactor', name: '重构Agent', time: '12:30', content: '完成 LoginForm useForm 集成' },
  { agent: 'pm', name: 'PM Agent', time: '12:29', content: '分配任务：重构 + 测试编写' },
  { agent: 'test', name: '测试Agent', time: '12:29', content: '等待重构Agent完成' },
  { agent: 'refactor', name: '重构Agent', time: '12:25', content: '开始提取 validateSchema 到 shared/utils' },
  { agent: 'pm', name: 'PM Agent', time: '12:20', content: '创建子任务：API 类型安全重构' },
  { agent: 'design', name: '设计Agent', time: '12:18', content: '输出表单组件 Figma 设计稿 v2' },
];

/* Mock 产出物数据 */
const MOCK_ARTIFACTS = [
  { name: 'useForm.ts', size: '2.4 KB', type: 'ts' as const },
  { name: 'validateSchema.ts', size: '1.1 KB', type: 'ts' as const },
  { name: 'LoginForm.test.tsx', size: '3.8 KB', type: 'test' as const },
  { name: 'api-types.d.ts', size: '890 B', type: 'ts' as const },
];

/* ===== 组件 ===== */

export function ConversationDetailPanel() {
  const [activeTab, setActiveTab] = useState<DetailTab>('log');
  const activeThreadId = useThreadStore((s) => s.activeThreadId);
  const threads = useThreadStore((s) => s.threads);
  const activeThread = activeThreadId ? threads[activeThreadId] : null;

  return (
    <div
      data-testid="conversation-detail-panel"
      className="flex h-full flex-col bg-[#1E1E1E] border-l border-[#2D2D2D]"
    >
      {/* 标签切换 */}
      <div className="flex border-b border-[#2D2D2D] flex-shrink-0">
        {TAB_DESCRIPTOR.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={clsx(
                'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors relative',
                isActive ? 'text-white' : 'text-[#9CA3AF] hover:text-[#D1D5DB]'
              )}
            >
              {tab.icon}
              <span>{tab.label}</span>
              {/* 激活态底部蓝线 */}
              {isActive && (
                <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#3B82F6] rounded-t" />
              )}
            </button>
          );
        })}
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'log' && <WorkLogTab />}
        {activeTab === 'artifacts' && <ArtifactsTab />}
        {activeTab === 'preview' && <PreviewTab />}
      </div>

      {/* 底部状态栏 */}
      <div className="px-4 py-2 border-t border-[#2D2D2D] flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-[12px] text-[#9CA3AF]">
            <MessageSquare size={12} />
            <span>对话：{activeThread?.messageCount ?? 0}条</span>
          </div>
          <div className="flex items-center gap-1.5 text-[12px] text-[#9CA3AF]">
            <span className="font-mono">tokens: {(activeThread?.messageCount ?? 0) * 103}</span>
          </div>
        </div>
        <span className="w-2 h-2 rounded-full bg-[#10B981]" />
      </div>
    </div>
  );
}

/* ===== 工作日志标签 ===== */

function WorkLogTab() {
  return (
    <div className="px-4 py-3 space-y-3">
      {MOCK_LOGS.map((log, i) => {
        const colors = AGENT_COLORS[log.agent] || AGENT_COLORS.pm;
        return (
          <div key={i} className="flex gap-3">
            {/* Agent 彩色圆形头像 */}
            <div className={clsx(
              'w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0',
              'text-white text-[10px] font-bold',
              colors.bg
            )}>
              {log.name.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              {/* 名字 + 时间 */}
              <div className="flex items-center justify-between mb-0.5">
                <span className={clsx('text-sm font-semibold', colors.text)}>
                  {log.name}
                </span>
                <span className="text-xs text-[#9CA3AF]">{log.time}</span>
              </div>
              {/* 内容 */}
              <p className="text-sm text-white leading-normal">
                {log.content}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ===== 产出物标签 ===== */

const FILE_ICON: Record<string, string> = {
  ts: 'TS',
  test: 'T',
  md: 'M',
};

function ArtifactsTab() {
  return (
    <div className="px-4 py-3">
      {MOCK_ARTIFACTS.map((file, i) => (
        <div
          key={i}
          className="flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-[#2D2D2D] cursor-pointer transition-colors"
        >
          {/* 文件图标 */}
          <div className="w-5 h-5 rounded bg-[#2D2D2D] flex items-center justify-center flex-shrink-0">
            <span className="text-[10px] font-bold text-[#9CA3AF]">
              {FILE_ICON[file.type] || '#'}
            </span>
          </div>
          <span className="flex-1 text-sm text-white font-medium truncate">{file.name}</span>
          <span className="text-xs text-[#9CA3AF] flex-shrink-0">{file.size}</span>
        </div>
      ))}
    </div>
  );
}

/* ===== 预览标签 ===== */

function PreviewTab() {
  return (
    <div className="px-4 py-3">
      <div className="rounded-md border border-[#2D2D2D] bg-[#1A1A1A] p-4 min-h-[200px]">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-[#9CA3AF] font-medium">代码预览</span>
          <div className="flex gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-[#EF4444]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#F59E0B]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#10B981]" />
          </div>
        </div>
        <div className="font-mono text-xs text-[#9CA3AF] leading-relaxed space-y-1">
          <p><span className="text-[#569CD6]">import</span> {'{'} <span className="text-[#DCDCAA]">useForm</span> {'}'} <span className="text-[#569CD6]">from</span> <span className="text-[#CE9178]">'./useForm'</span>;</p>
          <p className="text-white/20">{'// 预览区域 — 对话产出物将在此展示'}</p>
        </div>
      </div>
    </div>
  );
}
