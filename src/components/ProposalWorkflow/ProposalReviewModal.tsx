/**
 * OpenSpec 提案审核弹窗 - 工业级重塑版
 * v0.2.6 新增
 */

import React, { useState } from 'react';
import { X, FileText, Check, XCircle, AlertCircle, Edit3, Eye, ChevronDown, ChevronUp, HelpCircle, List, Activity, Info, FileCode } from 'lucide-react';
import { useProposalStore } from '../../stores/proposalStore';
import { useFileStore } from '../../stores/fileStore';
import { OpenSpecProposal } from '../../types/proposal';
import { invoke } from '@tauri-apps/api/core';
import { openFileFromPath } from '../../utils/fileActions';
import clsx from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

interface ProposalReviewModalProps {
  /** 提案 ID，如果为 null 则使用 store 中的 currentProposal */
  proposalId?: string | null;
  /** 关闭弹窗回调 */
  onClose: () => void;
  /** 批准后的回调 */
  onApproved?: (proposal: OpenSpecProposal) => void;
  /** 拒绝后的回调 */
  onRejected?: (proposal: OpenSpecProposal) => void;
}

export const ProposalReviewModal = ({
  proposalId,
  onClose,
  onApproved,
  onRejected,
}: ProposalReviewModalProps) => {
  const proposalStore = useProposalStore();

  const [proposal, setProposal] = useState<OpenSpecProposal | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // 当 proposalId 变化时，加载提案
  React.useEffect(() => {
    let mounted = true;
    const loadProposal = async () => {
      if (proposalId && mounted) {
        setIsLoading(true);
        try {
          const loadedProposal = await proposalStore.loadProposal(proposalId, 'proposals');
          if (mounted) setProposal(loadedProposal);
        } catch (e) {
          console.error('Failed to load proposal:', e);
          if (mounted) setProposal(null);
        } finally {
          if (mounted) setIsLoading(false);
        }
      } else if (!proposalId && mounted) {
        const current = proposalStore.currentProposal;
        if (mounted) setProposal(current);
      }
    };
    loadProposal();
    return () => { mounted = false; };
  }, [proposalId]);

  const [isEditing, setIsEditing] = useState(false);
  const [editedProposal, setEditedProposal] = useState<OpenSpecProposal | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'tasks' | 'specs'>('overview');
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [expandedSpecs, setExpandedSpecs] = useState<Set<string>>(new Set());

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="bg-[#252526] w-[400px] rounded-xl shadow-2xl border border-gray-700 p-8 text-center">
          <div className="flex flex-col items-center justify-center text-blue-400 gap-4">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-400"></div>
            <span className="text-sm font-medium text-gray-300">正在分析提案规格...</span>
          </div>
        </div>
      </div>
    );
  }

  if (!proposal) {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="bg-[#252526] w-[500px] rounded-xl shadow-2xl border border-gray-700 p-8">
          <div className="flex flex-col items-center text-yellow-400 gap-4">
            <div className="p-3 bg-yellow-400/10 rounded-full">
                <AlertCircle size={32} />
            </div>
            <span className="text-lg font-semibold text-gray-200">未找到提案数据</span>
            <button onClick={onClose} className="mt-4 px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors">关闭窗口</button>
          </div>
        </div>
      </div>
    );
  }

  const currentProposal = editedProposal || proposal;

  const toggleTask = (taskId: string) => {
    setExpandedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const toggleSpec = (capability: string) => {
    setExpandedSpecs((prev) => {
      const next = new Set(prev);
      if (next.has(capability)) next.delete(capability);
      else next.add(capability);
      return next;
    });
  };

  const handleStartEdit = () => { setEditedProposal({ ...proposal }); setIsEditing(true); };
  const handleCancelEdit = () => { setEditedProposal(null); setIsEditing(false); setError(null); };

  const handleSaveEdit = async () => {
    if (!editedProposal) return;
    setIsProcessing(true);
    setError(null);
    try {
      await proposalStore.saveProposal(editedProposal);
      setIsEditing(false);
      setEditedProposal(null);
      toast.success('提案已保存');
    } catch (e) {
      setError(`保存失败: ${e}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApprove = async () => {
    setIsProcessing(true);
    setError(null);
    try {
      await proposalStore.moveProposal(proposal.id, 'proposals', 'changes');
      const approvedProposal: OpenSpecProposal = {
        ...proposal,
        status: 'approved',
        location: 'changes',
        path: `.ifai/changes/${proposal.id}/`,
      };
      await proposalStore.saveProposal(approvedProposal);
      const rootPath = useFileStore.getState().rootPath;
      const tasksPath = `${rootPath}/.ifai/changes/${proposal.id}/tasks.md`;
      const success = await openFileFromPath(tasksPath);
      if (!success) await openFileFromPath(`${rootPath}/.ifai/changes/${proposal.id}/proposal.md`);
      onApproved?.(approvedProposal);
      onClose();
    } catch (e) {
      setError(`批准失败: ${e}`);
      setIsProcessing(false);
    }
  };

  const handleReject = async () => {
    setIsProcessing(true);
    setError(null);
    try {
      await proposalStore.deleteProposal(proposal.id, 'proposals');
      onRejected?.(proposal);
      onClose();
    } catch (e) {
      setError(`拒绝失败: ${e}`);
      setIsProcessing(false);
    }
  };

  const renderValidationStatus = () => {
    if (currentProposal.validated) {
      return (
        <div className="flex items-center gap-1.5 px-2 py-1 bg-green-500/10 border border-green-500/30 rounded text-green-400 text-[10px] font-bold uppercase">
          <Check size={12} />
          <span>Spec Validated</span>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 bg-yellow-500/10 border border-yellow-500/30 rounded text-yellow-400 text-[10px] font-bold uppercase">
        <AlertCircle size={12} />
        <span>Pending Review</span>
      </div>
    );
  };

  const renderOverview = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="bg-[#1e1e1e] rounded-xl border border-gray-800 overflow-hidden shadow-sm">
        <div className="flex items-center gap-2 px-4 py-3 bg-[#252526] border-b border-gray-800">
          <HelpCircle size={16} className="text-blue-400" />
          <h3 className="text-[11px] font-bold text-gray-300 uppercase tracking-wider">需求背景与初衷</h3>
        </div>
        <div className="p-4">
          {isEditing ? (
            <textarea
              value={editedProposal?.why || currentProposal.why}
              onChange={(e) => setEditedProposal((prev) => (prev ? { ...prev, why: e.target.value } : null))}
              className="w-full bg-[#161617] border border-gray-700 rounded-lg px-3 py-2 text-gray-200 text-sm focus:outline-none focus:border-blue-500 min-h-[100px]"
            />
          ) : (
            <p className="text-gray-300 text-[13px] leading-relaxed whitespace-pre-wrap">{currentProposal.why}</p>
          )}
        </div>
      </div>

      <div className="bg-[#1e1e1e] rounded-xl border border-gray-800 overflow-hidden shadow-sm">
        <div className="flex items-center gap-2 px-4 py-3 bg-[#252526] border-b border-gray-800">
          <List size={16} className="text-purple-400" />
          <h3 className="text-[11px] font-bold text-gray-300 uppercase tracking-wider">具体变更内容</h3>
        </div>
        <div className="p-4">
          <div className="space-y-3">
            {currentProposal.whatChanges.map((change, index) => (
              <div key={index} className="flex items-start gap-3 group">
                 <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-purple-500/40" />
                 <span className="text-gray-300 text-[13px] leading-relaxed">{change}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
          <ImpactCard icon={<Eye size={14} className="text-blue-400" />} label="Affected Specs" value={currentProposal.impact.specs.length.toString()} />
          <ImpactCard icon={<FileCode size={14} className="text-green-400" />} label="Files to Change" value={currentProposal.impact.files.length > 0 ? currentProposal.impact.files.length.toString() : 'Estimated'} />
          <ImpactCard icon={<Activity size={14} className={currentProposal.impact.breakingChanges ? 'text-red-400' : 'text-green-400'} />} label="Breaking" value={currentProposal.impact.breakingChanges ? 'YES' : 'NO'} highlight={currentProposal.impact.breakingChanges} />
      </div>
    </div>
  );

  const renderTasks = () => (
    <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {currentProposal.tasks.map((task, index) => (
        <div key={task.id} className="bg-[#1e1e1e] border border-gray-800 rounded-xl overflow-hidden hover:border-gray-700 transition-colors">
          <div className="flex items-center justify-between p-4 cursor-pointer" onClick={() => toggleTask(task.id)}>
            <div className="flex items-center gap-3">
              <span className="text-[9px] font-bold text-gray-500 bg-gray-900 border border-gray-800 px-1.5 py-0.5 rounded uppercase">Task {index + 1}</span>
              <span className="text-[13px] text-gray-200 font-semibold">{task.title}</span>
            </div>
            <div className="flex items-center gap-3 text-gray-500 text-[11px] font-mono">
              <Clock size={12} />
              <span>{task.estimatedHours}h</span>
              {expandedTasks.has(task.id) ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </div>
          </div>
          <AnimatePresence>
            {expandedTasks.has(task.id) && (
              <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden bg-[#161617]">
                <div className="p-4 border-t border-gray-800 text-sm text-gray-400">{task.description}</div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ))}
    </div>
  );

  const renderSpecs = () => (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {currentProposal.specDeltas.map((delta, index) => (
        <div key={index} className="bg-[#1e1e1e] border border-gray-800 rounded-xl overflow-hidden shadow-sm">
          <div className="flex items-center justify-between p-4 cursor-pointer bg-[#252526]" onClick={() => toggleSpec(delta.capability)}>
            <div className="flex items-center gap-3">
              <span className={clsx('px-2 py-0.5 text-[9px] font-bold rounded border uppercase tracking-widest', 
                delta.type === 'ADDED' && 'bg-green-500/10 text-green-400 border-green-500/20',
                delta.type === 'MODIFIED' && 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
                delta.type === 'REMOVED' && 'bg-red-500/10 text-red-400 border-red-500/20'
              )}>{delta.type}</span>
              <span className="text-[13px] text-white font-semibold">{delta.capability}</span>
            </div>
            {expandedSpecs.has(delta.capability) ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
          </div>
          <AnimatePresence>
            {expandedSpecs.has(delta.capability) && (
              <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
                <div className="p-5 border-t border-gray-800 text-sm text-gray-400 font-mono leading-relaxed">{delta.content}</div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ))}
    </div>
  );

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-md px-6">
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-[#252526] w-full max-w-5xl h-[750px] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-gray-700/50">
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-5 border-b border-gray-800 bg-[#1e1e1e]">
          <div className="flex items-center gap-4">
            <div className="p-2.5 bg-blue-500/10 rounded-xl border border-blue-500/20 text-blue-400"><FileText size={24} /></div>
            <div>
                <h2 className="text-lg font-bold text-white leading-tight">OpenSpec 变更提案审核</h2>
                <div className="flex items-center gap-2 mt-1">{renderValidationStatus()}</div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-800 rounded-full text-gray-500 hover:text-white"><X size={20} /></button>
        </div>

        {/* Tabs */}
        <div className="flex bg-[#1e1e1e] border-b border-gray-800 px-6 gap-2">
          {['overview', 'tasks', 'specs'].map((id) => (
            <button key={id} onClick={() => setActiveTab(id as any)} className={clsx('relative flex items-center px-4 py-4 text-[11px] font-bold uppercase tracking-widest transition-all', activeTab === id ? 'text-blue-400' : 'text-gray-500 hover:text-gray-300')}>
              {id.toUpperCase()}
              {activeTab === id && <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 shadow-[0_-2px_10px_rgba(59,130,246,0.5)]" />}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-8 bg-[#181818]">
          {activeTab === 'overview' && renderOverview()}
          {activeTab === 'tasks' && renderTasks()}
          {activeTab === 'specs' && renderSpecs()}
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center px-8 py-5 border-t border-gray-800 bg-[#1e1e1e]">
          <button onClick={handleStartEdit} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-[11px] font-bold uppercase rounded-lg border border-gray-700 shadow-sm">编辑</button>
          <div className="flex gap-4">
            <button onClick={handleReject} disabled={isProcessing} className="px-6 py-2.5 text-red-500 hover:text-red-400 text-[11px] font-bold uppercase tracking-widest transition-colors">拒绝</button>
            <button onClick={handleApprove} disabled={isProcessing} className="flex items-center px-8 py-2.5 bg-green-600 hover:bg-green-500 text-white text-[11px] font-bold uppercase rounded-lg shadow-lg shadow-green-900/20 transition-all"><Check size={14} className="mr-2" />批准实施</button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

const ImpactCard = ({ icon, label, value, highlight }: any) => (
    <div className={clsx("flex flex-col gap-1 p-4 rounded-xl border transition-all", highlight ? "bg-red-500/5 border-red-500/20" : "bg-[#252526] border-gray-800")}>
        <div className="flex items-center gap-2 uppercase tracking-widest text-[9px] font-bold text-gray-500">{icon}{label}</div>
        <div className={clsx("text-[12px] font-semibold truncate", highlight ? "text-red-400" : "text-gray-300")}>{value}</div>
    </div>
);