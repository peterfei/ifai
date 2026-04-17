import React from 'react';
import { Check, X, Shield, Info, AlertTriangle } from 'lucide-react';
import { useEditorStore } from '../../stores/editorStore';
import { useChatStore } from '../../stores/useChatStore';
import { useApprovalStore } from '../../core/approval/store/useApprovalStore';
import { useLayoutStore } from '../../stores/layoutStore';
import { RiskPolicy } from '../../core/approval/policies/RiskPolicy';
import { toast } from 'sonner';

const riskPolicy = new RiskPolicy();

export const ApprovalToolbar: React.FC = () => {
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
        toast.success('已批准变更');
      } else {
        toast.error('无法定位原始消息');
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
        toast.error('已拒绝变更');
      } else {
        toast.error('无法定位原始消息');
      }
    }
    closeApprovalPreview();
  };

  const getRiskColor = () => {
    switch (riskLevel) {
      case 'high': return 'bg-red-500/20 border-red-500/50 text-red-400';
      case 'low': return 'bg-green-500/20 border-green-500/50 text-green-400';
      default: return 'bg-amber-500/20 border-amber-500/50 text-amber-400';
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
          正在预览 AI 变更
        </div>
        <div className="h-4 w-[1px] bg-current opacity-20 mx-1" />
        <div className="text-xs font-mono opacity-90 truncate max-w-[300px]">
          {filePath}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={handleReject}
          className="theme-button-secondary flex items-center gap-1.5 px-3 py-1 rounded text-xs font-bold transition-all border border-red-500/20 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/40"
        >
          <X size={14} /> 拒绝
        </button>
        <button
          onClick={handleApprove}
          className="flex items-center gap-1.5 px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-lg transition-all"
        >
          <Check size={14} /> 接受修改
        </button>
        <button
          onClick={closeApprovalPreview}
          className="theme-button-ghost ml-2 rounded p-1 transition-colors"
          title="关闭预览"
        >
          <X size={14} className="opacity-50" />
        </button>
      </div>
    </div>
  );
};
