/**
 * 工具执行状态指示器
 * 提供工业级的执行进度视觉反馈
 */

import React from 'react';
import { Loader2, CheckCircle, XCircle, AlertCircle, Zap } from 'lucide-react';

interface ToolExecutionIndicatorProps {
  status: 'pending' | 'approved' | 'running' | 'completed' | 'failed' | 'rejected';
  progress?: number; // 0-100
  message?: string;
  compact?: boolean;
}

/**
 * 执行状态指示器组件
 */
export const ToolExecutionIndicator: React.FC<ToolExecutionIndicatorProps> = ({
  status,
  progress,
  message,
  compact = false
}) => {
  const getStatusConfig = () => {
    switch (status) {
      case 'pending':
        return {
          icon: <AlertCircle size={14} />,
          color: 'text-amber-400',
          bgColor: 'bg-amber-500/10',
          borderColor: 'border-amber-500/20',
          label: '待审批',
          pulse: false,
        };
      case 'approved':
        return {
          icon: <Zap size={14} />,
          color: 'text-blue-400',
          bgColor: 'bg-blue-500/10',
          borderColor: 'border-blue-500/20',
          label: '已批准',
          pulse: true,
        };
      case 'running':
        return {
          icon: <Loader2 size={14} className="animate-spin" />,
          color: 'text-blue-400',
          bgColor: 'bg-blue-500/10',
          borderColor: 'border-blue-500/20',
          label: '执行中',
          pulse: true,
        };
      case 'completed':
        return {
          icon: <CheckCircle size={14} />,
          color: 'text-green-400',
          bgColor: 'bg-green-500/10',
          borderColor: 'border-green-500/20',
          label: '已完成',
          pulse: false,
        };
      case 'failed':
        return {
          icon: <XCircle size={14} />,
          color: 'text-red-400',
          bgColor: 'bg-red-500/10',
          borderColor: 'border-red-500/20',
          label: '失败',
          pulse: false,
        };
      case 'rejected':
        return {
          icon: <XCircle size={14} />,
          color: 'text-gray-400',
          bgColor: 'bg-gray-500/10',
          borderColor: 'border-gray-500/20',
          label: '已拒绝',
          pulse: false,
        };
      default:
        return {
          icon: <AlertCircle size={14} />,
          color: 'text-gray-400',
          bgColor: 'bg-gray-500/10',
          borderColor: 'border-gray-500/20',
          label: '未知',
          pulse: false,
        };
    }
  };

  const config = getStatusConfig();

  if (compact) {
    return (
      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${config.bgColor} ${config.borderColor} ${config.pulse ? 'animate-pulse' : ''}`}>
        <span className={config.color}>{config.icon}</span>
        <span className={`text-[10px] font-bold uppercase tracking-wider ${config.color}`}>
          {config.label}
        </span>
        {progress !== undefined && (
          <span className="text-[10px] text-gray-500 ml-auto">
            {progress}%
          </span>
        )}
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${config.pulse ? 'animate-pulse' : ''}`}>
      {/* 状态指示器 */}
      <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${config.bgColor} ${config.borderColor}`}>
        <span className={config.color}>{config.icon}</span>
        <div className="flex-1">
          <div className={`text-[11px] font-bold uppercase tracking-wider ${config.color}`}>
            {config.label}
          </div>
          {message && (
            <div className="text-[10px] text-gray-500 mt-0.5">
              {message}
            </div>
          )}
        </div>
        {status === 'running' && (
          <div className="flex items-center gap-2">
            <div className="flex gap-0.5">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="w-1 h-3 bg-blue-400 rounded-full animate-pulse"
                  style={{ animationDelay: `${i * 150}ms`, animationDuration: '1s' }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 进度条 */}
      {progress !== undefined && status === 'running' && (
        <div className="px-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-gray-500">执行进度</span>
            <span className="text-[10px] font-mono text-blue-400">{progress}%</span>
          </div>
          <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-blue-400 transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* 执行步骤 */}
      {status === 'running' && (
        <div className="px-4 space-y-1">
          {['初始化环境', '执行命令', '处理结果'].map((step, idx) => (
            <div key={step} className="flex items-center gap-2 text-[10px]">
              <div className={`w-3 h-3 rounded-full border ${
                idx < Math.floor(progress / 33)
                  ? 'bg-blue-400 border-blue-400'
                  : 'border-gray-600 bg-transparent'
              }`} />
              <span className={idx < Math.floor(progress / 33) ? 'text-gray-400' : 'text-gray-600'}>
                {step}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * 流式内容加载指示器
 */
export const StreamingContentLoader: React.FC<{ fileName?: string }> = ({ fileName }) => {
  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-blue-500/5 rounded-xl border border-blue-500/20 animate-pulse">
      <Loader2 size={16} className="text-blue-400 animate-spin" />
      <div className="flex-1">
        <div className="text-[11px] font-medium text-blue-300">
          正在生成内容...
        </div>
        {fileName && (
          <div className="text-[10px] text-gray-500 mt-0.5 font-mono">
            {fileName}
          </div>
        )}
      </div>
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="w-1 h-4 bg-blue-400 rounded-full animate-bounce"
            style={{ animationDelay: `${i * 100}ms` }}
          />
        ))}
      </div>
    </div>
  );
};
