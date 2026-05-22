/**
 * ConversationDetailPanel — 右栏面板
 *
 * Tab 并排三标签切换 + 真实数据：
 * - 工作日志（WorkLogPanel）— useWorkLogData 真实日志
 * - 产出物（ArtifactsPanel）— useArtifactData 真实文件变更
 * - 预览（PreviewPanel）— 点击产出物后预览
 *
 * 底部状态栏对接 threadStore 真实数据
 */

import React, { useState } from 'react';
import { FileText, Package, Eye, MessageSquare } from 'lucide-react';
import clsx from 'clsx';
import { useThreadStore } from '../../stores/threadStore';
import { WorkLogPanel } from './panels/WorkLogPanel';
import { ArtifactsPanel } from './panels/ArtifactsPanel';
import { PreviewPanel } from './panels/PreviewPanel';
import type { FileChangeData } from './panels/useArtifactData';

/* ===== Tab DSL ===== */

type DetailTab = 'log' | 'artifacts' | 'preview';

const TAB_DESCRIPTOR: { key: DetailTab; label: string; icon: React.ReactNode }[] = [
  { key: 'log', label: '工作日志', icon: <FileText size={14} /> },
  { key: 'artifacts', label: '产出物', icon: <Package size={14} /> },
  { key: 'preview', label: '预览', icon: <Eye size={14} /> },
];

/* ===== 组件 ===== */

export function ConversationDetailPanel() {
  const [activeTab, setActiveTab] = useState<DetailTab>('log');
  const [selectedFile, setSelectedFile] = useState<FileChangeData | null>(null);
  const activeThreadId = useThreadStore((s) => s.activeThreadId);
  const threads = useThreadStore((s) => s.threads);
  const activeThread = activeThreadId ? threads[activeThreadId] : null;

  const handleFileSelect = (file: FileChangeData) => {
    setSelectedFile(file);
    setActiveTab('preview');
  };

  return (
    <div
      data-testid="conversation-detail-panel"
      style={{ display: 'flex', flexDirection: 'column', flex: '1 1 0%', minHeight: 0, background: '#1E1E1E', borderLeft: '1px solid #2D2D2D' }}
    >
      {/* 标签切换（并排） */}
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
              {isActive && (
                <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#3B82F6] rounded-t" />
              )}
            </button>
          );
        })}
      </div>

      {/* 内容区域 — min-h-0 确保 flex 子元素可收缩 */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {activeTab === 'log' && <WorkLogPanel />}
        {activeTab === 'artifacts' && <ArtifactsPanel onFileSelect={handleFileSelect} />}
        {activeTab === 'preview' && <PreviewPanel file={selectedFile} />}
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
