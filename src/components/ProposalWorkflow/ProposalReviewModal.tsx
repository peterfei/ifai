/**
 * OpenSpec 提案审核弹窗 - 工业级重塑版
 * v0.2.6 新增
 */

import React, { useState } from 'react';
import { X, FileText, Check, XCircle, AlertCircle, Edit3, Eye, ChevronDown, ChevronUp, HelpCircle, List, Activity, Info, FileCode, Clock } from 'lucide-react';
import { useProposalStore } from '../../stores/proposalStore';
import { useFileStore } from '../../stores/fileStore';
import { OpenSpecProposal } from '../../types/proposal';
import { openFileFromPath } from '../../utils/fileActions';
import clsx from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
  const panelClassName = 'theme-panel theme-border overflow-hidden rounded-xl border shadow-sm';
  const panelHeaderClassName = 'theme-panel-muted theme-border flex items-center gap-2 border-b px-4 py-3';
  const sectionTitleClassName = 'theme-text-muted text-[11px] font-bold uppercase tracking-wider';
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
      <div className="theme-backdrop-strong fixed inset-0 z-[200] flex items-center justify-center backdrop-blur-sm">
        <div className="theme-panel-elevated theme-border theme-shadow w-[400px] rounded-xl border p-8 text-center">
          <div className="flex flex-col items-center justify-center gap-4 text-[var(--accent-color)]">
            <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-[var(--accent-color)]"></div>
            <span className="theme-text-muted text-sm font-medium">{t('proposalReview.loading')}</span>
          </div>
        </div>
      </div>
    );
  }

  if (!proposal) {
    return (
      <div className="theme-backdrop-strong fixed inset-0 z-[200] flex items-center justify-center backdrop-blur-sm">
        <div className="theme-panel-elevated theme-border theme-shadow w-[500px] rounded-xl border p-8">
          <div className="flex flex-col items-center gap-4 text-[var(--warning-color)]">
            <div className="rounded-full bg-[var(--warning-soft-bg)] p-3">
                <AlertCircle size={32} />
            </div>
            <span className="theme-text text-lg font-semibold">{t('proposalReview.notFound')}</span>
            <button onClick={onClose} className="theme-button-secondary mt-4 rounded-lg px-6 py-2">{t('proposalReview.closeWindow')}</button>
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
      toast.success(t('proposalReview.saved'));
    } catch (e) {
      setError(t('proposalReview.errors.save', { error: String(e) }));
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
      setError(t('proposalReview.errors.approve', { error: String(e) }));
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
      setError(t('proposalReview.errors.reject', { error: String(e) }));
      setIsProcessing(false);
    }
  };

  const renderValidationStatus = () => {
    if (currentProposal.validated) {
      return (
        <div className="flex items-center gap-1.5 rounded border border-[var(--success-soft-border)] bg-[var(--success-soft-bg)] px-2 py-1 text-[10px] font-bold uppercase text-[var(--success-color)]">
          <Check size={12} />
          <span>{t('proposalReview.validated')}</span>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1.5 rounded border border-[var(--warning-soft-border)] bg-[var(--warning-soft-bg)] px-2 py-1 text-[10px] font-bold uppercase text-[var(--warning-color)]">
        <AlertCircle size={12} />
        <span>{t('proposalReview.pendingReview')}</span>
      </div>
    );
  };

  const renderOverview = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className={panelClassName}>
        <div className={panelHeaderClassName}>
          <HelpCircle size={16} className="text-[var(--accent-color)]" />
          <h3 className={sectionTitleClassName}>{t('proposalReview.sections.background')}</h3>
        </div>
        <div className="p-4">
          {isEditing ? (
            <textarea
              value={editedProposal?.why || currentProposal.why}
              onChange={(e) => setEditedProposal((prev) => (prev ? { ...prev, why: e.target.value } : null))}
              className="theme-input-surface theme-border min-h-[100px] w-full rounded-lg border px-3 py-2 text-sm focus:border-[var(--accent-color)] focus:outline-none"
            />
          ) : (
            <p className="theme-text-muted whitespace-pre-wrap text-[13px] leading-relaxed">{currentProposal.why}</p>
          )}
        </div>
      </div>

      <div className={panelClassName}>
        <div className={panelHeaderClassName}>
          <List size={16} className="text-[var(--info-color)]" />
          <h3 className={sectionTitleClassName}>{t('proposalReview.sections.changes')}</h3>
        </div>
        <div className="p-4">
          <div className="space-y-3">
            {currentProposal.whatChanges.map((change, index) => (
              <div key={index} className="flex items-start gap-3 group">
                 <div className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[var(--info-soft-border)]" />
                 <span className="theme-text-muted text-[13px] leading-relaxed">{change}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
          <ImpactCard icon={<Eye size={14} className="text-[var(--accent-color)]" />} label={t('proposalReview.impact.affectedSpecs')} value={currentProposal.impact.specs.length.toString()} />
          <ImpactCard icon={<FileCode size={14} className="text-[var(--success-color)]" />} label={t('proposalReview.impact.filesToChange')} value={currentProposal.impact.files.length > 0 ? currentProposal.impact.files.length.toString() : t('proposalReview.impact.estimated')} />
          <ImpactCard icon={<Activity size={14} className={currentProposal.impact.breakingChanges ? 'text-[var(--danger-color)]' : 'text-[var(--success-color)]'} />} label={t('proposalReview.impact.breaking')} value={currentProposal.impact.breakingChanges ? t('proposalReview.impact.yes') : t('proposalReview.impact.no')} highlight={currentProposal.impact.breakingChanges} />
      </div>
    </div>
  );

  const renderTasks = () => (
    <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {currentProposal.tasks.map((task, index) => (
        <div key={task.id} className="theme-panel theme-border overflow-hidden rounded-xl border transition-colors hover:border-[var(--border-strong)]">
          <div className="flex items-center justify-between p-4 cursor-pointer" onClick={() => toggleTask(task.id)}>
            <div className="flex items-center gap-3">
              <span className="theme-code-surface theme-border theme-text-subtle rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase">{t('proposalReview.taskLabel', { index: index + 1 })}</span>
              <span className="theme-text text-[13px] font-semibold">{task.title}</span>
            </div>
            <div className="theme-text-subtle flex items-center gap-3 text-[11px] font-mono">
              <Clock size={12} />
              <span>{t('proposalReview.hours', { count: task.estimatedHours })}</span>
              {expandedTasks.has(task.id) ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </div>
          </div>
          <AnimatePresence>
            {expandedTasks.has(task.id) && (
              <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="theme-panel-muted overflow-hidden">
                <div className="theme-border theme-text-muted border-t p-4 text-sm">{task.description}</div>
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
        <div key={index} className="theme-panel theme-border overflow-hidden rounded-xl border shadow-sm">
          <div className="theme-panel-muted flex cursor-pointer items-center justify-between p-4" onClick={() => toggleSpec(delta.capability)}>
            <div className="flex items-center gap-3">
              <span className={clsx('px-2 py-0.5 text-[9px] font-bold rounded border uppercase tracking-widest', 
                delta.type === 'ADDED' && 'bg-[var(--success-soft-bg)] text-[var(--success-color)] border-[var(--success-soft-border)]',
                delta.type === 'MODIFIED' && 'bg-[var(--warning-soft-bg)] text-[var(--warning-color)] border-[var(--warning-soft-border)]',
                delta.type === 'REMOVED' && 'bg-[var(--danger-soft-bg)] text-[var(--danger-color)] border-[var(--danger-soft-border)]'
              )}>{t(`proposalReview.specTypes.${delta.type.toLowerCase()}`)}</span>
              <span className="theme-text text-[13px] font-semibold">{delta.capability}</span>
            </div>
            {expandedSpecs.has(delta.capability) ? <ChevronUp size={16} className="theme-text-subtle" /> : <ChevronDown size={16} className="theme-text-subtle" />}
          </div>
          <AnimatePresence>
            {expandedSpecs.has(delta.capability) && (
              <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
                <div className="theme-code-surface theme-border theme-text-muted border-t p-5 text-sm font-mono leading-relaxed">{delta.content}</div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ))}
    </div>
  );

  return (
    <div className="theme-backdrop-strong fixed inset-0 z-[200] flex items-center justify-center backdrop-blur-md px-6">
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="theme-panel-elevated theme-border theme-shadow flex h-[750px] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border">
        {/* Header */}
        <div className="theme-panel-muted theme-border flex items-center justify-between border-b px-6 py-5">
          <div className="flex items-center gap-4">
            <div className="rounded-xl border border-[var(--accent-soft-border)] bg-[var(--accent-soft-bg)] p-2.5 text-[var(--accent-color)]"><FileText size={24} /></div>
            <div>
                <h2 className="theme-text text-lg font-bold leading-tight">{t('proposalReview.title')}</h2>
                <div className="flex items-center gap-2 mt-1">{renderValidationStatus()}</div>
            </div>
          </div>
          <button onClick={onClose} className="theme-button-ghost rounded-full p-2"><X size={20} /></button>
        </div>

        {/* Tabs */}
        <div className="theme-panel-muted theme-border flex gap-2 border-b px-6">
          {['overview', 'tasks', 'specs'].map((id) => (
            <button key={id} onClick={() => setActiveTab(id as any)} className={clsx('relative flex items-center px-4 py-4 text-[11px] font-bold uppercase tracking-widest transition-all', activeTab === id ? 'text-[var(--accent-color)]' : 'theme-text-subtle hover:text-[var(--text-primary)]')}>
              {t(`proposalReview.tabs.${id}`)}
              {activeTab === id && <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--accent-color)]" />}
            </button>
          ))}
        </div>

        <div className="theme-panel flex-1 overflow-y-auto p-8">
          {error && (
            <div className="mb-6 flex items-start gap-3 rounded-xl border border-[var(--danger-soft-border)] bg-[var(--danger-soft-bg)] p-4">
              <AlertCircle className="mt-0.5 flex-shrink-0 text-[var(--danger-color)]" size={18} />
              <p className="text-sm text-[var(--danger-color)]">{error}</p>
            </div>
          )}
          {activeTab === 'overview' && renderOverview()}
          {activeTab === 'tasks' && renderTasks()}
          {activeTab === 'specs' && renderSpecs()}
        </div>

        {/* Footer */}
        <div className="theme-panel-muted theme-border flex items-center justify-between border-t px-8 py-5">
          {isEditing ? (
            <button onClick={handleCancelEdit} className="theme-button-secondary rounded-lg px-4 py-2 text-[11px] font-bold uppercase">{t('proposalReview.cancel')}</button>
          ) : (
            <button onClick={handleStartEdit} className="theme-button-secondary rounded-lg px-4 py-2 text-[11px] font-bold uppercase">{t('proposalReview.edit')}</button>
          )}
          <div className="flex gap-4">
            {isEditing ? (
              <button onClick={handleSaveEdit} disabled={isProcessing} className="theme-button-primary flex items-center rounded-lg px-8 py-2.5 text-[11px] font-bold uppercase disabled:cursor-not-allowed disabled:opacity-60"><Check size={14} className="mr-2" />{t('proposalReview.save')}</button>
            ) : (
              <>
                <button onClick={handleReject} disabled={isProcessing} className="theme-button-ghost rounded-lg px-6 py-2.5 text-[11px] font-bold uppercase tracking-widest text-[var(--danger-color)] hover:bg-[var(--danger-soft-bg)] hover:text-[var(--danger-color)] disabled:cursor-not-allowed disabled:opacity-60">{t('proposalReview.reject')}</button>
                <button onClick={handleApprove} disabled={isProcessing} className="theme-button-success flex items-center rounded-lg px-8 py-2.5 text-[11px] font-bold uppercase disabled:cursor-not-allowed disabled:opacity-60"><Check size={14} className="mr-2" />{t('proposalReview.approve')}</button>
              </>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
};

const ImpactCard = ({ icon, label, value, highlight }: any) => (
    <div className={clsx("flex flex-col gap-1 rounded-xl border p-4 transition-all", highlight ? "bg-[var(--danger-soft-bg)] border-[var(--danger-soft-border)]" : "theme-panel-elevated theme-border")}>
        <div className={clsx("flex items-center gap-2 text-[9px] font-bold uppercase tracking-widest", highlight ? "text-[var(--danger-color)]/80" : "theme-text-subtle")}>{icon}{label}</div>
        <div className={clsx("truncate text-[12px] font-semibold", highlight ? "text-[var(--danger-color)]" : "theme-text")}>{value}</div>
    </div>
);
