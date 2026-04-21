import type { TFunction } from 'i18next';
import type { SkillState } from '../Settings/Skills/types';

export type SkillFilterValue = 'all' | 'active' | 'installed' | 'inactive' | 'error';
export type SkillSortValue = 'name' | 'version' | 'status' | 'author';

export const isInstalledState = (state: SkillState['type']) => {
  return state === 'Installed' || state === 'Active' || state === 'Inactive';
};

export const getSkillStateLabel = (t: TFunction, state: SkillState['type']) => {
  switch (state) {
    case 'Active':
      return t('skillShared.state.active');
    case 'Installed':
      return t('skillShared.state.installed');
    case 'NotInstalled':
      return t('skillShared.state.notInstalled');
    case 'Installing':
      return t('skillShared.state.installing');
    case 'Inactive':
      return t('skillShared.state.inactive');
    case 'Uninstalling':
      return t('skillShared.state.uninstalling');
    case 'Error':
      return t('skillShared.state.error');
  }
};

export const getSkillStateBadgeClass = (state: SkillState['type']) => {
  switch (state) {
    case 'Active':
      return 'theme-badge-accent';
    case 'Installed':
      return 'theme-badge-success';
    case 'Installing':
    case 'Uninstalling':
      return 'theme-badge-warning';
    case 'Error':
      return 'theme-badge-danger';
    case 'Inactive':
    case 'NotInstalled':
    default:
      return 'theme-panel-muted theme-border theme-text-subtle border';
  }
};

export const getSkillStateFilterOptions = (t: TFunction) => {
  return [
    { value: 'all' as const, label: t('skillShared.filters.all') },
    { value: 'active' as const, label: t('skillShared.filters.active') },
    { value: 'installed' as const, label: t('skillShared.filters.installed') },
    { value: 'inactive' as const, label: t('skillShared.filters.inactive') },
    { value: 'error' as const, label: t('skillShared.filters.error') },
  ];
};

export const getSkillSortOptions = (t: TFunction) => {
  return [
    { value: 'name' as const, label: t('skillShared.sort.name') },
    { value: 'version' as const, label: t('skillShared.sort.version') },
    { value: 'status' as const, label: t('skillShared.sort.status') },
    { value: 'author' as const, label: t('skillShared.sort.author') },
  ];
};

export const formatLocalizedNumber = (value: number, language: string) => {
  return new Intl.NumberFormat(language).format(value);
};

export const formatCompactNumber = (value: number, language: string) => {
  return new Intl.NumberFormat(language, {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
};

export const formatFileSize = (bytes: number | undefined, language: string) => {
  if (!bytes) {
    return '-';
  }

  const formatter = new Intl.NumberFormat(language, { maximumFractionDigits: 1 });

  if (bytes < 1024) {
    return `${formatter.format(bytes)} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${formatter.format(bytes / 1024)} KB`;
  }
  return `${formatter.format(bytes / (1024 * 1024))} MB`;
};
