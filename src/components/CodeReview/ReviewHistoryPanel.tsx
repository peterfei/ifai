/**
 * v0.2.9 审查历史面板组件
 *
 * 功能：
 * - 显示代码审查历史记录列表
 * - 每条记录显示提交哈希、时间戳、问题数量和状态
 */

import React from 'react';
import { X, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { useCodeReviewStore, ReviewHistory } from '../../stores/codeReviewStore';

// ============================================================================
// Props
// ============================================================================

interface ReviewHistoryPanelProps {
  /** 是否显示面板 */
  isOpen: boolean;
}

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 获取状态图标
 */
function getStatusIcon(status: ReviewHistory['status']) {
  switch (status) {
    case 'fixed':
      return <CheckCircle className="text-green-500" size={16} />;
    case 'ignored':
      return <XCircle className="text-gray-500" size={16} />;
    case 'pending':
      return <AlertCircle className="text-yellow-500" size={16} />;
    default:
      return null;
  }
}

/**
 * 获取状态名称
 */
function getStatusName(status: ReviewHistory['status']): string {
  switch (status) {
    case 'fixed':
      return 'fixed';
    case 'ignored':
      return 'ignored';
    case 'pending':
      return 'pending';
    default:
      return 'unknown';
  }
}

/**
 * 格式化时间戳
 */
function formatTimestamp(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 60) {
    return `${minutes}分钟前`;
  } else if (hours < 24) {
    return `${hours}小时前`;
  } else {
    return `${days}天前`;
  }
}

// ============================================================================
// 组件
// ============================================================================

export const ReviewHistoryPanel: React.FC<ReviewHistoryPanelProps> = ({ isOpen }) => {
  const { reviewHistory, toggleHistoryPanel } = useCodeReviewStore();

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed right-4 top-20 w-96 max-h-[70vh] bg-[#252526] rounded-lg shadow-2xl border border-gray-700 flex flex-col z-[210]"
      data-testid="review-history-panel"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <Clock className="text-blue-500" size={18} />
          <h3 className="text-sm font-semibold text-white">审查历史记录</h3>
          <span className="text-xs text-gray-400">({reviewHistory.length})</span>
        </div>
        <button
          onClick={toggleHistoryPanel}
          className="text-gray-400 hover:text-white transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      {/* History List */}
      <div className="flex-1 overflow-auto p-4 space-y-3">
        {reviewHistory.length === 0 ? (
          <div className="text-center text-gray-400 text-sm py-8">
            暂无审查历史记录
          </div>
        ) : (
          reviewHistory.map((history) => (
            <div
              key={history.id}
              className="bg-[#1e1e1e] border border-gray-700 rounded-lg p-3 hover:border-gray-600 transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-blue-400">
                    {history.commitHash || 'N/A'}
                  </span>
                  {getStatusIcon(history.status)}
                  <span className="text-xs text-gray-500">
                    {getStatusName(history.status)}
                  </span>
                </div>
                <span className="text-xs text-gray-500">
                  {formatTimestamp(history.timestamp)}
                </span>
              </div>

              <div className="text-xs text-gray-400">
                {history.issues.length} 个问题
              </div>

              {/* Issue Summary */}
              <div className="mt-2 space-y-1">
                {history.issues.slice(0, 3).map((issue, index) => (
                  <div key={index} className="text-xs text-gray-500 truncate">
                    • {issue.message}
                  </div>
                ))}
                {history.issues.length > 3 && (
                  <div className="text-xs text-gray-600">
                    ...还有 {history.issues.length - 3} 个问题
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default ReviewHistoryPanel;
