import React from 'react';
import { Check, X, Shield, Info, AlertTriangle } from 'lucide-react';
import { useEditorStore } from '../../stores/editorStore';
import { useChatStore } from '../../stores/useChatStore';
import { useApprovalStore } from '../../core/approval/store/useApprovalStore';
import { useLayoutStore } from '../../stores/layoutStore';
import { RiskPolicy } from '../../core/approval/policies/RiskPolicy';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

const riskPolicy = new RiskPolicy();

export const ApprovalToolbar: React.FC = () => {
  const { t } = useTranslation();
  const { approvalPreview, closeApprovalPreview } = useEditorStore();
  const { isVisible, filePath, toolCallId } = approvalPreview;
  const { editorMode } = useLayoutStore();

  if (!isVisible) return null;

  // 计算风险
  const riskLevel = riskPolicy.calculateRisk({
    toolName: 'agent_write_file', // 默认为写入预览
    args: { rel_path: filePath },
    editorMode: editorMode as any
  });

  const handleApprove = () => {
    if (toolCallId) {
      const chatStore = useChatStore.getState();
      // 🔥 修复：查找包含该 toolCall 的 messageId
      const message = chatStore.messages.find(m => 
        m.toolCalls?.some(tc => tc.id === toolCallId)
      );
      
      if (message) {
        chatStore.approveToolCall(message.id, toolCallId);
        toast.success(t('approvalToolbar.approved'));
      } else {
        toast.error(t('approvalToolbar.messageNotFound'));
      }
    }
    closeApprovalPreview();
  };

  const handleReject = () => {
    if (toolCallId) {
      const chatStore = useChatStore.getState();
      const message = chatStore.messages.find(m => 
        m.toolCalls?.some(tc => tc.id === toolCallId)
      );

      if (message) {
        chatStore.rejectToolCall(message.id, toolCallId);
        toast.error(t('approvalToolbar.rejected'));
      } else {
        toast.error(t('approvalToolbar.messageNotFound'));
      }
    }
    closeApprovalPreview();
  };

  const getRiskColor = () => {
    switch (riskLevel) {
      case 'high': return 'bg-[var(--danger-soft-bg)] border-[var(--danger-soft-border)] text-[var(--danger-color)]';
      case 'low': return 'bg-[var(--success-soft-bg)] border-[var(--success-soft-border)] text-[var(--success-color)]';
      default: return 'bg-[var(--warning-soft-bg)] border-[var(--warning-soft-border)] text-[var(--warning-color)]';
    }
  };

  const getRiskIcon = () => {
    switch (riskLevel) {
      case 'high': return <AlertTriangle size={14} />;
      case 'low': return <Shield size={14} />;
      default: return <Info size={14} />;
    }
  };

  return (
    <div className={`flex items-center justify-between px-4 py-2 border-b animate-in fade-in slide-in-from-top-2 duration-300 ${getRiskColor()}`}>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 font-bold text-xs uppercase tracking-wider">
          {getRiskIcon()}
          {t('approvalToolbar.previewing')}
        </div>
        <div className="h-4 w-[1px] bg-current opacity-20 mx-1" />
        <div className="text-xs font-mono opacity-90 max-w-full break-all">
          {filePath}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={handleReject}
          className="theme-button-secondary flex items-center gap-1.5 rounded border border-[var(--danger-soft-border)] px-3 py-1 text-xs font-bold transition-all hover:bg-[var(--danger-soft-bg)] hover:text-[var(--danger-color)]"
        >
          <X size={14} /> {t('approvalToolbar.reject')}
        </button>
        <button
          onClick={handleApprove}
          className="theme-button-primary theme-glow-accent flex items-center gap-1.5 rounded px-3 py-1 text-xs font-bold transition-all"
        >
          <Check size={14} /> {t('approvalToolbar.accept')}
        </button>
        <button
          onClick={closeApprovalPreview}
          className="theme-button-ghost ml-2 rounded p-1 transition-colors"
          title={t('approvalToolbar.close')}
        >
          <X size={14} className="opacity-50" />
        </button>
      </div>
    </div>
  );
};
