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
          emoji: '🟢',
          label: '可编辑',
          className: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 border-green-200 dark:border-green-800',
        };
      case AccessTier.Protected:
        return {
          emoji: '🟡',
          label: '只读+覆盖',
          className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800',
        };
      case AccessTier.Private:
        return {
          emoji: '🔴',
          label: '专家',
          className: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border-red-200 dark:border-red-800',
        };
      default:
        return {
          emoji: '⚪',
          label: '未知',
          className: 'bg-gray-100 text-gray-700 dark:bg-gray-900/40 dark:text-gray-300 border-gray-200 dark:border-gray-800',
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
      <span>{config.emoji}</span>
      <span>{config.label}</span>
    </span>
  );
};
