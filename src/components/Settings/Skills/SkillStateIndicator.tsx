import React from 'react';
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Download,
  PauseCircle,
  XCircle,
  Zap,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { getSkillStateBadgeClass, getSkillStateLabel } from '../../Skills/skillUi';
import type { SkillState } from './types';

interface SkillStateIndicatorProps {
  state: SkillState;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  showProgress?: boolean;
  className?: string;
}

const sizeClasses = {
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-6 w-6',
};

const textSizeClasses = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base',
};

const getStateIcon = (type: SkillState['type']) => {
  switch (type) {
    case 'Active':
      return Zap;
    case 'Installed':
      return CheckCircle;
    case 'NotInstalled':
      return Download;
    case 'Installing':
    case 'Uninstalling':
      return Clock;
    case 'Inactive':
      return PauseCircle;
    case 'Error':
      return XCircle;
  }
};

export const SkillStateIndicator: React.FC<SkillStateIndicatorProps> = ({
  state,
  size = 'md',
  showLabel = false,
  showProgress = false,
  className,
}) => {
  const { t } = useTranslation();
  const Icon = getStateIcon(state.type);
  const badgeClass = getSkillStateBadgeClass(state.type);

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        className={cn(
          'flex items-center justify-center rounded-full border',
          sizeClasses[size],
          badgeClass
        )}
        title={getSkillStateLabel(t, state.type)}
      >
        <Icon size={size === 'sm' ? 12 : size === 'md' ? 14 : 16} />
      </div>

      {showLabel && (
        <span className={cn('font-medium', textSizeClasses[size])}>
          {getSkillStateLabel(t, state.type)}
        </span>
      )}

      {showProgress && state.type === 'Installing' && (
        <div className="theme-panel-muted theme-border h-1.5 w-24 overflow-hidden rounded-full border">
          <div
            className="theme-badge-warning h-full transition-all duration-300"
            style={{ width: `${state.progress}%` }}
          />
        </div>
      )}

      {state.type === 'Error' && (
        <AlertTriangle className="theme-text-danger" size={size === 'sm' ? 12 : 14} />
      )}
    </div>
  );
};

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
  const { t } = useTranslation();
  const states: Array<{ state: SkillState; available: boolean }> = [
    { state: { type: 'NotInstalled' }, available: false },
    { state: { type: 'Installing', progress: 0 }, available: false },
    { state: { type: 'Installed', version: '1.0.0' }, available: true },
    { state: { type: 'Active' }, available: true },
    { state: { type: 'Inactive' }, available: true },
    { state: { type: 'Error', message: '' }, available: false },
  ];

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {states.map((item, index) => (
        <React.Fragment key={item.state.type}>
          <button
            type="button"
            onClick={() => item.available && onStateClick?.(item.state)}
            disabled={!item.available}
            className={cn(
              'theme-focus-ring-accent rounded-md px-3 py-1.5 text-xs font-medium',
              currentState.type === item.state.type ? 'theme-button-primary' : 'theme-button-secondary',
              !item.available && 'cursor-not-allowed opacity-50'
            )}
          >
            {getSkillStateLabel(t, item.state.type)}
          </button>
          {index < states.length - 1 && <div className="theme-divider h-px w-6" />}
        </React.Fragment>
      ))}
    </div>
  );
};

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
  const { t } = useTranslation();
  const items = [
    { key: 'total', value: stats.total, icon: Download, tone: 'theme-text-subtle' },
    { key: 'active', value: stats.active, icon: Zap, tone: 'theme-text-accent' },
    { key: 'installed', value: stats.installed, icon: CheckCircle, tone: 'theme-text-success' },
    { key: 'error', value: stats.error, icon: AlertTriangle, tone: 'theme-text-danger' },
  ];

  return (
    <div className={cn('grid gap-3 sm:grid-cols-2 xl:grid-cols-4', className)}>
      {items.map(item => (
        <div
          key={item.key}
          className="theme-panel-muted theme-border flex items-center gap-3 rounded-lg border p-4"
        >
          <item.icon className={item.tone} size={18} />
          <div>
            <div className="theme-text text-xl font-semibold">{item.value}</div>
            <div className="theme-text-subtle text-xs">
              {t(`skillsManagement.stats.${item.key}`)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
