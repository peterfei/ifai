/**
 * 技能状态可视化组件
 * Phase 7: 完整 UI 重构
 */

import React from 'react';
import { CheckCircle, XCircle, Clock, Download, Zap, PauseCircle, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SkillState } from './types';

interface SkillStateIndicatorProps {
  state: SkillState;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  showProgress?: boolean;
  className?: string;
}

export const SkillStateIndicator: React.FC<SkillStateIndicatorProps> = ({
  state,
  size = 'md',
  showLabel = false,
  showProgress = false,
  className,
}) => {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
  };

  const textSizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
  };

  const getStateConfig = () => {
    switch (state.type) {
      case 'Active':
        return {
          icon: Zap,
          color: 'text-green-500',
          bgColor: 'bg-green-500/10',
          borderColor: 'border-green-500/50',
          label: '激活',
          description: '技能已激活并正在使用',
        };

      case 'Installed':
        return {
          icon: CheckCircle,
          color: 'text-blue-500',
          bgColor: 'bg-blue-500/10',
          borderColor: 'border-blue-500/50',
          label: '已安装',
          description: '技能已安装但未激活',
        };

      case 'NotInstalled':
        return {
          icon: Download,
          color: 'text-gray-500',
          bgColor: 'bg-gray-500/10',
          borderColor: 'border-gray-500/50',
          label: '未安装',
          description: '技能未安装',
        };

      case 'Installing':
        return {
          icon: Clock,
          color: 'text-yellow-500',
          bgColor: 'bg-yellow-500/10',
          borderColor: 'border-yellow-500/50',
          label: '安装中',
          description: `正在安装 (${state.progress}%)`,
        };

      case 'Inactive':
        return {
          icon: PauseCircle,
          color: 'text-gray-400',
          bgColor: 'bg-gray-400/10',
          borderColor: 'border-gray-400/50',
          label: '未激活',
          description: '技能已安装但未激活',
        };

      case 'Uninstalling':
        return {
          icon: Download,
          color: 'text-orange-500',
          bgColor: 'bg-orange-500/10',
          borderColor: 'border-orange-500/50',
          label: '卸载中',
          description: '正在卸载技能',
        };

      case 'Error':
        return {
          icon: XCircle,
          color: 'text-red-500',
          bgColor: 'bg-red-500/10',
          borderColor: 'border-red-500/50',
          label: '错误',
          description: state.message || '技能错误',
        };
    }
  };

  const config = getStateConfig();
  const Icon = config.icon;

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {/* 状态图标 */}
      <div
        className={cn(
          'flex items-center justify-center rounded-full border',
          sizeClasses[size],
          config.bgColor,
          config.borderColor
        )}
        title={config.description}
      >
        <Icon className={cn(sizeClasses[size], config.color)} strokeWidth={2} />
      </div>

      {/* 状态标签 */}
      {showLabel && (
        <span className={cn('font-medium', config.color, textSizeClasses[size])}>
          {config.label}
        </span>
      )}

      {/* 进度条（仅安装中显示） */}
      {showProgress && state.type === 'Installing' && (
        <div className="flex-1 max-w-[100px]">
          <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-yellow-500 transition-all duration-300"
              style={{ width: `${state.progress}%` }}
            />
          </div>
        </div>
      )}

      {/* 错误提示 */}
      {state.type === 'Error' && (
        <AlertTriangle className="text-red-500" size={size === 'sm' ? 14 : 16} />
      )}
    </div>
  );
};

// ==================== 状态机可视化 ====================

interface StateTransitionDiagramProps {
  currentState: SkillState;
  onStateClick?: (newState: SkillState) => void;
  className?: string;
}

export const StateTransitionDiagram: React.FC<StateTransitionDiagramProps> = ({
  currentState,
  onStateClick,
  className,
}) => {
  const states: Array<{ state: SkillState; label: string; available: boolean }> = [
    { state: { type: 'NotInstalled' }, label: '未安装', available: false },
    { state: { type: 'Installing', progress: 0 }, label: '安装中', available: false },
    { state: { type: 'Installed', version: '1.0.0' }, label: '已安装', available: true },
    { state: { type: 'Active' }, label: '激活', available: true },
    { state: { type: 'Inactive' }, label: '未激活', available: true },
    { state: { type: 'Error', message: '' }, label: '错误', available: false },
  ];

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {states.map((s, index) => (
        <React.Fragment key={s.label}>
          <button
            onClick={() => s.available && onStateClick?.(s.state)}
            disabled={!s.available}
            className={cn(
              'px-3 py-1.5 rounded-lg text-sm font-medium border transition-all',
              s.available
                ? 'hover:border-blue-500 cursor-pointer'
                : 'opacity-50 cursor-not-allowed',
              currentState.type === s.state.type
                ? 'bg-blue-500 text-white border-blue-500'
                : 'bg-gray-800 text-gray-400 border-gray-700'
            )}
          >
            {s.label}
          </button>
          {index < states.length - 1 && (
            <div className="w-8 h-0.5 bg-gray-700" />
          )}
        </React.Fragment>
      ))}
    </div>
  );
};

// ==================== 状态统计卡片 ====================

interface StateStatsCardProps {
  stats: {
    total: number;
    active: number;
    installed: number;
    error: number;
  };
  className?: string;
}

export const StateStatsCard: React.FC<StateStatsCardProps> = ({ stats, className }) => {
  const items = [
    { label: '总计', value: stats.total, icon: Download, color: 'text-gray-400' },
    { label: '激活', value: stats.active, icon: Zap, color: 'text-green-500' },
    { label: '已安装', value: stats.installed, icon: CheckCircle, color: 'text-blue-500' },
    { label: '错误', value: stats.error, icon: AlertTriangle, color: 'text-red-500' },
  ];

  return (
    <div className={cn('grid grid-cols-4 gap-4', className)}>
      {items.map(item => (
        <div
          key={item.label}
          className="flex items-center gap-3 p-4 bg-gray-900 rounded-lg border border-gray-800"
        >
          <item.icon className={item.color} size={20} />
          <div>
            <div className="text-2xl font-bold text-white">{item.value}</div>
            <div className="text-xs text-gray-500">{item.label}</div>
          </div>
        </div>
      ))}
    </div>
  );
};
