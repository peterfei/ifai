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

import React, { useState, useEffect, useRef } from 'react';
import { FileText, Package, Eye, MessageSquare } from 'lucide-react';
import clsx from 'clsx';
import { useThreadStore } from '../../stores/threadStore';
import { useConversationStore, selectTokenStats } from '../../stores/conversationStore';
import { useChatStore } from '../../stores/useChatStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { getModelMaxTokens, formatTokenCount, calculateTokenUsagePercentage } from '../../utils/tokenCounter';
import { chatEventBus } from '../../stores/chat/eventBus/ChatEventBus';
import { WorkLogPanel } from './panels/WorkLogPanel';
import { ArtifactsPanel } from './panels/ArtifactsPanel';
import { PreviewPanel } from './panels/PreviewPanel';
import { evaluateTriggers } from './panels/previewRules';
import { computeArtifacts } from './panels/useArtifactData';
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
  const messageCount = useChatStore(s => s.messages).length;
  const tokenStats = useConversationStore(selectTokenStats);
  const currentModel = useSettingsStore((s) => s.currentModel);
  const maxTokens = currentModel ? getModelMaxTokens(currentModel) : 0;
  const percentage = tokenStats && maxTokens > 0
    ? Math.min(100, Math.round((tokenStats.total_tokens / maxTokens) * 100))
    : 0;
  const barColor = percentage < 50 ? 'bg-[#10B981]'
    : percentage < 75 ? 'bg-[#F59E0B]'
    : percentage < 90 ? 'bg-[#F97316]'
    : 'bg-[#EF4444]';

  const handleFileSelect = (file: FileChangeData) => {
    setSelectedFile(file);
    setActiveTab('preview');
  };

  // ============ 自动预览：检测到 HTML 产出物时自动切到预览标签 ============
  // 使用 chat:tool:completed 事件（此时 tc.result 已写入 store），
  // 配合 workflow:completed 作为 fallback + 重试轮询
  const autoPreviewedPathsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    // 核心逻辑：检查 store 中是否有 HTML 产出物，有则自动预览
    const tryAutoPreview = () => {
      const messages = useChatStore.getState().messages;
      const artifacts = computeArtifacts(messages);
      const actions = evaluateTriggers('workflow:completed', { artifacts });

      if (actions.includes('auto:open')) {
        const htmlFile = artifacts.find((f) => /\.html?$/i.test(f.name));
        if (htmlFile && !autoPreviewedPathsRef.current.has(htmlFile.path)) {
          autoPreviewedPathsRef.current.add(htmlFile.path);
          setSelectedFile(htmlFile);
          setActiveTab('preview');
          return true;
        }
      }
      return false;
    };

    // 订阅 chat:tool:completed — result 已写入 store
    const unsubTool = chatEventBus.on('chat:tool:completed' as any, () => {
      tryAutoPreview();
    });

    // 订阅 workflow:completed — 确保最终能触发（当所有工具已就绪时）
    const unsubWorkflow = chatEventBus.on('workflow:completed' as any, () => {
      if (tryAutoPreview()) return;

      // 若没找到 HTML，可能是 tool result 还没写入 store，轮询重试
      let attempts = 0;
      const interval = setInterval(() => {
        attempts++;
        if (tryAutoPreview() || attempts >= 10) {
          clearInterval(interval);
        }
      }, 300);
    });

    return () => {
      (unsubTool as () => void)();
      (unsubWorkflow as () => void)();
    };
  }, []);

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
            <span>对话：{messageCount}条</span>
          </div>
          {tokenStats && maxTokens > 0 ? (
            <div className="flex items-center gap-2 text-[12px] text-[#9CA3AF]">
              {/* 进度条 */}
              <div className="w-14 h-1.5 bg-[#2D2D2D] rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                  style={{ width: `${percentage}%` }}
                />
              </div>
              <span className="font-mono whitespace-nowrap">
                {formatTokenCount(tokenStats.total_tokens)}/{formatTokenCount(maxTokens)}
              </span>
              <span className={`font-mono ${percentage >= 75 ? 'text-[#EF4444]' : ''}`}>
                {percentage}%
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-[12px] text-[#9CA3AF]">
              <span className="font-mono">tokens: —</span>
            </div>
          )}
        </div>
        <span className="w-2 h-2 rounded-full bg-[#10B981]" />
      </div>
    </div>
  );
}
