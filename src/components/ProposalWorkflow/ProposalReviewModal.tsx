/**
 * OpenSpec 提案审核弹窗
 * v0.2.6 新增
 *
 * 功能：
 * - 显示 AI 生成的提案内容
 * - 允许用户编辑提案
 * - 提供批准/拒绝按钮
 * - 批准后自动移动到 changes 目录
 */

import React, { useState } from 'react';
import { X, FileText, Check, XCircle, AlertCircle, Edit3, Eye, ChevronDown, ChevronUp } from 'lucide-react';
import { useProposalStore } from '../../stores/proposalStore';
import { useAgentStore } from '../../stores/agentStore';
import { OpenSpecProposal } from '../../types/proposal';
import { invoke } from '@tauri-apps/api/core';
import clsx from 'clsx';

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

  // 如果传入了 proposalId，从索引中查找并加载完整提案
  // 否则使用 store 中的 currentProposal
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
          if (mounted) {
            setProposal(loadedProposal);
          }
        } catch (e) {
          console.error('Failed to load proposal:', e);
          if (mounted) {
            setProposal(null);
          }
        } finally {
          if (mounted) {
            setIsLoading(false);
          }
        }
      } else if (!proposalId && mounted) {
        // 只有在没有 proposalId 时才使用 currentProposal
        const current = proposalStore.currentProposal;
        if (mounted) {
          setProposal(current);
        }
      }
    };

    loadProposal();

    return () => {
      mounted = false;
    };
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
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black bg-opacity-50">
        <div className="bg-[#252526] w-[400px] rounded-lg shadow-xl border border-gray-700 p-6">
          <div className="flex items-center justify-center text-blue-400">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400 mr-3"></div>
            <span>加载提案中...</span>
          </div>
        </div>
      </div>
    );
  }

  if (!proposal) {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black bg-opacity-50">
        <div className="bg-[#252526] w-[600px] rounded-lg shadow-xl border border-gray-700 p-6">
          <div className="flex items-center text-yellow-400">
            <AlertCircle className="mr-2" size={20} />
            <span>未找到提案数据</span>
          </div>
        </div>
      </div>
    );
  }

  const currentProposal = editedProposal || proposal;

  // 切换任务展开状态
  const toggleTask = (taskId: string) => {
    setExpandedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  // 切换 spec 展开状态
  const toggleSpec = (capability: string) => {
    setExpandedSpecs((prev) => {
      const next = new Set(prev);
      if (next.has(capability)) {
        next.delete(capability);
      } else {
        next.add(capability);
      }
      return next;
    });
  };

  // 开始编辑
  const handleStartEdit = () => {
    setEditedProposal({ ...proposal });
    setIsEditing(true);
  };

  // 取消编辑
  const handleCancelEdit = () => {
    setEditedProposal(null);
    setIsEditing(false);
    setError(null);
  };

  // 保存编辑
  const handleSaveEdit = async () => {
    if (!editedProposal) return;

    setIsProcessing(true);
    setError(null);

    try {
      await proposalStore.saveProposal(editedProposal);
      setIsEditing(false);
      setEditedProposal(null);
    } catch (e) {
      setError(`保存失败: ${e}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // 批准提案
  const handleApprove = async () => {
    setIsProcessing(true);
    setError(null);

    try {
      // 移动到 changes 目录
      await proposalStore.moveProposal(proposal.id, 'proposals', 'changes');

      // 创建更新后的提案对象
      const approvedProposal: OpenSpecProposal = {
        ...proposal,
        status: 'approved',
        location: 'changes',
        path: `.ifai/changes/${proposal.id}/`,
      };

      await proposalStore.saveProposal(approvedProposal);

      // v0.2.6: 批准后自动启动任务拆解
      try {
        // 构建包含提案信息的提示词
        // 格式：[PROPOSAL:proposal_id] 提案描述
        const breakdownPrompt = `[PROPOSAL:${proposal.id}] ${proposal.why}\n\n请基于此提案进行详细的任务拆解。`;

        // 使用 task-breakdown agent 进行任务拆解
        await useAgentStore.getState().launchAgent(
          'task-breakdown',
          breakdownPrompt,
          undefined // msgId - 不关联到特定消息
        );

        console.log('[ProposalReviewModal] 已启动任务拆解 agent for proposal:', proposal.id);
      } catch (breakdownError) {
        console.error('[ProposalReviewModal] 任务拆解启动失败:', breakdownError);
        // 不阻塞批准流程，只记录错误
      }

      // 回调
      onApproved?.(approvedProposal);
      onClose();
    } catch (e) {
      setError(`批准失败: ${e}`);
      setIsProcessing(false);
    }
  };

  // 拒绝提案
  const handleReject = async () => {
    setIsProcessing(true);
    setError(null);

    try {
      // 删除提案
      await proposalStore.deleteProposal(proposal.id, 'proposals');

      // 回调
      onRejected?.(proposal);
      onClose();
    } catch (e) {
      setError(`拒绝失败: ${e}`);
      setIsProcessing(false);
    }
  };

  // 渲染验证状态
  const renderValidationStatus = () => {
    if (currentProposal.validated) {
      return (
        <div className="flex items-center text-green-400 text-sm">
          <Check size={16} className="mr-1" />
          <span>已通过验证</span>
        </div>
      );
    }

    if (currentProposal.validationErrors && currentProposal.validationErrors.length > 0) {
      return (
        <div className="flex items-center text-red-400 text-sm">
          <AlertCircle size={16} className="mr-1" />
          <span>验证失败 ({currentProposal.validationErrors.length} 个错误)</span>
        </div>
      );
    }

    return (
      <div className="flex items-center text-yellow-400 text-sm">
        <AlertCircle size={16} className="mr-1" />
        <span>未验证</span>
      </div>
    );
  };

  // 渲染概览标签页
  const renderOverview = () => (
    <div className="space-y-4">
      {/* Why */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">为什么需要这个变更？</label>
        {isEditing ? (
          <textarea
            value={editedProposal?.why || currentProposal.why}
            onChange={(e) =>
              setEditedProposal((prev) => (prev ? { ...prev, why: e.target.value } : null))
            }
            className="w-full bg-[#3c3c3c] border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 min-h-[100px]"
          />
        ) : (
          <p className="text-gray-300 text-sm bg-[#1e1e1e] p-3 rounded border border-gray-700">
            {currentProposal.why}
          </p>
        )}
      </div>

      {/* What Changes */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">具体变更内容</label>
        {isEditing ? (
          <div className="space-y-2">
            {(editedProposal?.whatChanges || currentProposal.whatChanges).map((change, index) => (
              <div key={index} className="flex items-center gap-2">
                <span className="text-gray-400 text-sm">{index + 1}.</span>
                <input
                  type="text"
                  value={change}
                  onChange={(e) => {
                    const newChanges = [...(editedProposal?.whatChanges || currentProposal.whatChanges)];
                    newChanges[index] = e.target.value;
                    setEditedProposal((prev) => (prev ? { ...prev, whatChanges: newChanges } : null));
                  }}
                  className="flex-1 bg-[#3c3c3c] border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
            ))}
          </div>
        ) : (
          <ul className="list-disc list-inside text-gray-300 text-sm bg-[#1e1e1e] p-3 rounded border border-gray-700 space-y-1">
            {currentProposal.whatChanges.map((change, index) => (
              <li key={index}>{change}</li>
            ))}
          </ul>
        )}
      </div>

      {/* Impact */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">影响范围</label>
        <div className="bg-[#1e1e1e] p-3 rounded border border-gray-700 space-y-2 text-sm">
          <div className="flex items-center">
            <span className="text-gray-400 w-24">Specs:</span>
            <span className="text-gray-300">
              {currentProposal.impact.specs.length > 0
                ? currentProposal.impact.specs.join(', ')
                : '无'}
            </span>
          </div>
          <div className="flex items-center">
            <span className="text-gray-400 w-24">Files:</span>
            <span className="text-gray-300">
              {currentProposal.impact.files.length > 0
                ? currentProposal.impact.files.join(', ')
                : '未估计'}
            </span>
          </div>
          <div className="flex items-center">
            <span className="text-gray-400 w-24">Breaking:</span>
            <span
              className={clsx(
                currentProposal.impact.breakingChanges ? 'text-red-400' : 'text-green-400'
              )}
            >
              {currentProposal.impact.breakingChanges ? '是' : '否'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );

  // 渲染任务标签页
  const renderTasks = () => (
    <div className="space-y-2">
      {currentProposal.tasks.map((task, index) => (
        <div
          key={task.id}
          className="bg-[#1e1e1e] border border-gray-700 rounded overflow-hidden"
        >
          <div
            className="flex items-center justify-between p-3 cursor-pointer hover:bg-[#2a2d2e]"
            onClick={() => toggleTask(task.id)}
          >
            <div className="flex items-center gap-2">
              <span className="text-gray-400 text-sm">Task {index + 1}</span>
              <span className="text-white font-medium">{task.title}</span>
              <span
                className={clsx(
                  'px-2 py-0.5 text-xs rounded',
                  task.category === 'development' && 'bg-blue-600/30 text-blue-300',
                  task.category === 'testing' && 'bg-green-600/30 text-green-300',
                  task.category === 'documentation' && 'bg-purple-600/30 text-purple-300'
                )}
              >
                {task.category}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-400 text-sm">{task.estimatedHours}h</span>
              {expandedTasks.has(task.id) ? (
                <ChevronUp size={16} className="text-gray-400" />
              ) : (
                <ChevronDown size={16} className="text-gray-400" />
              )}
            </div>
          </div>
          {expandedTasks.has(task.id) && (
            <div className="p-3 pt-0 border-t border-gray-700">
              <p className="text-gray-300 text-sm">{task.description}</p>
              {task.dependencies && task.dependencies.length > 0 && (
                <div className="mt-2">
                  <span className="text-gray-400 text-xs">依赖: </span>
                  <span className="text-gray-400 text-xs">{task.dependencies.join(', ')}</span>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );

  // 渲染规格标签页
  const renderSpecs = () => (
    <div className="space-y-3">
      {currentProposal.specDeltas.map((delta, index) => (
        <div
          key={index}
          className="bg-[#1e1e1e] border border-gray-700 rounded overflow-hidden"
        >
          <div
            className="flex items-center justify-between p-3 cursor-pointer hover:bg-[#2a2d2e]"
            onClick={() => toggleSpec(delta.capability)}
          >
            <div className="flex items-center gap-2">
              <span
                className={clsx(
                  'px-2 py-1 text-xs font-bold rounded',
                  delta.type === 'ADDED' && 'bg-green-600/30 text-green-300',
                  delta.type === 'MODIFIED' && 'bg-yellow-600/30 text-yellow-300',
                  delta.type === 'REMOVED' && 'bg-red-600/30 text-red-300'
                )}
              >
                {delta.type}
              </span>
              <span className="text-white font-medium">{delta.capability}</span>
            </div>
            {expandedSpecs.has(delta.capability) ? (
              <ChevronUp size={16} className="text-gray-400" />
            ) : (
              <ChevronDown size={16} className="text-gray-400" />
            )}
          </div>
          {expandedSpecs.has(delta.capability) && (
            <div className="p-3 pt-0 border-t border-gray-700 space-y-3">
              <p className="text-gray-300 text-sm">{delta.content}</p>
              {delta.scenarios && delta.scenarios.length > 0 && (
                <div className="space-y-2">
                  <div className="text-gray-400 text-xs font-bold uppercase">场景</div>
                  {delta.scenarios.map((scenario, sIndex) => (
                    <div key={sIndex} className="bg-[#252526] p-2 rounded text-sm">
                      <div className="text-white font-medium mb-1">{scenario.name}</div>
                      <div className="text-gray-400 text-xs mb-2">{scenario.description}</div>
                      {scenario.given && (
                        <div className="text-gray-500 text-xs">
                          <span className="text-blue-400">Given</span> {scenario.given}
                        </div>
                      )}
                      <div className="text-gray-500 text-xs">
                        <span className="text-yellow-400">When</span> {scenario.when}
                      </div>
                      <div className="text-gray-500 text-xs">
                        <span className="text-green-400">Then</span> {scenario.then}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );

  const tabs = [
    { id: 'overview' as const, label: '概览', icon: FileText },
    { id: 'tasks' as const, label: '任务', icon: Check },
    { id: 'specs' as const, label: '规格', icon: Eye },
  ];

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black bg-opacity-50">
      <div
        className="bg-[#252526] w-[900px] h-[600px] rounded-lg shadow-xl flex flex-col overflow-hidden border border-gray-700"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-gray-700 bg-[#1e1e1e]">
          <div className="flex items-center gap-2">
            <FileText size={20} className="text-blue-400" />
            <h2 className="text-lg font-medium text-white">提案审核</h2>
            <span className="text-gray-400 text-sm">({currentProposal.id})</span>
          </div>
          <div className="flex items-center gap-3">
            {renderValidationStatus()}
            <button onClick={onClose} className="text-gray-400 hover:text-white">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex bg-[#1e1e1e] border-b border-gray-700 px-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                'flex items-center px-4 py-2 text-sm font-medium transition-colors',
                activeTab === tab.id
                  ? 'text-blue-400 border-b-2 border-blue-400'
                  : 'text-gray-400 hover:text-white'
              )}
            >
              <tab.icon size={16} className="mr-1" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 bg-[#252526]">
          {activeTab === 'overview' && renderOverview()}
          {activeTab === 'tasks' && renderTasks()}
          {activeTab === 'specs' && renderSpecs()}
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center p-4 border-t border-gray-700 bg-[#1e1e1e]">
          <div className="flex items-center gap-2">
            {!isEditing ? (
              <>
                <button
                  onClick={handleStartEdit}
                  className="flex items-center px-3 py-1.5 bg-gray-600 hover:bg-gray-700 text-white text-sm rounded transition-colors"
                >
                  <Edit3 size={14} className="mr-1" />
                  编辑
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={handleSaveEdit}
                  disabled={isProcessing}
                  className="flex items-center px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white text-sm rounded transition-colors"
                >
                  <Check size={14} className="mr-1" />
                  保存
                </button>
                <button
                  onClick={handleCancelEdit}
                  disabled={isProcessing}
                  className="flex items-center px-3 py-1.5 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-700 text-white text-sm rounded transition-colors"
                >
                  取消
                </button>
              </>
            )}
          </div>

          {!isEditing && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleReject}
                disabled={isProcessing}
                className="flex items-center px-4 py-1.5 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white text-sm rounded transition-colors"
              >
                <XCircle size={14} className="mr-1" />
                拒绝
              </button>
              <button
                onClick={handleApprove}
                disabled={isProcessing}
                className="flex items-center px-4 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white text-sm rounded transition-colors"
              >
                <Check size={14} className="mr-1" />
                批准
              </button>
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center p-3 bg-red-900/30 border-t border-red-700 text-red-300 text-sm">
            <AlertCircle size={16} className="mr-2" />
            {error}
          </div>
        )}
      </div>
    </div>
  );
};
