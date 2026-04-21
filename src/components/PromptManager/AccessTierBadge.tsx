import React from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();

  const getBadgeConfig = () => {
    switch (tier) {
      case AccessTier.Public:
        return {
          label: t('promptManager.accessTier.public'),
          className: 'border-[var(--success-soft-border)] bg-[var(--success-soft-bg)] text-[var(--text-primary)]',
          dotClassName: 'bg-[var(--success-color)]',
        };
      case AccessTier.Protected:
        return {
          label: t('promptManager.accessTier.protected'),
          className: 'border-[var(--warning-soft-border)] bg-[var(--warning-soft-bg)] text-[var(--text-primary)]',
          dotClassName: 'bg-[var(--warning-color)]',
        };
      case AccessTier.Private:
        return {
          label: t('promptManager.accessTier.private'),
          className: 'border-[var(--danger-soft-border)] bg-[var(--danger-soft-bg)] text-[var(--text-primary)]',
          dotClassName: 'bg-[var(--danger-color)]',
        };
      default:
        return {
          label: t('promptManager.accessTier.unknown'),
          className: 'theme-panel-elevated theme-border theme-text-muted',
          dotClassName: 'bg-current',
        };
    }
  };

  const config = getBadgeConfig();

  return (
    <span
      data-testid="access-tier-badge"
      data-access-tier={tier}
      className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-semibold tracking-wide shadow-sm ${config.className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${config.dotClassName}`}></span>
      <span>{config.label}</span>
    </span>
  );
};
