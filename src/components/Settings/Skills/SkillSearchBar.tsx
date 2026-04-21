import React, { useMemo, useState } from 'react';
import { ChevronDown, Filter, Search, Tag, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { getSkillSortOptions, getSkillStateFilterOptions } from '../../Skills/skillUi';

interface SkillSearchBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
  availableTags: string[];
  stateFilter: 'all' | 'active' | 'installed' | 'inactive' | 'error';
  onStateFilterChange: (filter: 'all' | 'active' | 'installed' | 'inactive' | 'error') => void;
  sortBy: 'name' | 'version' | 'status' | 'author';
  onSortChange: (sort: 'name' | 'version' | 'status' | 'author') => void;
  sortOrder: 'asc' | 'desc';
  onSortOrderChange: () => void;
  resultCount: number;
  totalCount: number;
  className?: string;
}

export const SkillSearchBar: React.FC<SkillSearchBarProps> = ({
  searchQuery,
  onSearchChange,
  selectedTags,
  onTagsChange,
  availableTags,
  stateFilter,
  onStateFilterChange,
  sortBy,
  onSortChange,
  sortOrder,
  onSortOrderChange,
  resultCount,
  totalCount,
  className,
}) => {
  const { t } = useTranslation();
  const [showFilter, setShowFilter] = useState(false);
  const [showAllTags, setShowAllTags] = useState(false);

  const stateOptions = useMemo(() => getSkillStateFilterOptions(t), [t]);
  const sortOptions = useMemo(() => getSkillSortOptions(t), [t]);
  const hasActiveFilters = searchQuery.length > 0 || selectedTags.length > 0 || stateFilter !== 'all';
  const visibleTags = showAllTags ? availableTags : availableTags.slice(0, 5);

  const toggleTag = (tag: string) => {
    if (selectedTags.includes(tag)) {
      onTagsChange(selectedTags.filter(item => item !== tag));
    } else {
      onTagsChange([...selectedTags, tag]);
    }
  };

  const clearFilters = () => {
    onSearchChange('');
    onTagsChange([]);
    onStateFilterChange('all');
  };

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[260px] flex-1">
          <Search className="theme-text-subtle pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" size={14} />
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={t('skillsManagement.searchPlaceholder')}
            className="theme-input-surface theme-border theme-text theme-focus-accent w-full rounded-md border py-2.5 pl-9 pr-10 text-sm"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="theme-button-ghost theme-focus-ring-accent absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1"
              title={t('skillsManagement.clearSearch')}
              aria-label={t('skillsManagement.clearSearch')}
            >
              <X size={14} />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => setShowFilter(current => !current)}
          className={cn(
            'theme-focus-ring-accent inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium',
            showFilter || hasActiveFilters ? 'theme-button-primary' : 'theme-button-secondary'
          )}
        >
          <Filter size={14} />
          {t('skillsManagement.filter')}
        </button>

        <div className="theme-text-subtle text-sm">
          {t('skillsManagement.resultsSummary', { resultCount, totalCount })}
        </div>
      </div>

      {showFilter && (
        <div className="theme-panel-muted theme-border space-y-4 rounded-lg border p-4">
          <FilterRow label={t('skillsManagement.filterState')}>
            {stateOptions.map(option => (
              <button
                key={option.value}
                type="button"
                onClick={() => onStateFilterChange(option.value)}
                className={cn(
                  'theme-focus-ring-accent rounded-md px-3 py-1.5 text-sm font-medium',
                  stateFilter === option.value ? 'theme-button-primary' : 'theme-button-secondary'
                )}
              >
                {option.label}
              </button>
            ))}
          </FilterRow>

          <FilterRow label={t('skillsManagement.sortLabel')}>
            {sortOptions.map(option => (
              <button
                key={option.value}
                type="button"
                onClick={() => onSortChange(option.value)}
                className={cn(
                  'theme-focus-ring-accent rounded-md px-3 py-1.5 text-sm font-medium',
                  sortBy === option.value ? 'theme-button-primary' : 'theme-button-secondary'
                )}
              >
                {option.label}
              </button>
            ))}
            <button
              type="button"
              onClick={onSortOrderChange}
              className="theme-button-secondary theme-focus-ring-accent rounded-md px-3 py-1.5 text-sm font-medium"
            >
              {sortOrder === 'asc'
                ? t('skillsManagement.sortOrderAsc')
                : t('skillsManagement.sortOrderDesc')}
            </button>
          </FilterRow>

          <FilterRow label={t('skillsManagement.filterTags')}>
            {visibleTags.map(tag => (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                className={cn(
                  'theme-focus-ring-accent inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium',
                  selectedTags.includes(tag) ? 'theme-button-primary' : 'theme-button-secondary'
                )}
              >
                <Tag size={12} />
                {tag}
              </button>
            ))}
            {availableTags.length > 5 && (
              <button
                type="button"
                onClick={() => setShowAllTags(current => !current)}
                className="theme-button-secondary theme-focus-ring-accent inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium"
              >
                <ChevronDown size={12} className={cn(showAllTags && 'rotate-180')} />
                {showAllTags
                  ? t('skillsManagement.showLessTags')
                  : t('skillsManagement.showMoreTags', {
                      count: availableTags.length - visibleTags.length,
                    })}
              </button>
            )}
          </FilterRow>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="theme-button-ghost theme-focus-ring-accent rounded-md px-2 py-1 text-sm"
            >
              {t('skillsManagement.clearAllFilters')}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

interface TagCloudProps {
  tags: string[];
  selectedTags: string[];
  onTagClick: (tag: string) => void;
  maxTags?: number;
  className?: string;
}

export const TagCloud: React.FC<TagCloudProps> = ({
  tags,
  selectedTags,
  onTagClick,
  maxTags = 20,
  className,
}) => {
  const visibleTags = tags.slice(0, maxTags);

  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {visibleTags.map(tag => (
        <button
          key={tag}
          type="button"
          onClick={() => onTagClick(tag)}
          className={cn(
            'theme-focus-ring-accent rounded-full px-3 py-1.5 text-sm font-medium',
            selectedTags.includes(tag) ? 'theme-button-primary' : 'theme-button-secondary'
          )}
        >
          {tag}
        </button>
      ))}
    </div>
  );
};

interface FilterRowProps {
  label: string;
  children: React.ReactNode;
}

const FilterRow: React.FC<FilterRowProps> = ({ label, children }) => {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="theme-text-subtle text-sm font-medium">{label}</span>
      {children}
    </div>
  );
};
