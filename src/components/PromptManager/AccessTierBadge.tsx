import React from 'react';
import { AccessTier } from '../../types/prompt';

interface AccessTierBadgeProps {
  tier: AccessTier;
}

/**
 * 访问层级徽章组件
 *
 * 显示不同访问层级的提示词权限状态：
 * - 🟢 Public: 可编辑
 * - 🟡 Protected: 只读+覆盖
 * - 🔴 Private: 不可见（专家模式下显示）
 */
export const AccessTierBadge: React.FC<AccessTierBadgeProps> = ({ tier }) => {
  const getBadgeConfig = () => {
    switch (tier) {
      case AccessTier.Public:
        return {
          label: '可编辑',
          dotClassName: 'bg-green-500',
          className: 'border-green-500/20 bg-green-500/10 text-green-500',
        };
      case AccessTier.Protected:
        return {
          label: '只读+覆盖',
          dotClassName: 'bg-yellow-500',
          className: 'border-yellow-500/20 bg-yellow-500/10 text-yellow-600',
        };
      case AccessTier.Private:
        return {
          label: '专家',
          dotClassName: 'bg-red-500',
          className: 'border-red-500/20 bg-red-500/10 text-red-500',
        };
      default:
        return {
          label: '未知',
          dotClassName: 'theme-divider',
          className: 'theme-panel-elevated theme-border theme-text-muted',
        };
    }
  };

  const config = getBadgeConfig();

  return (
    <span
      data-testid="access-tier-badge"
      data-access-tier={tier}
      className={`inline-flex items-center gap-1 text-[9px] uppercase tracking-wider px-2 py-0.5 rounded font-bold border ${config.className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${config.dotClassName}`}></span>
      <span>{config.label}</span>
    </span>
  );
};
